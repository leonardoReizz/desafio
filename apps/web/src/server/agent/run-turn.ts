import "server-only";
import {
  MAX_USER_MESSAGES_PER_SESSION,
  type ChatMessage,
  type ChatStreamEvent,
  type DecisionTrace,
  type Employee,
  type SendMessageInput,
  type UiBlock,
} from "@nexo/contracts";
import type { StoredConversation } from "../db/conversations";
import { formatLocalDate, formatLocalTime } from "../sla/business-time";
import { TicketServiceError, TicketServiceUnavailableError } from "../tickets-client/client";
import {
  applyHandoff,
  buildHandoffSummary,
  cancelDraft,
  confirmDraft,
  DraftNotPendingError,
  overdueOfferOptions,
  requestHandoff,
  showTicket,
  type TurnContext,
  type TurnDeps,
} from "./actions";
import { asksForHuman, isExplicitCancel, isExplicitConfirmation } from "./intents";
import { LlmNotConfiguredError, type AgentDecision, type AgentRunner, type LlmMessage } from "./llm";
import { TurnRecorder } from "./recorder";
import { createAgentTools } from "./tools";
import { agentMayRespond } from "../conversations/state";

/** Abaixo disso o agent não decide sozinho: chama um analista (Anexo A, "sem segurança"). */
export const CONFIDENCE_THRESHOLD = 0.55;
const HISTORY_WINDOW = 12;

export type Emit = (event: ChatStreamEvent) => void;

export interface TurnInput {
  employee: Employee;
  conversationId: string | null;
  text: string;
  action: SendMessageInput["action"];
}

export interface TurnOptions {
  deps: TurnDeps;
  runner: AgentRunner;
  emit: Emit;
  signal: AbortSignal;
  /** Retorna false quando o orçamento diário de LLM acabou (proteção de custo em deploy público). */
  consumeLlmBudget: () => boolean;
  recordUsage: (usage: { inputTokens: number; outputTokens: number }) => void;
}

interface Decision {
  intent: DecisionTrace["intent"];
  understood: string;
  action: DecisionTrace["action"];
  confidence: number;
  rationale: string;
  rules: string[];
  text: string;
}

export async function runEmployeeTurn(input: TurnInput, opts: TurnOptions): Promise<void> {
  const { deps, emit } = opts;
  const started = Date.now();

  // 1. Conversa: só a do próprio funcionário; encerrada → começa outra.
  let conversation: StoredConversation | null = input.conversationId
    ? deps.conversations.getOwned(input.conversationId, input.employee.id)
    : null;
  if (input.conversationId && !conversation) {
    emit({ type: "error", code: "conversation_not_found", message: "Conversa não encontrada." });
    return;
  }
  if (!conversation || conversation.status === "closed") conversation = deps.conversations.create(input.employee.id);

  // 2. Limite de mensagens por sessão (PRD).
  if (conversation.userMessageCount >= MAX_USER_MESSAGES_PER_SESSION) {
    emit({ type: "error", code: "message_limit", message: `Limite de ${MAX_USER_MESSAGES_PER_SESSION} mensagens nesta sessão atingido.` });
    return;
  }

  // 3. Grava a mensagem do funcionário.
  const userMessage = deps.conversations.addMessage(conversation.id, { role: "user", text: input.text });
  emit({ type: "user_message", message: userMessage });
  conversation = deps.conversations.get(conversation.id)!;

  // 4. Com analista: o agent não responde (Anexo A). O analista vê a mensagem no console.
  if (!agentMayRespond(conversation.status)) {
    emit({ type: "conversation", conversation });
    emit({ type: "done" });
    return;
  }

  const recorder = new TurnRecorder((step) => emit({ type: "step", step }));
  const ctx: TurnContext = { employee: input.employee, conversation, recorder, deps };

  let decision: Decision;
  let model = "regras (sem LLM)";
  let usage: DecisionTrace["usage"] = null;
  try {
    const routed = await deterministicRoute(ctx, input);
    if (routed) {
      decision = routed;
    } else if (!opts.consumeLlmBudget()) {
      recorder.guardrails.add("Orçamento diário de LLM da demonstração esgotado");
      decision = {
        intent: "conversa",
        understood: "Mensagem livre do funcionário",
        action: "respondeu",
        confidence: 1,
        rationale: "Limite diário de uso do modelo atingido; respostas por regras continuam funcionando.",
        rules: [],
        text: "O limite diário de uso do assistente nesta demonstração foi atingido. Você ainda pode consultar seus chamados ou falar com um analista.",
      };
      recorder.blocks.push({
        kind: "quick_replies",
        question: null,
        options: [{ label: "Falar com um analista", value: "falar_com_analista" }],
      });
    } else {
      const result = await runLlm(ctx, input, opts);
      decision = result.decision;
      model = result.model;
      usage = result.usage;
    }
  } catch (e) {
    decision = failureDecision(ctx, e);
  }

  // 5. Pós-checagens em código.
  if (decision.confidence < CONFIDENCE_THRESHOLD && !recorder.handoff) {
    recorder.guardrails.add(
      `Confiança ${Math.round(decision.confidence * 100)}% abaixo de ${CONFIDENCE_THRESHOLD * 100}% → analista chamado`,
    );
    const recent = deps.conversations.recentMessages(conversation.id, 6);
    requestHandoff(ctx, "baixa_confianca", buildHandoffSummary(ctx, "baixa_confianca", recent), null);
    decision = {
      ...decision,
      action: "transferiu",
      text: `${decision.text}\n\nComo não tenho certeza do melhor caminho, vou chamar um analista para isso.`.trim(),
    };
  }
  if (recorder.handoff) {
    const eta = await applyHandoff(ctx, recorder.handoff);
    if (decision.action !== "transferiu") decision = { ...decision, action: "transferiu" };
    if (!/analista/i.test(decision.text))
      decision.text =
        `${decision.text}\n\nEncaminhei para o Suporte ${recorder.handoff.team}. Um analista vai falar com você ${eta}.`.trim();
  }

  // 6. Persiste a resposta com o trace completo.
  const trace: DecisionTrace = {
    intent: decision.intent,
    understood: decision.understood,
    action: decision.action,
    confidence: decision.confidence,
    rationale: decision.rationale,
    rulesApplied: [...new Set([...recorder.rules, ...decision.rules])],
    steps: recorder.steps,
    guardrails: [...recorder.guardrails],
    model,
    latencyMs: Date.now() - started,
    usage,
  };
  const agentMessage: ChatMessage = deps.conversations.addMessage(conversation.id, {
    role: "agent",
    text: decision.text,
    authorName: "Nexo Assist",
    blocks: orderBlocks(recorder.blocks),
    trace,
  });
  deps.conversations.update(conversation.id, { lastConfidence: decision.confidence });
  emit({ type: "agent_message", message: agentMessage });
  emit({ type: "conversation", conversation: deps.conversations.get(conversation.id)! });
  emit({ type: "done" });
}

/** Cards antes das opções rápidas, como no protótipo. */
function orderBlocks(blocks: UiBlock[]): UiBlock[] {
  const order: Record<UiBlock["kind"], number> = { ticket_select: 0, ticket_card: 1, draft: 2, handoff: 3, quick_replies: 4 };
  return [...blocks].sort((a, b) => order[a.kind] - order[b.kind]);
}

/**
 * Ações estruturadas da interface e respostas inequívocas não precisam de LLM:
 * mais rápidas, sem custo, e 100% previsíveis.
 */
async function deterministicRoute(ctx: TurnContext, input: TurnInput): Promise<Decision | null> {
  const { deps, recorder, conversation } = ctx;
  const action = input.action;

  if (action?.kind === "select_ticket") {
    const t = await showTicket(ctx, action.ticketId, { card: true });
    if (t.sla.overdue) {
      recorder.blocks.push({ kind: "quick_replies", question: null, options: overdueOfferOptions() });
      const since = t.lastServiceUpdateAt ?? t.createdAt;
      const days = Math.max(1, Math.floor((deps.now().getTime() - Date.parse(since)) / 86_400_000));
      return {
        intent: "consultar_chamado",
        understood: `Quer saber o status do ${t.id}`,
        action: "mostrou_chamado",
        confidence: 1,
        rationale: `O ${t.id} está sem atualização há ${days} dias, acima do prazo da prioridade ${t.priority}. Pela regra de transferência, chamado vencido justifica oferecer um analista.`,
        rules: [],
        text: `Está sem atualização há ${days} dias, acima do prazo para prioridade ${t.priority === "media" ? "média" : t.priority}. Quer que eu chame um analista?`,
      };
    }
    return {
      intent: "consultar_chamado",
      understood: `Quer saber o status do ${t.id}`,
      action: "mostrou_chamado",
      confidence: 1,
      rationale: "Seleção feita na lista de chamados; o chamado está dentro do prazo.",
      rules: [],
      text: `Está dentro do prazo (${t.sla.label}). Quer complementar com alguma informação?`,
    };
  }

  const wantsHuman = (action?.kind === "quick_reply" && action.value === "falar_com_analista") || asksForHuman(input.text);
  if (wantsHuman) {
    const recent = deps.conversations.recentMessages(conversation.id, 6);
    const focus = conversation.relatedTicketId;
    let reason: "pedido_do_funcionario" | "chamado_vencido" = "pedido_do_funcionario";
    if (focus) {
      try {
        const t = await showTicket(ctx, focus, { card: false });
        if (t.sla.overdue) reason = "chamado_vencido";
      } catch {
        // sem detalhe do chamado, segue como pedido do funcionário
      }
    }
    requestHandoff(ctx, reason, buildHandoffSummary(ctx, reason, recent), focus, false);
    return {
      intent: "falar_com_analista",
      understood: "Quer falar com um analista",
      action: "transferiu",
      confidence: 1,
      rationale: "Pedido explícito de atendimento humano — a regra de transferência se aplica sempre que o funcionário pede.",
      rules: [],
      text: `Encaminhei para o Suporte ${recorder.handoff?.team ?? "N1"}. Um analista vai falar com você em breve.`,
    };
  }

  const pending = deps.conversations.pendingDraft(conversation.id);
  const uiConfirm = action?.kind === "quick_reply" && action.value === "confirmar_rascunho";
  const uiCancel = action?.kind === "quick_reply" && action.value === "cancelar_rascunho";
  if ((uiConfirm || uiCancel) && !pending) throw new DraftNotPendingError("Rascunho não está pendente");
  if (pending && (uiConfirm || (!uiCancel && isExplicitConfirmation(input.text)))) {
    const { ticket, draft } = await confirmDraft(ctx, pending.id);
    const verb = draft.mode === "create" ? "abri o chamado" : draft.mode === "update" ? "atualizei o chamado" : "reabri o chamado";
    const critical = ticket.priority === "critica";
    if (critical) {
      requestHandoff(ctx, "caso_critico", `Chamado crítico ${ticket.id}: ${ticket.title}. ${ticket.description}`, ticket.id, true);
    }
    return {
      intent: "confirmar_ou_ajustar",
      understood: "Confirmou o rascunho",
      action: draft.mode === "create" ? "criou_chamado" : draft.mode === "update" ? "atualizou_chamado" : "reabriu_chamado",
      confidence: 1,
      rationale: "Confirmação explícita do funcionário com rascunho pendente — gravado sem precisar do modelo.",
      rules: ["Chamado só é criado/atualizado após confirmação do funcionário"],
      text: `Pronto: ${verb} ${ticket.id} com prioridade ${ticket.priority === "media" ? "média" : ticket.priority === "critica" ? "crítica" : ticket.priority}. Prazo: ${ticket.sla.label}.`,
    };
  }
  if (pending && (uiCancel || isExplicitCancel(input.text))) {
    cancelDraft(ctx, pending.id);
    return {
      intent: "confirmar_ou_ajustar",
      understood: "Não quer seguir com o rascunho",
      action: "respondeu",
      confidence: 1,
      rationale: "Cancelamento explícito com rascunho pendente.",
      rules: [],
      text: "Tudo bem, cancelei o rascunho. Posso ajudar com mais alguma coisa?",
    };
  }
  return null;
}

async function runLlm(
  ctx: TurnContext,
  input: TurnInput,
  opts: TurnOptions,
): Promise<{ decision: Decision; model: string; usage: DecisionTrace["usage"] }> {
  const history = ctx.deps.conversations.recentMessages(ctx.conversation.id, HISTORY_WINDOW);
  const messages = toLlmMessages(history, contextBlock(ctx));
  const tools = createAgentTools(ctx, input.text);
  const result = await opts.runner.run({
    messages,
    tools,
    onReplyDelta: (delta) => opts.emit({ type: "text_delta", delta }),
    signal: opts.signal,
  });
  if (result.usage) opts.recordUsage(result.usage);

  const d: AgentDecision | null = result.decision;
  if (!d) {
    ctx.recorder.guardrails.add("Saída estruturada inválida do modelo → confiança reduzida");
    return {
      decision: {
        intent: "conversa",
        understood: "Não foi possível estruturar a decisão",
        action: "respondeu",
        confidence: 0.3,
        rationale: "O modelo não devolveu a decisão no formato esperado.",
        rules: [],
        text: result.fallbackText || "Desculpe, não consegui processar sua mensagem.",
      },
      model: result.model,
      usage: result.usage,
    };
  }
  return {
    decision: {
      intent: d.intencao,
      understood: d.entendimento,
      action: d.acao,
      confidence: d.confianca,
      rationale: d.justificativa,
      rules: d.regras,
      text: d.resposta,
    },
    model: result.model,
    usage: result.usage,
  };
}

function failureDecision(ctx: TurnContext, e: unknown): Decision {
  const base = { intent: "conversa" as const, understood: "—", rules: [] as string[] };
  if (e instanceof TicketServiceUnavailableError) {
    ctx.recorder.guardrails.add("Sistema de chamados indisponível: nenhuma alteração foi feita");
    ctx.recorder.blocks.push({
      kind: "quick_replies",
      question: null,
      options: [
        { label: "Tentar de novo", value: "tentar_de_novo" },
        { label: "Falar com um analista", value: "falar_com_analista" },
      ],
    });
    return {
      ...base,
      action: "respondeu",
      confidence: 1,
      rationale: "O legado não respondeu após as tentativas; informamos com transparência.",
      text: "O sistema de chamados está instável agora e não consegui concluir. Nada foi alterado — pode tentar de novo em instantes.",
    };
  }
  if (e instanceof DraftNotPendingError) {
    return {
      ...base,
      action: "respondeu",
      confidence: 1,
      rationale: "O rascunho já tinha sido confirmado ou cancelado.",
      text: "Esse rascunho já foi confirmado ou cancelado.",
    };
  }
  if (e instanceof TicketServiceError && e.status === 404) {
    return {
      ...base,
      action: "respondeu",
      confidence: 1,
      rationale: "Chamado não pertence ao funcionário ou não existe.",
      text: "Não encontrei esse chamado entre os seus.",
    };
  }
  if (e instanceof LlmNotConfiguredError) {
    ctx.recorder.guardrails.add("Modelo de linguagem não configurado (FAL_KEY ou ANTHROPIC_API_KEY)");
  } else {
    console.error("[agent] falha no turno", e instanceof Error ? e.message : "erro desconhecido");
    ctx.recorder.guardrails.add("Falha ao consultar o modelo de linguagem");
  }
  ctx.recorder.blocks.push({
    kind: "quick_replies",
    question: null,
    options: [{ label: "Falar com um analista", value: "falar_com_analista" }],
  });
  // Confiança alta de propósito: a falha é técnica, não de entendimento; não transfere sozinho.
  return {
    ...base,
    action: "respondeu",
    confidence: 1,
    rationale: "Falha técnica no assistente; oferecemos um analista.",
    text: "Tive um problema para processar sua mensagem agora. Pode tentar de novo ou falar com um analista.",
  };
}

function contextBlock(ctx: TurnContext): string {
  const now = ctx.deps.now();
  const pending = ctx.deps.conversations.pendingDraft(ctx.conversation.id);
  const weekday = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][new Date(now.getTime() - 3 * 3_600_000).getUTCDay()];
  return [
    "<contexto_do_sistema>",
    `agora: ${weekday} ${formatLocalDate(now)} ${formatLocalTime(now)} (Brasília)`,
    `funcionario: ${ctx.employee.name} · ${ctx.employee.department}`,
    `rascunho_pendente: ${pending ? `${pending.id} (${pending.mode}${pending.targetTicketId ? ` ${pending.targetTicketId}` : ""}) "${pending.title}"` : "nenhum"}`,
    `chamado_em_foco: ${ctx.conversation.relatedTicketId ?? "nenhum"}`,
    "</contexto_do_sistema>",
  ].join("\n");
}

/** Converte o histórico para o modelo, com os cards resumidos (o modelo precisa saber o que o usuário viu). */
export function toLlmMessages(history: readonly ChatMessage[], context: string): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (const m of history) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      out.push({ role: "user", content: m.text });
      continue;
    }
    const prefix = m.role === "analyst" ? `[Analista ${m.authorName ?? ""}] ` : "";
    const cards = m.blocks.map(describeBlock).filter(Boolean).join("; ");
    out.push({ role: "assistant", content: `${prefix}${m.text}${cards ? `\n[exibido: ${cards}]` : ""}` });
  }
  // Mensagens consecutivas do mesmo papel são aceitas; a primeira precisa ser do usuário.
  while (out[0]?.role === "assistant") out.shift();
  const last = out.at(-1);
  if (last?.role === "user") last.content = `${last.content}\n\n${context}`;
  return out;
}

function describeBlock(b: UiBlock): string {
  switch (b.kind) {
    case "quick_replies":
      return `opções: ${b.options.map((o) => o.label).join(" / ")}`;
    case "ticket_select":
      return `seleção de chamados: ${b.tickets.map((t) => t.id).join(", ")}`;
    case "ticket_card":
      return `card ${b.ticket.id} (${b.ticket.status}, ${b.ticket.sla.label})`;
    case "draft":
      return `rascunho ${b.draft.id} ${b.draft.status} (${b.draft.mode}) "${b.draft.title}" prioridade ${b.draft.priority}`;
    case "handoff":
      return `transferido para Suporte ${b.team}`;
  }
}
