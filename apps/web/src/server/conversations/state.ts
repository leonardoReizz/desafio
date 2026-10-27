import type { ConversationStatus } from "@nexo/contracts";

export type ConversationEvent = "transfer" | "assume" | "return_to_agent" | "close";

/**
 *  agent ──transfer──▶ waiting_human ──assume──▶ human ──return_to_agent──▶ agent
 *    │ ▲                   │                       ▲ │
 *    │ └──return_to_agent──┘                       │ └──close──▶ closed
 *    └──────────────────assume─────────────────────┘  (analista pode entrar sem transferência)
 */
const TRANSITIONS: Record<ConversationStatus, Partial<Record<ConversationEvent, ConversationStatus>>> = {
  agent: { transfer: "waiting_human", assume: "human", close: "closed" },
  waiting_human: { assume: "human", return_to_agent: "agent", close: "closed" },
  human: { return_to_agent: "agent", close: "closed" },
  closed: {},
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: ConversationStatus,
    readonly event: ConversationEvent,
  ) {
    super(`Transição inválida: ${event} a partir de ${from}`);
  }
}

export function transition(from: ConversationStatus, event: ConversationEvent): ConversationStatus {
  const to = TRANSITIONS[from][event];
  if (!to) throw new InvalidTransitionError(from, event);
  return to;
}

/** Regra do Anexo A: o agent não responde enquanto a conversa está com um analista. */
export function agentMayRespond(status: ConversationStatus): boolean {
  return status === "agent";
}
