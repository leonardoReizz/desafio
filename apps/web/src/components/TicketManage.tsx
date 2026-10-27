"use client";
import { useState } from "react";
import { CheckCircle2, Clock3, MessageSquarePlus, PlayCircle } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { OPEN_STATUSES, type AnalystTicketStatus, type TicketView } from "@nexo/contracts";

const AUTHOR_LABEL: Record<TicketView["updates"][number]["author"], string> = {
  funcionario: "Funcionário",
  agent: "Nexo Assist",
  analista: "Analista",
  sistema: "Sistema",
};

/** Detalhe do chamado no console: histórico, nota e mudança de status pelo analista. */
export function TicketManage({
  ticket,
  busy,
  onUpdate,
}: {
  ticket: TicketView;
  busy: boolean;
  onUpdate: (ticketId: string, status: AnalystTicketStatus | null, note: string | null) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  const open = OPEN_STATUSES.includes(ticket.status);
  async function submit(status: AnalystTicketStatus | null) {
    const ok = await onUpdate(ticket.id, status, note.trim() || null);
    if (ok) setNote("");
  }
  return (
    <div className="ticket-manage">
      <p className="ticket-manage-desc">{ticket.description}</p>
      {ticket.updates.length > 0 && (
        <ol className="ticket-manage-updates">
          {ticket.updates.slice(-4).map((u) => (
            <li key={u.id}>
              <small>
                {u.authorName || AUTHOR_LABEL[u.author]} · {formatDateTime(u.at)}
              </small>
              <span>{u.text}</span>
            </li>
          ))}
        </ol>
      )}
      {open ? (
        <>
          <textarea
            aria-label={`Nota para o ${ticket.id}`}
            placeholder="Nota para o funcionário (opcional)"
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="ticket-manage-actions">
            {ticket.status !== "em_andamento" && (
              <button type="button" className="button-secondary" disabled={busy} onClick={() => void submit("em_andamento")}>
                <PlayCircle size={16} />
                Em andamento
              </button>
            )}
            {ticket.status !== "aguardando_usuario" && (
              <button type="button" className="button-secondary" disabled={busy} onClick={() => void submit("aguardando_usuario")}>
                <Clock3 size={16} />
                Aguardar funcionário
              </button>
            )}
            <button type="button" className="button-secondary" disabled={busy || !note.trim()} onClick={() => void submit(null)}>
              <MessageSquarePlus size={16} />
              Só registrar nota
            </button>
            <button type="button" className="button-primary" disabled={busy} onClick={() => void submit("resolvido")}>
              <CheckCircle2 size={16} />
              Marcar como resolvido
            </button>
          </div>
        </>
      ) : (
        <p className="ticket-manage-closed">Chamado encerrado. O funcionário pode pedir a reabertura em até 7 dias pelo chat.</p>
      )}
    </div>
  );
}
