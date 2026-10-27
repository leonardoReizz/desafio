import "server-only";
import { randomUUID } from "node:crypto";
import {
  AFFECTED_LABEL,
  CATEGORY_LABEL,
  OPEN_STATUSES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Affected,
  type Category,
  type Employee,
  type HandoffReason,
  type QuickReplyOption,
  type Ticket,
  type TicketDraft,
  type TicketSummary,
  type TicketType,
  type TicketView,
} from "@nexo/contracts";
import type { ConversationRepository, StoredConversation } from "../db/conversations";
import { searchKb as searchKbIndex, type KbHit } from "../kb/search";
import { classifyPriority, type PrioritySignals } from "../sla/priority";
import { draftSlaLabel, SLA_TEXT, toTicketView } from "../sla/sla";
import { formatLocalTime } from "../sla/business-time";
import type { TicketsClient } from "../tickets-client/client";
import { findDuplicate } from "./duplicates";
import type { HandoffRequest, TurnRecorder } from "./recorder";

export interface TurnDeps {
  tickets: TicketsClient;
  conversations: ConversationRepository;
  now: () => Date;
}

/** Tudo que uma ação pode tocar. O funcionário vem da sessão — nunca do modelo. */
export interface TurnContext {
  employee: Employee;
  conversation: StoredConversation;
  recorder: TurnRecorder;
  deps: TurnDeps;
}

function summarize(t: TicketView): TicketSummary {
  return {
    id: t.id,
    type: t.type,
    title: t.title,
    category: t.category,
    priority: t.priority,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    sla: t.sla,
  };
}

export async function searchKnowledgeBase(ctx: TurnContext, query: string): Promise<KbHit[]> {
  return ctx.recorder.run("buscar_central_ajuda", "buscou na central de ajuda", async () => {
    const hits = searchKbIndex(query);
    const detail = hits.length
      ? hits.map((h) => `${h.article.id} ${h.article.title} (relevância ${Math.round(h.score * 100)}%)`).join("; ")
      : "nenhum artigo relevante";
    return { result: hits, detail };
  });
}

export async function listMyTickets(ctx: TurnContext, opts: { includeClosed: boolean; showSelection: boolean }): Promise<TicketView[]> {
  const now = ctx.deps.now();
  const views = await ctx.recorder.run("listar_meus_chamados", "consultou seus chamados", async () => {
    const { data, attempts } = await ctx.deps.tickets.listByRequester(ctx.employee.id);
    const all = data.map((t) => toTicketView(t, now));
    const open = all.filter((t) => OPEN_STATUSES.includes(t.status));
    const overdue = open.filter((t) => t.sla.overdue).length;
    return {
      result: opts.includeClosed ? all : open,
      detail: `${open.length} aberto(s)${overdue ? `, ${overdue} com prazo vencido` : ""}; ${all.length - open.length} encerrado(s)`,
      attempts,
    };
  });
  if (opts.showSelection) {
    const selectable = views.filter((t) => OPEN_STATUSES.includes(t.status));
    if (selectable.length > 0) ctx.recorder.blocks.push({ kind: "ticket_select", tickets: selectable.map(summarize) });
  }
  return views;
}

export async function showTicket(ctx: TurnContext, ticketId: string, opts: { card: boolean }): Promise<TicketView> {
  const now = ctx.deps.now();
  const ticket = await ctx.recorder.run("consultar_chamado", `consultou o ${ticketId}`, async () => {
    const { data, attempts } = await ctx.deps.tickets.get(ticketId, ctx.employee.id);
    return { result: data, detail: `${STATUS_LABEL[data.status]} · prioridade ${PRIORITY_LABEL[data.priority].toLowerCase()}`, attempts };
  });
  const view = toTicketView(ticket, now);
  ctx.recorder.note("calcular_prazo", "calculou o prazo", `prazo ${SLA_TEXT[view.priority]} → ${view.sla.label}`);
  if (view.sla.overdue)
    ctx.recorder.rules.add(
      `Prazo de ${SLA_TEXT[view.priority]} para prioridade ${PRIORITY_LABEL[view.priority].toLowerCase()} vencido → oferecer analista`,
    );
  ctx.recorder.focusTicketId = view.id;
  if (opts.card) ctx.recorder.blocks.push({ kind: "ticket_card", ticket: view });
  ctx.deps.conversations.update(ctx.conversation.id, { relatedTicketId: view.id });
  return view;
}

export interface DraftInput {
  mode: "create" | "update" | "reopen";
  targetTicketId: string | null;
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  subcategory: string | null;
  affected: Affected;
  signals: Omit<PrioritySignals, "affected" | "isRequest">;
}

export interface DraftResult {
  draft: TicketDraft;
  /** Quando o código mudou o modo por causa de duplicidade, explica para o modelo/trace. */
  adjustedBecause: string | null;
}

export async function prepareDraft(ctx: TurnContext, input: DraftInput): Promise<DraftResult> {
  const now = ctx.deps.now();
  let mode = input.mode;
  let target = input.targetTicketId;
  let adjustedBecause: string | null = null;

  // Regra "sem duplicidade" — verificada em código antes de qualquer rascunho de criação.
  if (mode === "create") {
    const mine = await ctx.recorder.run("verificar_duplicidade", "verificou chamados parecidos", async () => {
      const { data, attempts } = await ctx.deps.tickets.listByRequester(ctx.employee.id);
      const match = findDuplicate(data, input, now);
      const detail =
        match.kind === "none" ? "nenhum chamado parecido" : `${match.ticket.id} parecido (${Math.round(match.similarity * 100)}%)`;
      return { result: match, detail, attempts };
    });
    if (mine.kind === "open") {
      mode = "update";
      target = mine.ticket.id;
      adjustedBecause = `Já existe o ${mine.ticket.id} aberto sobre o mesmo problema; o rascunho complementa esse chamado em vez de duplicar.`;
      ctx.recorder.rules.add("Sem duplicidade: chamado aberto sobre o mesmo problema é atualizado");
      ctx.recorder.guardrails.add(`Criação convertida em atualização do ${mine.ticket.id}`);
    } else if (mine.kind === "reopenable") {
      mode = "reopen";
      target = mine.ticket.id;
      adjustedBecause = `O ${mine.ticket.id} sobre o mesmo problema foi resolvido há menos de 7 dias; o rascunho reabre esse chamado.`;
      ctx.recorder.rules.add("Chamado resolvido há até 7 dias pode ser reaberto");
      ctx.recorder.guardrails.add(`Criação convertida em reabertura do ${mine.ticket.id}`);
    }
  }

  // Alvo de update/reopen precisa ser do próprio funcionário (o serviço também garante).
  let targetTicket: Ticket | null = null;
  if (target) {
    const id = target;
    targetTicket = await ctx.recorder.run("consultar_chamado", `consultou o ${id}`, async () => {
      const { data, attempts } = await ctx.deps.tickets.get(id, ctx.employee.id);
      return { result: data, detail: STATUS_LABEL[data.status], attempts };
    });
    if (mode === "update" && !OPEN_STATUSES.includes(targetTicket.status)) mode = "reopen";
  }

  const decision = classifyPriority({ ...input.signals, affected: input.affected, isRequest: input.type === "REQ" });
  ctx.recorder.note(
    "classificar_prioridade",
    "classificou a prioridade",
    `impacto: ${AFFECTED_LABEL[input.affected].toLowerCase()}; impede trabalho: ${input.signals.blocksWork ? "sim" : "não"}; compromisso hoje: ${input.signals.sameDayCommitment ? "sim" : "não"}; alternativa: ${input.signals.hasWorkaround ? "sim" : "não"} → ${PRIORITY_LABEL[decision.priority]}`,
  );
  ctx.recorder.rules.add(decision.rule);
  const slaLabel = draftSlaLabel(decision.priority, now);
  ctx.recorder.note("consultar_sla", "consultou o SLA", `${SLA_TEXT[decision.priority]} → ${slaLabel}`);

  // Um novo rascunho substitui o pendente anterior (o card antigo passa a "cancelado").
  const previous = ctx.deps.conversations.pendingDraft(ctx.conversation.id);
  if (previous) {
    ctx.deps.conversations.cancelPendingDrafts(ctx.conversation.id);
    refreshDraftCard(ctx, { ...previous, status: "cancelled" });
  }

  const draft: TicketDraft = {
    // Id global e também a Idempotency-Key no legado: precisa ser único.
    id: `D-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`,
    mode,
    targetTicketId: target,
    type: targetTicket?.type ?? input.type,
    title: mode === "create" ? input.title : (targetTicket?.title ?? input.title),
    description: input.description,
    category: targetTicket?.category ?? input.category,
    subcategory: input.subcategory ?? targetTicket?.subcategory ?? null,
    // Em update, só sobe a prioridade (nunca rebaixa por um complemento).
    priority: targetTicket && rank(targetTicket.priority) > rank(decision.priority) ? targetTicket.priority : decision.priority,
    affected: input.affected,
    slaLabel,
    status: "pending",
    resultTicketId: null,
  };
  ctx.deps.conversations.saveDraft(ctx.conversation.id, ctx.employee.id, draft);
  ctx.recorder.note(
    "montar_rascunho",
    "montou o rascunho",
    `${draft.id} · ${modeLabel(draft)} · ${CATEGORY_LABEL[draft.category]} · ${PRIORITY_LABEL[draft.priority]}`,
  );
  ctx.recorder.rules.add("Rascunho mostrado; criação só após confirmação do funcionário");
  ctx.recorder.blocks.push({ kind: "draft", draft });
  return { draft, adjustedBecause };
}

const PRIORITY_RANK = { baixa: 0, media: 1, alta: 2, critica: 3 } as const;
function rank(p: keyof typeof PRIORITY_RANK): number {
  return PRIORITY_RANK[p];
}

function modeLabel(d: TicketDraft): string {
  return d.mode === "create" ? "novo chamado" : d.mode === "update" ? `atualizar ${d.targetTicketId}` : `reabrir ${d.targetTicketId}`;
}

export class DraftNotPendingError extends Error {}

/** Executa o rascunho no sistema de chamados. Só é chamado após confirmação explícita. */
export async function confirmDraft(ctx: TurnContext, draftId: string): Promise<{ draft: TicketDraft; ticket: TicketView }> {
  const draft = ctx.deps.conversations.getDraft(draftId, ctx.conversation.id, ctx.employee.id);
  if (!draft || draft.status !== "pending") throw new DraftNotPendingError("Rascunho não está pendente");
  const now = ctx.deps.now();
  const author = { author: "funcionario" as const, authorName: ctx.employee.name };

  const ticket = await ctx.recorder.run(
    draft.mode === "create" ? "criar_chamado" : "atualizar_chamado",
    draft.mode === "create"
      ? "criou o chamado"
      : draft.mode === "update"
        ? `atualizou o ${draft.targetTicketId}`
        : `reabriu o ${draft.targetTicketId}`,
    async () => {
      if (draft.mode === "create") {
        const { data, attempts } = await ctx.deps.tickets.create(
          {
            type: draft.type,
            title: draft.title,
            description: draft.description,
            category: draft.category,
            subcategory: draft.subcategory,
            priority: draft.priority,
            affected: draft.affected,
            requesterId: ctx.employee.id,
          },
          draft.id, // idempotency key: retry/duplo clique nunca cria dois chamados
        );
        return { result: data, detail: `${data.id} · ${PRIORITY_LABEL[data.priority]}`, attempts };
      }
      if (!draft.targetTicketId) throw new DraftNotPendingError("Rascunho sem chamado alvo");
      const { data, attempts } = await ctx.deps.tickets.addUpdate(
        draft.targetTicketId,
        ctx.employee.id,
        { ...author, text: draft.description, reopen: draft.mode === "reopen", priority: draft.priority },
        draft.id,
      );
      return { result: data, detail: `${data.id} · ${STATUS_LABEL[data.status]}`, attempts };
    },
  );

  const confirmed: TicketDraft = { ...draft, status: "confirmed", resultTicketId: ticket.id };
  ctx.deps.conversations.saveDraft(ctx.conversation.id, ctx.employee.id, confirmed);
  refreshDraftCard(ctx, confirmed);
  ctx.deps.conversations.update(ctx.conversation.id, { relatedTicketId: ticket.id });
  ctx.recorder.focusTicketId = ticket.id;
  ctx.recorder.guardrails.add("Confirmação explícita do funcionário verificada antes de gravar");
  return { draft: confirmed, ticket: toTicketView(ticket, now) };
}

export function cancelDraft(ctx: TurnContext, draftId: string): TicketDraft {
  const draft = ctx.deps.conversations.getDraft(draftId, ctx.conversation.id, ctx.employee.id);
  if (!draft || draft.status !== "pending") throw new DraftNotPendingError("Rascunho não está pendente");
  const cancelled: TicketDraft = { ...draft, status: "cancelled" };
  ctx.deps.conversations.saveDraft(ctx.conversation.id, ctx.employee.id, cancelled);
  refreshDraftCard(ctx, cancelled);
  ctx.recorder.note("cancelar_rascunho", "cancelou o rascunho", draft.id);
  return cancelled;
}

/** Atualiza o card do rascunho na mensagem original para refletir confirmado/cancelado. */
function refreshDraftCard(ctx: TurnContext, draft: TicketDraft): void {
  const msg = ctx.deps.conversations.findMessageWithDraft(ctx.conversation.id, draft.id);
  if (!msg) return;
  ctx.deps.conversations.updateMessageBlocks(
    msg.id,
    msg.blocks.map((b) => (b.kind === "draft" && b.draft.id === draft.id ? { kind: "draft", draft } : b)),
  );
}

export function offerOptions(ctx: TurnContext, question: string | null, options: QuickReplyOption[]): void {
  ctx.recorder.blocks.push({ kind: "quick_replies", question, options: options.slice(0, 5) });
}

export function requestHandoff(
  ctx: TurnContext,
  reason: HandoffReason,
  summary: string,
  ticketId: string | null,
  critical = false,
): HandoffRequest {
  const team: "N1" | "N2" = critical || reason === "chamado_vencido" || reason === "baixa_confianca" ? "N2" : "N1";
  const req: HandoffRequest = {
    reason,
    summary,
    team,
    ticketId: ticketId ?? ctx.recorder.focusTicketId ?? ctx.conversation.relatedTicketId,
  };
  ctx.recorder.handoff = req;
  ctx.recorder.rules.add(
    {
      pedido_do_funcionario: "Transferência: o funcionário pediu um analista",
      caso_critico: "Transferência: caso crítico",
      chamado_vencido: "Transferência: chamado com prazo vencido",
      baixa_confianca: "Transferência: agent sem segurança sobre o que fazer",
    }[reason],
  );
  return req;
}

/**
 * Aplica a transferência: estado da conversa, chamado no legado e divisor de sistema.
 * A partir daqui o agent fica pausado (agentMayRespond = false).
 */
export async function applyHandoff(ctx: TurnContext, req: HandoffRequest): Promise<string> {
  const now = ctx.deps.now();
  if (req.ticketId) {
    const ticketId = req.ticketId;
    try {
      await ctx.recorder.run("transferir_chamado", `transferiu o ${ticketId}`, async () => {
        const { data, attempts } = await ctx.deps.tickets.transfer(ticketId, ctx.employee.id, { team: req.team, summary: req.summary });
        return { result: data, detail: `Suporte ${req.team}`, attempts };
      });
    } catch {
      // A conversa é transferida mesmo se o legado falhar ou o chamado não estiver aberto:
      // o analista recebe o resumo no console. A falha já ficou registrada no step.
      ctx.recorder.guardrails.add("Chamado não atualizado no legado; transferência mantida pelo console");
    }
  }
  ctx.recorder.note("transferir_conversa", "chamou um analista", `Suporte ${req.team} · ${req.reason}`);
  ctx.deps.conversations.update(ctx.conversation.id, {
    status: "waiting_human",
    handoffReason: req.reason,
    handoffSummary: req.summary,
    handoffAt: now.toISOString(),
    relatedTicketId: req.ticketId ?? ctx.conversation.relatedTicketId,
  });
  const eta = req.team === "N2" && req.reason === "caso_critico" ? "em até 1 hora" : "em até 2 h úteis";
  ctx.recorder.blocks.push({ kind: "handoff", team: req.team, etaLabel: eta, reason: req.reason });
  ctx.deps.conversations.addMessage(ctx.conversation.id, {
    role: "system",
    text: `Transferida para Suporte ${req.team} · ${formatLocalTime(now)}`,
  });
  return eta;
}

export function overdueOfferOptions(): QuickReplyOption[] {
  return [
    { label: "Falar com um analista", value: "falar_com_analista" },
    { label: "Adicionar informação", value: "adicionar_informacao" },
    { label: "Não, obrigado", value: "nao_obrigado" },
  ];
}

export function buildHandoffSummary(ctx: TurnContext, reason: HandoffReason, recent: readonly { role: string; text: string }[]): string {
  const ticket = ctx.recorder.focusTicketId ?? ctx.conversation.relatedTicketId;
  const lastUser = recent
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => `“${m.text}”`)
    .join(" ");
  const why = {
    pedido_do_funcionario: "Funcionário pediu para falar com um analista.",
    caso_critico: "Caso crítico.",
    chamado_vencido: "Chamado com prazo vencido.",
    baixa_confianca: "Agent sem segurança para decidir.",
  }[reason];
  return [why, ticket ? `Chamado: ${ticket}.` : null, lastUser ? `Últimas mensagens: ${lastUser}` : null].filter(Boolean).join(" ");
}
