import { describe, expect, it } from "vitest";
import { DEMO_ANALYSTS } from "@nexo/contracts";
import { createApp } from "../../../../../services/tickets/src/app";
import { openDatabase, TicketRepository } from "../../../../../services/tickets/src/repository";
import { buildSeedTickets } from "../../../../../services/tickets/src/seed-data";
import { openAppDatabase } from "../db/client";
import { ConversationRepository } from "../db/conversations";
import { UserRepository } from "../db/users";
import { TicketsClient, TicketServiceError } from "../tickets-client/client";
import { assume, updateTicket } from "./service";

const NOW = new Date("2026-10-21T13:05:00.000Z");
const rafael = { ...DEMO_ANALYSTS[0]! };

function setup() {
  const ticketRepo = new TicketRepository(openDatabase(":memory:"), () => NOW);
  for (const t of buildSeedTickets(NOW)) ticketRepo.insertRaw(t);
  const app = createApp({ repo: ticketRepo, token: "tok-1234567890abcdef", failureRate: 0, latencyMs: 0 });
  const tickets = new TicketsClient({
    baseUrl: "http://tickets",
    token: "tok-1234567890abcdef",
    fetchImpl: (input, init) => Promise.resolve(app.request(String(input).replace("http://tickets", ""), init)),
    sleep: async () => {},
  });
  const db = openAppDatabase(":memory:");
  const deps = { conversations: new ConversationRepository(db, () => NOW), users: new UserRepository(db), tickets, now: () => NOW };
  return { deps, conv: deps.conversations.create("emp_ana") };
}

describe("console do analista", () => {
  it("assume uma conversa que está com o agent (sem transferência)", () => {
    const { deps, conv } = setup();
    assume(deps, rafael, conv.id);
    expect(deps.conversations.get(conv.id)!.status).toBe("human");
  });

  it("resolve chamado do funcionário da conversa e avisa no chat", async () => {
    const { deps, conv } = setup();
    const t = await updateTicket(deps, rafael, conv.id, "INC-20311", { status: "resolvido", note: "Driver de vídeo atualizado." });
    expect(t.status).toBe("resolvido");
    expect(t.updates.at(-1)?.text).toBe("Driver de vídeo atualizado.");
    expect(deps.conversations.messages(conv.id).at(-1)?.text).toMatch(/marcou o INC-20311 como resolvido/);
  });

  it("não alcança chamado de outro funcionário (escopo pela conversa)", async () => {
    const { deps, conv } = setup();
    await expect(updateTicket(deps, rafael, conv.id, "INC-20322", { status: "resolvido", note: null })).rejects.toBeInstanceOf(
      TicketServiceError,
    );
  });
});
