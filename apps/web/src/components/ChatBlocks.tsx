"use client";
import { ArrowRight, Clock3 } from "lucide-react";
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
              ? `✓ Chamado ${draft.resultTicketId ?? "INC-20517"} criado`
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
function TicketSelect({ tickets, onSelect }: { tickets: TicketSummary[]; onSelect: (id: string, label: string) => void }) {
  return (
    <div className="ticket-select" role="group" aria-label="Selecione um chamado">
      {tickets.map((ticket, index) => (
        <button
          type="button"
          key={ticket.id}
          className="ticket-option"
          onClick={() => onSelect(ticket.id, `${ticket.id} · ${ticket.title}`)}
        >
          <span className={`fake-radio ${index === 0 ? "selected" : ""}`} />
          <span className="ticket-id">{ticket.id}</span>
          <strong>{ticket.title.replace(" do Windows", "")}</strong>
          <span className="option-status">
            <StatusDot status={ticket.status} />
            {STATUS_LABEL[ticket.status]}
          </span>
          <time>{new Date(ticket.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")}</time>
        </button>
      ))}
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
          <strong>
            {new Date(ticket.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")}, 14:20
          </strong>
        </div>
        <div>
          <small>Última atualização</small>
          <strong className={ticket.sla.overdue ? "overdue" : ""}>
            {ticket.sla.overdue ? "há 5 dias" : "recente"} <em>· {ticket.sla.label}</em>
          </strong>
        </div>
      </div>
    </div>
  );
}
export function ChatBlock({
  block,
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
              onClick={() => onQuickReply(option.value, option.label)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    );
  if (block.kind === "ticket_select") return <TicketSelect tickets={block.tickets} onSelect={onSelectTicket} />;
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
