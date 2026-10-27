import "server-only";
import type { Analyst, ChatMessage, ConversationDetail, ConversationListFilter, ConversationListItem } from "@nexo/contracts";
import type { ConversationRepository, StoredConversation } from "../db/conversations";
import type { UserRepository } from "../db/users";
import { formatLocalTime } from "../sla/business-time";
import { toTicketView } from "../sla/sla";
import { InvalidTransitionError, transition } from "../conversations/state";
import { TicketServiceUnavailableError, type TicketsClient } from "../tickets-client/client";
import { NotFound } from "../http";

interface Deps {
  conversations: ConversationRepository;
  users: UserRepository;
  tickets: TicketsClient;
  now: () => Date;
}

export interface ConsoleList {
  items: ConversationListItem[];
  counts: Record<ConversationListFilter, number>;
}

function matchesFilter(c: StoredConversation, filter: ConversationListFilter, analystId: string): boolean {
  switch (filter) {
    case "todas":
      return true;
    case "para_voce":
      return c.status === "waiting_human";
    case "com_agent":
      return c.status === "agent";
    case "minhas":
      return c.status === "human" && c.assignedAnalystId === analystId;
  }
}

/** Ordem do console: quem espera analista primeiro (mais antigo no topo), depois o resto por atividade. */
function priorityOrder(c: StoredConversation): number {
  return c.status === "waiting_human" ? 0 : c.status === "human" ? 1 : c.status === "agent" ? 2 : 3;
}

export function listConversations(deps: Deps, analyst: Analyst, filter: ConversationListFilter, query: string): ConsoleList {
  const all = deps.conversations.listAll();
  const q = query.trim().toLowerCase();
  const items: ConversationListItem[] = [];
  const counts: Record<ConversationListFilter, number> = { todas: 0, para_voce: 0, com_agent: 0, minhas: 0 };

  for (const c of all) {
    const employee = deps.users.getEmployee(c.employeeId);
    if (!employee) continue;
    for (const f of Object.keys(counts) as ConversationListFilter[]) if (matchesFilter(c, f, analyst.id)) counts[f]++;
    if (!matchesFilter(c, filter, analyst.id)) continue;
    const msgs = deps.conversations.recentMessages(c.id, 30);
    const last = [...msgs].reverse().find((m) => m.role !== "system") ?? null;
    if (q && !`${employee.name} ${c.relatedTicketId ?? ""} ${last?.text ?? ""}`.toLowerCase().includes(q)) continue;
    const unread =
      c.status === "waiting_human" || c.status === "human"
        ? msgs.filter((m) => m.role === "user" && (!c.analystReadAt || m.createdAt > c.analystReadAt)).length
        : 0;
    items.push({
      id: c.id,
      employee: { id: employee.id, name: employee.name, department: employee.department },
      status: c.status,
      handoffReason: c.handoffReason,
      relatedTicketId: c.relatedTicketId,
      lastConfidence: c.lastConfidence,
      lastMessage: last ? { role: last.role, text: last.text, at: last.createdAt } : null,
      unreadCount: unread,
      assignedAnalystId: c.assignedAnalystId,
      waitingSince: c.status === "waiting_human" ? c.handoffAt : null,
    });
  }
  items.sort((a, b) => {
    const ca = all.find((c) => c.id === a.id)!;
    const cb = all.find((c) => c.id === b.id)!;
    const byStatus = priorityOrder(ca) - priorityOrder(cb);
    if (byStatus !== 0) return byStatus;
    if (ca.status === "waiting_human") return (ca.handoffAt ?? "").localeCompare(cb.handoffAt ?? "");
    return cb.updatedAt.localeCompare(ca.updatedAt);
  });
  return { items, counts };
}

export async function conversationDetail(
  deps: Deps,
  conversationId: string,
): Promise<ConversationDetail & { ticketsUnavailable: boolean }> {
  const conversation = deps.conversations.get(conversationId);
  if (!conversation) throw new NotFound("Conversa não encontrada");
  const employee = deps.users.getEmployee(conversation.employeeId);
  if (!employee) throw new NotFound("Funcionário não encontrado");
  const now = deps.now();
  let tickets: ConversationDetail["tickets"] = [];
  let ticketsUnavailable = false;
  try {
    // O analista consulta os chamados do funcionário DESTA conversa (escopo pelo dono).
    tickets = (await deps.tickets.listByRequester(employee.id)).data.map((t) => toTicketView(t, now));
  } catch (e) {
    if (!(e instanceof TicketServiceUnavailableError)) throw e;
    ticketsUnavailable = true;
  }
  if (conversation.status === "waiting_human" || conversation.status === "human") {
    deps.conversations.update(conversation.id, { analystReadAt: now.toISOString() });
  }
  return {
    conversation,
    employee,
    messages: deps.conversations.messages(conversation.id),
    tickets,
    assignedAnalyst: conversation.assignedAnalystId ? deps.users.getAnalyst(conversation.assignedAnalystId) : null,
    ticketsUnavailable,
  };
}

function systemNote(deps: Deps, conversationId: string, text: string): ChatMessage {
  return deps.conversations.addMessage(conversationId, { role: "system", text: `${text} · ${formatLocalTime(deps.now())}` });
}

export function assume(deps: Deps, analyst: Analyst, conversationId: string): void {
  const c = deps.conversations.get(conversationId);
  if (!c) throw new NotFound("Conversa não encontrada");
  deps.conversations.update(c.id, { status: transition(c.status, "assume"), assignedAnalystId: analyst.id });
  systemNote(deps, c.id, `${analyst.name} assumiu · agent pausado`);
}

export function returnToAgent(deps: Deps, analyst: Analyst, conversationId: string): void {
  const c = deps.conversations.get(conversationId);
  if (!c) throw new NotFound("Conversa não encontrada");
  deps.conversations.update(c.id, { status: transition(c.status, "return_to_agent"), assignedAnalystId: null, handoffReason: null });
  systemNote(deps, c.id, `${analyst.name} devolveu ao Nexo Assist`);
}

export function close(deps: Deps, analyst: Analyst, conversationId: string): void {
  const c = deps.conversations.get(conversationId);
  if (!c) throw new NotFound("Conversa não encontrada");
  deps.conversations.update(c.id, { status: transition(c.status, "close") });
  systemNote(deps, c.id, `Atendimento encerrado por ${analyst.name}`);
}

export function sendAnalystMessage(deps: Deps, analyst: Analyst, conversationId: string, text: string): ChatMessage {
  const c = deps.conversations.get(conversationId);
  if (!c) throw new NotFound("Conversa não encontrada");
  // Responder só depois de assumir — o mesmo gesto que pausa o agent.
  if (c.status !== "human" || c.assignedAnalystId !== analyst.id) throw new InvalidTransitionError(c.status, "assume");
  return deps.conversations.addMessage(c.id, { role: "analyst", text, authorName: analyst.name, authorBadge: `Suporte ${analyst.team}` });
}
