import { OPEN_STATUSES, type Priority, type SlaInfo, type Ticket, type TicketView } from "@nexo/contracts";
import { addBusinessDays, addBusinessHours, formatLocalDate, formatLocalTime, isSameLocalDay } from "./business-time";

/** Prazos do Anexo A. Crítica conta em horas corridas (plantão 24h). */
export function deadlineFrom(start: Date, priority: Priority): Date {
  switch (priority) {
    case "critica":
      return new Date(start.getTime() + 60 * 60 * 1000);
    case "alta":
      return addBusinessHours(start, 4);
    case "media":
      return addBusinessDays(start, 3);
    case "baixa":
      return addBusinessDays(start, 5);
  }
}

export const SLA_TEXT: Record<Priority, string> = {
  critica: "1 hora",
  alta: "4 horas úteis",
  media: "3 dias úteis",
  baixa: "5 dias úteis",
};

function dueLabel(due: Date, now: Date): string {
  return isSameLocalDay(due, now) ? `resposta até ${formatLocalTime(due)}` : `resposta até ${formatLocalDate(due)}, ${formatLocalTime(due)}`;
}

/**
 * O prazo vale para a primeira resposta e para cada atualização do service desk:
 * conta a partir da última atualização do service desk (ou da abertura).
 */
export function computeSla(ticket: Pick<Ticket, "status" | "priority" | "createdAt" | "lastServiceUpdateAt">, now: Date): SlaInfo {
  if (!OPEN_STATUSES.includes(ticket.status)) return { dueAt: null, overdue: false, label: "encerrado" };
  if (ticket.status === "aguardando_usuario") return { dueAt: null, overdue: false, label: "aguardando sua resposta" };
  const base = new Date(ticket.lastServiceUpdateAt ?? ticket.createdAt);
  const due = deadlineFrom(base, ticket.priority);
  const overdue = now.getTime() > due.getTime();
  return { dueAt: due.toISOString(), overdue, label: overdue ? "prazo vencido" : dueLabel(due, now) };
}

/** Rótulo do prazo de um rascunho ainda não criado: conta a partir de agora. */
export function draftSlaLabel(priority: Priority, now: Date): string {
  return dueLabel(deadlineFrom(now, priority), now);
}

export function toTicketView(ticket: Ticket, now: Date): TicketView {
  return { ...ticket, sla: computeSla(ticket, now) };
}
