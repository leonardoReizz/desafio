import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../src/app";
import { openDatabase, TicketRepository } from "../src/repository";
import { buildSeedTickets } from "../src/seed-data";

const TOKEN = "test-token-1234567890";
const NOW = new Date("2026-10-21T13:00:00.000Z");

function setup(failureRate = 0) {
  const repo = new TicketRepository(openDatabase(":memory:"), () => NOW);
  for (const t of buildSeedTickets(NOW)) repo.insertRaw(t);
  const app = createApp({ repo, token: TOKEN, failureRate, latencyMs: 0, random: () => 0.5 });
  const call = (path: string, init: RequestInit & { as?: string } = {}) =>
    app.request(path, {
      ...init,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "x-requester-id": init.as ?? "emp_ana",
        "content-type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  return { app, repo, call };
}

const newTicket = {
  type: "INC",
  title: "VPN não conecta — erro 809",
  description: "Windows 11, erro 809 desde ontem.",
  category: "rede_vpn",
  subcategory: null,
  priority: "alta",
  affected: "so_eu",
  requesterId: "emp_ana",
};

describe("tickets service", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("rejeita chamadas sem token válido", async () => {
    const res = await ctx.app.request("/v1/tickets", { headers: { authorization: "Bearer errado", "x-requester-id": "emp_ana" } });
    expect(res.status).toBe(401);
  });

  it("lista apenas chamados do solicitante", async () => {
    const res = await ctx.call("/v1/tickets");
    const body = (await res.json()) as { tickets: { requesterId: string }[] };
    expect(body.tickets.length).toBeGreaterThan(0);
    expect(body.tickets.every((t) => t.requesterId === "emp_ana")).toBe(true);
  });

  it("não revela chamado de outro funcionário (404, não 403)", async () => {
    const res = await ctx.call("/v1/tickets/INC-20322"); // da Carla
    expect(res.status).toBe(404);
  });

  it("impede criar chamado em nome de outra pessoa", async () => {
    const res = await ctx.call("/v1/tickets", { method: "POST", body: JSON.stringify({ ...newTicket, requesterId: "emp_carla" }) });
    expect(res.status).toBe(403);
  });

  it("cria chamado com id sequencial e é idempotente", async () => {
    const init = { method: "POST", body: JSON.stringify(newTicket), headers: { "idempotency-key": "draft-1" } };
    const first = await ctx.call("/v1/tickets", init);
    const second = await ctx.call("/v1/tickets", init);
    const a = (await first.json()) as { ticket: { id: string } };
    const b = (await second.json()) as { ticket: { id: string } };
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(a.ticket.id).toMatch(/^INC-\d{5}$/);
    expect(b.ticket.id).toBe(a.ticket.id);
  });

  it("valida o corpo com zod", async () => {
    const res = await ctx.call("/v1/tickets", { method: "POST", body: JSON.stringify({ ...newTicket, category: "cafeteria" }) });
    expect(res.status).toBe(400);
  });

  it("reabre chamado resolvido há até 7 dias", async () => {
    const res = await ctx.call("/v1/tickets/INC-20150/updates", {
      method: "POST",
      body: JSON.stringify({ author: "funcionario", authorName: "Ana Souza", text: "Bloqueou de novo.", reopen: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ticket: { status: string; resolvedAt: string | null } };
    expect(body.ticket.status).toBe("aberto");
    expect(body.ticket.resolvedAt).toBeNull();
  });

  it("recusa reabrir chamado resolvido há mais de 7 dias", async () => {
    const res = await ctx.call("/v1/tickets/INC-19877/updates", {
      method: "POST",
      body: JSON.stringify({ author: "funcionario", authorName: "Ana Souza", text: "Voltou.", reopen: true }),
    });
    expect(res.status).toBe(422);
  });

  it("simula indisponibilidade do legado com 503 + Retry-After", async () => {
    const flaky = setup(1);
    const res = await flaky.call("/v1/tickets");
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("1");
  });
});
