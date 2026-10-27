"use client";
import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, Clock3 } from "lucide-react";
import { formatDateTime, formatDayMonth, formatRelativeDay } from "@/lib/format";
import {
  AFFECTED_LABEL,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type TicketDraft,
  type TicketSummary,
  type TicketView,
  type UiBlock,
} from "@nexo/contracts";

function StatusDot({ status }: { status: TicketSummary["status"] }) {
  return <i className={`status-dot status-${status}`} />;
}
const PAUSED_HINT = "O Nexo Assist está pausado enquanto um analista cuida da conversa";
export type DraftEdit = { id: string; title: string; description: string };
function DraftCard({
  draft,
  editingDraft,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onConfirm,
  onEdit,
  onCancel,
}: {
  draft: TicketDraft;
  editingDraft?: DraftEdit | null;
  onEditChange: (edit: DraftEdit) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onConfirm: (id: string) => void;
  onEdit: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const heading =
    draft.mode === "create"
      ? "Novo chamado"
      : draft.mode === "update"
        ? `Atualizar ${draft.targetTicketId}`
        : `Reabrir ${draft.targetTicketId}`;
  return (
    <div className="ticket-card draft-card">
      <div className="card-top">
        <span>
          {heading} <b>·</b> Rascunho {draft.id}
        </span>
        <span className={`draft-status ${draft.status}`}>
          {draft.status === "pending"
            ? "● Aguardando confirmação"
            : draft.status === "confirmed"
              ? `✓ ${draft.resultTicketId ?? "Chamado"} ${draft.mode === "create" ? "criado" : draft.mode === "update" ? "atualizado" : "reaberto"}`
              : "Rascunho cancelado"}
        </span>
      </div>
      {editingDraft?.id === draft.id ? (
        <div className="draft-edit-fields">
          <label>
            Título
            <input value={editingDraft.title} onChange={(event) => onEditChange({ ...editingDraft, title: event.target.value })} />
          </label>
          <label>
            Descrição
            <textarea
              value={editingDraft.description}
              onChange={(event) => onEditChange({ ...editingDraft, description: event.target.value })}
            />
          </label>
        </div>
      ) : (
        <>
          <h3>{draft.title}</h3>
          <p>{draft.description}</p>
        </>
      )}
      <div className="ticket-grid three">
        <div>
          <small>Categoria</small>
          <strong>{CATEGORY_LABEL[draft.category]}</strong>
        </div>
        <div>
          <small>Prioridade</small>
          <strong>
            <i className={`status-dot priority-${draft.priority}`} />
            {PRIORITY_LABEL[draft.priority]} <em>· {draft.slaLabel}</em>
          </strong>
        </div>
        <div>
          <small>Afetados</small>
          <strong>{AFFECTED_LABEL[draft.affected]}</strong>
        </div>
      </div>
      {draft.status === "pending" && (
        <div className="draft-actions">
          {editingDraft?.id === draft.id ? (
            <>
              <button
                type="button"
                className="button-primary"
                onClick={() => onSaveEdit(draft.id)}
                disabled={!editingDraft.title.trim() || !editingDraft.description.trim()}
              >
                Salvar alterações
              </button>
              <button type="button" className="button-secondary" onClick={onCancelEdit}>
                Voltar
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button-primary" onClick={() => onConfirm(draft.id)}>
                Confirmar <kbd>⌘↵</kbd>
              </button>
              <button type="button" className="button-secondary" onClick={() => onEdit(draft.id)}>
                Editar
              </button>
              <button type="button" className="button-ghost" onClick={() => onCancel(draft.id)}>
                Cancelar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
function TicketSelect({
  tickets,
  onSelect,
  disabled,
}: {
  tickets: TicketSummary[];
  onSelect: (id: string, label: string) => void;
  disabled: boolean;
}) {
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  return (
    <div className="ticket-select" role="group" aria-label="Selecione um chamado">
      {tickets.map((ticket) => (
        <button
          type="button"
          key={ticket.id}
          className="ticket-option"
          aria-pressed={ticket.id === selectedTicketId}
          disabled={disabled}
          onClick={() => {
            setSelectedTicketId(ticket.id);
            onSelect(ticket.id, `${ticket.id} · ${ticket.title}`);
          }}
        >
          <span className={`fake-radio ${ticket.id === selectedTicketId ? "selected" : ""}`} />
          <span className="ticket-id">{ticket.id}</span>
          <strong>{ticket.title}</strong>
          <span className="option-status">
            <StatusDot status={ticket.status} />
            {STATUS_LABEL[ticket.status]}
          </span>
          <time>{formatDayMonth(ticket.createdAt)}</time>
        </button>
      ))}
    </div>
  );
}
function TicketRow({
  ticket,
  onOpen,
  disabled,
}: {
  ticket: TicketSummary;
  onOpen: (id: string, label: string) => void;
  disabled: boolean;
}) {
  const closed = ticket.status === "resolvido" || ticket.status === "fechado";
  return (
    <li>
      <button
        type="button"
        className="ticket-row"
        disabled={disabled}
        title={disabled ? PAUSED_HINT : `Ver detalhes do ${ticket.id}`}
        onClick={() => onOpen(ticket.id, `${ticket.id} · ${ticket.title}`)}
      >
        <span className="ticket-row-main">
          <span className="ticket-row-id">{ticket.id}</span>
          <strong>{ticket.title}</strong>
        </span>
        <span className="ticket-row-badges">
          <span className={`badge badge-status-${ticket.status}`}>
            <StatusDot status={ticket.status} />
            {STATUS_LABEL[ticket.status]}
          </span>
          {!closed && (
            <span className={`badge badge-priority-${ticket.priority}`}>
              <i className={`status-dot priority-${ticket.priority}`} />
              {PRIORITY_LABEL[ticket.priority]}
            </span>
          )}
          {closed ? (
            ticket.resolvedAt && (
              <span className="badge badge-muted">
                <CheckCircle2 size={12} />
                {formatDayMonth(ticket.resolvedAt)}
              </span>
            )
          ) : ticket.sla.overdue ? (
            <span className="badge badge-overdue">
              <AlertTriangle size={12} />
              Prazo vencido
            </span>
          ) : (
            <span className="badge badge-muted">
              <Clock3 size={12} />
              {ticket.sla.label}
            </span>
          )}
        </span>
        <ChevronRight size={16} className="ticket-row-chevron" aria-hidden />
      </button>
    </li>
  );
}
function TicketList({
  open,
  closed,
  onOpen,
  disabled,
}: {
  open: TicketSummary[];
  closed: TicketSummary[];
  onOpen: (id: string, label: string) => void;
  disabled: boolean;
}) {
  const overdue = open.filter((t) => t.sla.overdue).length;
  return (
    <div className="ticket-list" role="group" aria-label="Seus chamados">
      <div className="ticket-list-head">
        <span>Seus chamados</span>
        <span className="ticket-list-counts">
          <span className="badge badge-muted">{open.length} abertos</span>
          {overdue > 0 && (
            <span className="badge badge-overdue">
              {overdue} vencido{overdue > 1 ? "s" : ""}
            </span>
          )}
        </span>
      </div>
      {open.length > 0 && (
        <section>
          <h4>Abertos</h4>
          <ul>
            {open.map((t) => (
              <TicketRow key={t.id} ticket={t} onOpen={onOpen} disabled={disabled} />
            ))}
          </ul>
        </section>
      )}
      {closed.length > 0 && (
        <section>
          <h4>Encerrados</h4>
          <ul>
            {closed.map((t) => (
              <TicketRow key={t.id} ticket={t} onOpen={onOpen} disabled={disabled} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
function TicketCard({ ticket }: { ticket: TicketView }) {
  return (
    <div className="ticket-card detail-card">
      <div className="card-top">
        <span>
          Chamado <b>·</b> {ticket.id}
        </span>
        <span className="ticket-status">
          <StatusDot status={ticket.status} />
          {STATUS_LABEL[ticket.status]}
        </span>
      </div>
      <h3>{ticket.title}</h3>
      <p>{ticket.description}</p>
      <div className="ticket-grid four">
        <div>
          <small>Categoria</small>
          <strong>
            {CATEGORY_LABEL[ticket.category]}
            {ticket.subcategory && ` › ${ticket.subcategory}`}
          </strong>
        </div>
        <div>
          <small>Prioridade</small>
          <strong>
            <i className={`status-dot priority-${ticket.priority}`} />
            {PRIORITY_LABEL[ticket.priority]}
          </strong>
        </div>
        <div>
          <small>Aberto em</small>
          <strong>{formatDateTime(ticket.createdAt)}</strong>
        </div>
        <div>
          <small>Última atualização</small>
          <strong className={ticket.sla.overdue ? "overdue" : ""}>
            {formatRelativeDay(ticket.lastServiceUpdateAt ?? ticket.updatedAt)} <em>· {ticket.sla.label}</em>
          </strong>
        </div>
      </div>
    </div>
  );
}
export function ChatBlock({
  block,
  interactive = true,
  selectedQuickReply,
  editingDraft,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onQuickReply,
  onSelectTicket,
  onConfirmDraft,
  onEditDraft,
  onCancelDraft,
}: {
  block: UiBlock;
  /** false quando a conversa está com analista: o agent não responde, então cliques não teriam efeito. */
  interactive?: boolean;
  selectedQuickReply?: string | null;
  editingDraft?: DraftEdit | null;
  onEditChange: (edit: DraftEdit) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onQuickReply: (value: string, label: string) => void;
  onSelectTicket: (id: string, label: string) => void;
  onConfirmDraft: (id: string) => void;
  onEditDraft: (id: string) => void;
  onCancelDraft: (id: string) => void;
}) {
  if (block.kind === "quick_replies")
    return (
      <div className="quick-replies">
        {block.question && <strong>{block.question}</strong>}
        <div>
          {block.options.map((option) => (
            <button
              type="button"
              key={option.value}
              className={`quick-chip ${selectedQuickReply === option.value ? "selected" : ""}`}
              disabled={!interactive}
              onClick={() => onQuickReply(option.value, option.label)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    );
  if (block.kind === "ticket_select") return <TicketSelect tickets={block.tickets} onSelect={onSelectTicket} disabled={!interactive} />;
  if (block.kind === "ticket_list")
    return <TicketList open={block.open} closed={block.closed} onOpen={onSelectTicket} disabled={!interactive} />;
  if (block.kind === "ticket_card") return <TicketCard ticket={block.ticket} />;
  if (block.kind === "draft")
    return (
      <DraftCard
        draft={block.draft}
        editingDraft={editingDraft}
        onEditChange={onEditChange}
        onSaveEdit={onSaveEdit}
        onCancelEdit={onCancelEdit}
        onConfirm={onConfirmDraft}
        onEdit={onEditDraft}
        onCancel={onCancelDraft}
      />
    );
  return (
    <div className="handoff-card">
      <Clock3 size={18} />
      <span>
        Encaminhado ao Suporte {block.team}. Um analista entra em contato {block.etaLabel}.
      </span>
      <ArrowRight size={17} />
    </div>
  );
}
