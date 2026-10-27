import "server-only";
import { ConversationRepository } from "./db/conversations";
import { db } from "./db/client";
import { UserRepository } from "./db/users";
import { env } from "./env";
import { TicketsClient } from "./tickets-client/client";

/** Composição das dependências do servidor (um lugar só, fácil de trocar em testes). */
const g = globalThis as unknown as { __nexoTickets?: TicketsClient };

export function ticketsClient(): TicketsClient {
  // Singleton: o estado do circuit breaker precisa ser compartilhado entre requisições.
  g.__nexoTickets ??= new TicketsClient({ baseUrl: env().TICKETS_SERVICE_URL, token: env().TICKETS_SERVICE_TOKEN });
  return g.__nexoTickets;
}

export function conversations(): ConversationRepository {
  return new ConversationRepository(db());
}

export function users(): UserRepository {
  return new UserRepository(db());
}
