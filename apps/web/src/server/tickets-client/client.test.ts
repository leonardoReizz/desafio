import { describe, expect, it } from "vitest";
import { TicketsClient, TicketServiceError, TicketServiceUnavailableError } from "./client";

const ticket = {
  id: "INC-20311",
  type: "INC",
  title: "Notebook lento",
  description: "Lento desde a atualização.",
  category: "hardware",
  subcategory: null,
  priority: "media",
  affected: "so_eu",
  status: "aguardando_analista",
  requesterId: "emp_ana",
  assignedTeam: "N1",
  createdAt: "2026-10-10T17:20:00.000Z",
  updatedAt: "2026-10-15T12:10:00.000Z",
  lastServiceUpdateAt: null,
  resolvedAt: null,
  updates: [],
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function client(responses: Array<() => Response | Promise<Response>>, now = () => 0) {
  const calls: Request[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push(new Request(input as string, init));
    const next = responses.shift();
    if (!next) throw new Error("sem resposta");
    return next();
  };
  const c = new TicketsClient({ baseUrl: "http://t", token: "tok", fetchImpl, sleep: async () => {}, now });
  return { c, calls };
}

describe("TicketsClient", () => {
  it("tenta de novo quando o legado responde 503 e conta as tentativas", async () => {
    const { c } = client([() => json(503, {}), () => json(503, {}), () => json(200, { ticket })]);
    const r = await c.get("INC-20311", "emp_ana");
    expect(r.attempts).toBe(3);
    expect(r.data.id).toBe("INC-20311");
  });

  it("reusa a mesma Idempotency-Key em todas as tentativas de escrita", async () => {
    const { c, calls } = client([() => json(503, {}), () => json(201, { ticket })]);
    await c.create(
      { type: "INC", title: "x título", description: "desc", category: "hardware", subcategory: null, priority: "media", affected: "so_eu", requesterId: "emp_ana" },
      "draft-123",
    );
    expect(calls.map((r) => r.headers.get("idempotency-key"))).toEqual(["draft-123", "draft-123"]);
  });

  it("envia o solicitante em todas as chamadas", async () => {
    const { c, calls } = client([() => json(200, { tickets: [] })]);
    await c.listByRequester("emp_ana");
    expect(calls[0]?.headers.get("x-requester-id")).toBe("emp_ana");
  });

  it("não repete erro de negócio (4xx)", async () => {
    const { c, calls } = client([() => json(404, { error: { code: "not_found", message: "não encontrado" } })]);
    await expect(c.get("INC-1", "emp_ana")).rejects.toBeInstanceOf(TicketServiceError);
    expect(calls).toHaveLength(1);
  });

  it("desiste após 3 tentativas com erro de indisponibilidade", async () => {
    const { c } = client([() => json(503, {}), () => json(503, {}), () => json(503, {})]);
    await expect(c.get("INC-1", "emp_ana")).rejects.toBeInstanceOf(TicketServiceUnavailableError);
  });

  it("abre o circuito após falhas seguidas e falha rápido", async () => {
    const many = Array.from({ length: TicketsClient.BREAKER_THRESHOLD * 3 }, () => () => json(503, {}));
    const { c, calls } = client(many);
    for (let i = 0; i < TicketsClient.BREAKER_THRESHOLD; i++) {
      await expect(c.get("INC-1", "emp_ana")).rejects.toBeInstanceOf(TicketServiceUnavailableError);
    }
    const before = calls.length;
    await expect(c.get("INC-1", "emp_ana")).rejects.toBeInstanceOf(TicketServiceUnavailableError);
    expect(calls.length).toBe(before);
  });
});
