import { beforeEach, describe, expect, it } from "vitest";
import type { ChatStreamEvent, Employee } from "@nexo/contracts";
// Integração real com o serviço de chamados (em memória), atravessando a fronteira HTTP.
import { createApp } from "../../../../../services/tickets/src/app";
import { openDatabase, TicketRepository } from "../../../../../services/tickets/src/repository";
import { buildSeedTickets } from "../../../../../services/tickets/src/seed-data";
import { openAppDatabase } from "../db/client";
import { ConversationRepository } from "../db/conversations";
import { TicketsClient } from "../tickets-client/client";
import type { AgentDecision, AgentRunner } from "./llm";
import { runEmployeeTurn, type TurnOptions } from "./run-turn";

const NOW = new Date("2026-10-21T13:05:00.000Z"); // qua 10:05 em Brasília
const ana: Employee = { id: "emp_ana", name: "Ana Souza", email: "ana.souza@nexo.com.br", department: "Financeiro", passwordChangedAt: NOW.toISOString() };

type ToolMap = Parameters<AgentRunner["run"]>[0]["tools"];
type Script = (tools: ToolMap) => Promise<AgentDecision>;

function fakeRunner(script: Script): AgentRunner & { calls: number } {
  const runner = {
    calls: 0,
    async run({ tools }: Parameters<AgentRunner["run"]>[0]) {
      runner.calls++;
      return { decision: await script(tools), fallbackText: "", usage: { inputTokens: 100, outputTokens: 20 }, model: "fake" };
    },
  };
  return runner;
}

const decision = (d: Partial<AgentDecision>): AgentDecision => ({
  resposta: "ok",
  intencao: "conversa",
  entendimento: "—",
  acao: "respondeu",
  justificativa: "—",
  regras: [],
  confianca: 0.9,
  ...d,
});

/** Chama o execute da tool como o Mastra chamaria. */
async function call(tools: ToolMap, name: keyof ToolMap, input: unknown): Promise<unknown> {
  const tool = tools[name] as unknown as { execute: (i: unknown, c: unknown) => Promise<unknown> };
  return tool.execute(input, {});
}

function setup(failureRate = 0) {
  const ticketRepo = new TicketRepository(openDatabase(":memory:"), () => NOW);
  for (const t of buildSeedTickets(NOW)) ticketRepo.insertRaw(t);
  const app = createApp({ repo: ticketRepo, token: "tok-1234567890abcdef", failureRate, latencyMs: 0 });
  const tickets = new TicketsClient({
    baseUrl: "http://tickets",
    token: "tok-1234567890abcdef",
    fetchImpl: (input, init) => Promise.resolve(app.request(String(input).replace("http://tickets", ""), init)),
    sleep: async () => {},
  });
  const conversations = new ConversationRepository(openAppDatabase(":memory:"), () => NOW);
  const events: ChatStreamEvent[] = [];
  const opts = (runner: AgentRunner): TurnOptions => ({
    deps: { tickets, conversations, now: () => NOW },
    runner,
    emit: (e) => events.push(e),
    signal: new AbortController().signal,
    consumeLlmBudget: () => true,
    recordUsage: () => {},
  });
  const lastAgent = () => [...events].reverse().find((e): e is Extract<ChatStreamEvent, { type: "agent_message" }> => e.type === "agent_message")?.message;
  const conversationId = () => events.find((e): e is Extract<ChatStreamEvent, { type: "user_message" }> => e.type === "user_message")!.message.conversationId;
  return { conversations, ticketRepo, events, opts, lastAgent, conversationId };
}

describe("runEmployeeTurn", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("seleção de chamado vencido não usa LLM e oferece analista", async () => {
    const runner = fakeRunner(async () => decision({}));
    await runEmployeeTurn({ employee: ana, conversationId: null, text: "INC-20311 · Notebook lento", action: { kind: "select_ticket", ticketId: "INC-20311" } }, s.opts(runner));
    const msg = s.lastAgent()!;
    expect(runner.calls).toBe(0);
    expect(msg.blocks.map((b) => b.kind)).toEqual(["ticket_card", "quick_replies"]);
    expect(msg.trace?.steps.map((st) => st.label)).toEqual(["consultou o INC-20311", "calculou o prazo"]);
    expect(msg.trace?.rulesApplied.join(" ")).toMatch(/vencido/);
  });

  it("não deixa o funcionário ver chamado de outra pessoa", async () => {
    const runner = fakeRunner(async (tools) => {
      const r = (await call(tools, "consultar_chamado", { chamado: "INC-20322", mostrarCard: true })) as { ok?: boolean; erro?: string };
      expect(r.ok).toBe(false);
      return decision({ resposta: "Não encontrei esse chamado entre os seus." });
    });
    await runEmployeeTurn({ employee: ana, conversationId: null, text: "status do INC-20322", action: null }, s.opts(runner));
    expect(s.lastAgent()!.blocks).toEqual([]);
  });

  it("rascunho só vira chamado após confirmação explícita", async () => {
    const draftRunner = fakeRunner(async (tools) => {
      await call(tools, "preparar_rascunho", {
        modo: "create",
        chamadoAlvo: null,
        tipo: "INC",
        titulo: "VPN não conecta no notebook — erro 809",
        descricao: "Desde ontem a VPN mostra erro 809 no Windows 11. Precisa para reunião às 14h.",
        categoria: "rede_vpn",
        subcategoria: null,
        afetados: "so_eu",
        sinais: { impedeTrabalho: true, compromissoHoje: true, temAlternativa: false },
      });
      // O modelo tenta gravar sem confirmação: o guardrail bloqueia.
      const r = (await call(tools, "confirmar_rascunho", { rascunho: "qualquer" })) as { ok: boolean };
      expect(r.ok).toBe(false);
      return decision({ intencao: "abrir_chamado", acao: "montou_rascunho", resposta: "Confira antes de eu criar:" });
    });
    await runEmployeeTurn({ employee: ana, conversationId: null, text: "Só eu. Tenho reunião às 14h.", action: null }, s.opts(draftRunner));
    const draftMsg = s.lastAgent()!;
    const draftBlock = draftMsg.blocks.find((b) => b.kind === "draft");
    expect(draftBlock?.kind === "draft" && draftBlock.draft.priority).toBe("alta");
    expect(draftMsg.trace?.guardrails.join(" ")).toMatch(/sem confirmação/);
    const before = s.ticketRepo.listByRequester("emp_ana").length;

    // "sim" confirma sem chamar o LLM.
    const confirmRunner = fakeRunner(async () => decision({}));
    await runEmployeeTurn({ employee: ana, conversationId: s.conversationId(), text: "sim, pode criar", action: null }, s.opts(confirmRunner));
    expect(confirmRunner.calls).toBe(0);
    expect(s.ticketRepo.listByRequester("emp_ana").length).toBe(before + 1);
    expect(s.lastAgent()!.trace?.action).toBe("criou_chamado");
    // O card original passa a "confirmado".
    const updated = s.conversations.getMessage(draftMsg.id)!;
    const card = updated.blocks.find((b) => b.kind === "draft");
    expect(card?.kind === "draft" && card.draft.status).toBe("confirmed");
  });

  it("converte criação duplicada em atualização do chamado aberto", async () => {
    const runner = fakeRunner(async (tools) => {
      await call(tools, "preparar_rascunho", {
        modo: "create",
        chamadoAlvo: null,
        tipo: "INC",
        titulo: "Notebook lento depois da atualização do Windows",
        descricao: "Continua muito lento, demora 5 minutos para abrir o Excel.",
        categoria: "hardware",
        subcategoria: "Notebook",
        afetados: "so_eu",
        sinais: { impedeTrabalho: false, compromissoHoje: false, temAlternativa: true },
      });
      return decision({ acao: "montou_rascunho" });
    });
    await runEmployeeTurn({ employee: ana, conversationId: null, text: "meu notebook continua lento", action: null }, s.opts(runner));
    const block = s.lastAgent()!.blocks.find((b) => b.kind === "draft");
    expect(block?.kind === "draft" && block.draft.mode).toBe("update");
    expect(block?.kind === "draft" && block.draft.targetTicketId).toBe("INC-20311");
  });

  it("baixa confiança transfere para analista e pausa o agent", async () => {
    const runner = fakeRunner(async () => decision({ confianca: 0.41, resposta: "Não tenho certeza." }));
    await runEmployeeTurn({ employee: ana, conversationId: null, text: "a coisa lá não tá indo", action: null }, s.opts(runner));
    const conv = s.conversations.get(s.conversationId())!;
    expect(conv.status).toBe("waiting_human");
    expect(conv.handoffReason).toBe("baixa_confianca");
    expect(s.lastAgent()!.trace?.guardrails.join(" ")).toMatch(/41%/);

    // Com a conversa aguardando analista, o agent não responde.
    const second = fakeRunner(async () => decision({}));
    const countBefore = s.events.filter((e) => e.type === "agent_message").length;
    await runEmployeeTurn({ employee: ana, conversationId: conv.id, text: "alô?", action: null }, s.opts(second));
    expect(second.calls).toBe(0);
    expect(s.events.filter((e) => e.type === "agent_message").length).toBe(countBefore);
  });

  it("pedido de analista com chamado vencido em foco transfere para N2 com resumo", async () => {
    const runner = fakeRunner(async () => decision({}));
    await runEmployeeTurn({ employee: ana, conversationId: null, text: "x", action: { kind: "select_ticket", ticketId: "INC-20311" } }, s.opts(runner));
    await runEmployeeTurn({ employee: ana, conversationId: s.conversationId(), text: "Quero falar com um analista.", action: null }, s.opts(runner));
    const conv = s.conversations.get(s.conversationId())!;
    expect(conv.status).toBe("waiting_human");
    expect(conv.handoffReason).toBe("chamado_vencido");
    expect(conv.handoffSummary).toMatch(/INC-20311/);
    expect(runner.calls).toBe(0);
  });

  it("legado instável: informa com transparência e não altera nada", async () => {
    const flaky = setup(1);
    const runner = fakeRunner(async () => decision({}));
    await runEmployeeTurn({ employee: ana, conversationId: null, text: "x", action: { kind: "select_ticket", ticketId: "INC-20311" } }, flaky.opts(runner));
    const msg = flaky.lastAgent()!;
    expect(msg.trace?.steps[0]?.status).toBe("erro");
    expect(msg.trace?.steps[0]?.attempts).toBe(3);
    expect(msg.text).toMatch(/instável/);
  });

  it("respeita o limite de 30 mensagens por sessão", async () => {
    const runner = fakeRunner(async () => decision({}));
    await runEmployeeTurn({ employee: ana, conversationId: null, text: "oi", action: null }, s.opts(runner));
    const id = s.conversationId();
    for (let i = 0; i < 29; i++) s.conversations.addMessage(id, { role: "user", text: `m${i}` });
    await runEmployeeTurn({ employee: ana, conversationId: id, text: "mais uma", action: null }, s.opts(runner));
    expect(s.events.at(-1)).toMatchObject({ type: "error", code: "message_limit" });
  });
});
