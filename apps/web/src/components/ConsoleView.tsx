"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Headset,
  MessageCircle,
  MoreVertical,
  Search,
  Send,
  X,
} from "lucide-react";
import {
  CATEGORY_LABEL,
  HANDOFF_REASON_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Analyst,
  type ConversationDetail,
  type ConversationListFilter,
  type ConversationListItem,
  type TicketView,
} from "@nexo/contracts";
import { Brand } from "./Brand";
import { DecisionTracePanel } from "./DecisionTracePanel";

const filterLabels: { id: ConversationListFilter; label: string; count?: number }[] = [
  { id: "todas", label: "Todas" },
  { id: "para_voce", label: "Para você", count: 3 },
  { id: "com_agent", label: "Com o agent", count: 9 },
  { id: "minhas", label: "Minhas", count: 1 },
];
const avatarColors: Record<string, string> = {
  ana: "blue",
  carla: "peach",
  bruno: "purple",
  diego: "mint",
  elisa: "rose",
  fabio: "gray",
  gabriela: "yellow",
};
function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}
function listStatus(item: ConversationListItem, selectedStatus?: string, selectedId?: string | null) {
  if (item.id === selectedId && selectedStatus === "human") return { text: "Você está atendendo", tone: "blue" };
  if (item.handoffReason === "baixa_confianca")
    return { text: `Agent pediu ajuda · confiança ${Math.round((item.lastConfidence ?? 0) * 100)}%`, tone: "amber" };
  if (item.status === "waiting_human")
    return { text: item.relatedTicketId ? `Transferida · ${item.relatedTicketId}` : "Transferida · contato em 25 min", tone: "red" };
  if (item.status === "human") return { text: "Você está atendendo", tone: "blue" };
  if (item.status === "closed") return { text: "Resolvida pelo agent", tone: "gray" };
  return { text: "Agent atendendo", tone: "green" };
}
function TicketRow({ ticket }: { ticket: TicketView }) {
  return (
    <button type="button" className="history-ticket">
      <span className={`status-dot status-${ticket.status}`} />
      <span>
        <strong>{ticket.title.replace(" do Windows", "")}</strong>
        <small>
          {ticket.id} · {STATUS_LABEL[ticket.status]}
        </small>
      </span>
      <ChevronRight size={17} />
    </button>
  );
}
export interface ConsoleViewProps {
  items: ConversationListItem[];
  filter: ConversationListFilter;
  onFilterChange: (filter: ConversationListFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  detail: ConversationDetail | null;
  analyst: Analyst;
  onAssume: () => void;
  onReturnToAgent: () => void;
  onClose: () => void;
  onSendAsAnalyst: (text: string) => void;
  loading: boolean;
  error: string | null;
  initialDraft?: string;
}
export function ConsoleView({
  items,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  selectedId,
  onSelect,
  detail,
  analyst,
  onAssume,
  onReturnToAgent,
  onClose,
  onSendAsAnalyst,
  loading,
  error,
  initialDraft = "",
}: ConsoleViewProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [openTraceId, setOpenTraceId] = useState<string | null>(null);
  const messageViewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (detail?.conversation.status === "human" && messageViewport.current)
      messageViewport.current.scrollTop = messageViewport.current.scrollHeight;
  }, [detail?.conversation.status, detail?.messages.length]);
  const [showTickets, setShowTickets] = useState(true);
  const filtered = items.filter(
    (item) =>
      (filter === "todas" ||
        filter === "para_voce" ||
        (filter === "com_agent" && item.status === "agent") ||
        (filter === "minhas" && item.status === "human") ||
        (filter === "minhas" && item.id === selectedId && detail?.conversation.status === "human")) &&
      `${item.employee.name} ${item.relatedTicketId ?? ""} ${item.lastMessage?.text ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  const status = detail?.conversation.status;
  const assumed = status === "human";
  const firstName = detail?.employee.name.split(" ")[0] ?? "funcionário";
  const possessive = ["Ana", "Carla", "Elisa", "Gabriela"].includes(firstName) ? "da" : "do";
  function submit() {
    if (!draft.trim() || !assumed) return;
    onSendAsAnalyst(draft.trim());
    setDraft("");
  }
  return (
    <main className="console-shell">
      <aside className="console-rail">
        <Brand compact />
        <button type="button" className="rail-current" aria-label="Conversas">
          <MessageCircle size={22} />
          <span>5</span>
        </button>
        <div className="rail-spacer" />
        <span className="rail-avatar">
          RL
          <i />
        </span>
      </aside>
      <section className="conversation-list">
        <header className="list-header">
          <div className="list-title">
            <h1>Conversas</h1>
            <span className="available">
              <i />
              Disponível
            </span>
          </div>
          <div className="list-search">
            <Search size={18} />
            <input
              aria-label="Pesquisar conversa ou chamado"
              placeholder="Pesquisar conversa ou chamado"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
          <div className="list-filters">
            {filterLabels.map((option) => (
              <button
                type="button"
                key={option.id}
                className={filter === option.id ? "active" : ""}
                onClick={() => onFilterChange(option.id)}
              >
                {option.label}
                {option.count && <b>{option.count}</b>}
              </button>
            ))}
          </div>
        </header>
        <div className="list-items">
          {loading ? (
            <div className="list-skeleton" role="status" aria-label="Carregando conversas">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index}>
                  <i />
                  <span>
                    <b />
                    <b />
                    <b />
                  </span>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="console-error" role="alert">
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="console-empty">Nenhuma conversa neste filtro</div>
          ) : (
            filtered.map((item) => {
              const state = listStatus(item, detail?.conversation.status, selectedId);
              const preview = item.id === "ana-conversation" && assumed ? "Posso sim, está ligado." : item.lastMessage?.text;
              return (
                <button
                  type="button"
                  className={`conversation-item ${item.id === selectedId ? "selected" : ""}`}
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                >
                  <span className={`list-avatar ${avatarColors[item.employee.id] ?? "blue"}`}>
                    {initials(item.employee.name)}
                    <i />
                  </span>
                  <span className="item-body">
                    <span className="item-name">
                      {item.employee.name}
                      <time>{item.id === "diego" ? "agora" : item.id === "gabriela" ? "ontem" : item.lastMessage?.at.slice(11, 16)}</time>
                    </span>
                    <span className="item-preview">{preview}</span>
                    <span className={`item-status ${state.tone}`}>
                      <i />
                      {state.text}
                    </span>
                  </span>
                  {item.unreadCount > 0 && !(item.id === "ana-conversation" && assumed) && <b className="unread">{item.unreadCount}</b>}
                </button>
              );
            })
          )}
        </div>
      </section>
      <section className="console-conversation">
        {!detail ? (
          loading ? (
            <div className="console-loading-main" role="status" aria-label="Carregando conversa">
              <span />
              <span />
              <span />
            </div>
          ) : (
            <div className="console-empty fill">Selecione uma conversa</div>
          )
        ) : (
          <>
            <header className="console-chat-header">
              <span className="avatar avatar-ana">AS</span>
              <div className="console-person">
                <strong>{detail.employee.name}</strong>
                <small>
                  online · {detail.employee.department}
                  {!assumed && detail.conversation.relatedTicketId && ` · ${detail.conversation.relatedTicketId}`}
                </small>
              </div>
              <div className="header-actions">
                {assumed ? (
                  <>
                    <button type="button" className="button-secondary" onClick={onReturnToAgent}>
                      <Bot size={17} />
                      Devolver ao agent
                    </button>
                    <button type="button" className="button-danger" onClick={onClose}>
                      <CircleCheck size={17} />
                      Encerrar atendimento
                    </button>
                  </>
                ) : (
                  <span className="waiting-pill">
                    <Bot size={16} />
                    Aguardando atendente
                  </span>
                )}
                <button type="button" className="icon-button" aria-label="Pesquisar na conversa">
                  <Search size={21} />
                </button>
                <button type="button" className="icon-button" aria-label="Mais opções">
                  <MoreVertical size={20} />
                </button>
              </div>
            </header>
            <div className="console-messages" ref={messageViewport}>
              <div className={`console-message-flow ${assumed ? "assumed" : ""}`} aria-live="polite">
                {detail.conversation.handoffSummary && (
                  <div className="case-summary">
                    <strong>Resumo para o analista</strong>
                    <small>{detail.conversation.handoffReason && HANDOFF_REASON_LABEL[detail.conversation.handoffReason]}</small>
                    <p>{detail.conversation.handoffSummary}</p>
                  </div>
                )}
                <div className="day-marker">Hoje</div>
                {detail.messages.map((message, messageIndex) =>
                  message.role === "system" ? (
                    <div className="console-divider" key={message.id}>
                      <span>⇄ &nbsp;{message.text}</span>
                    </div>
                  ) : (
                    <div key={message.id} className={`console-message ${message.role}`}>
                      <div className="console-message-inner">
                        {message.role !== "user" && (
                          <div className="console-message-author">
                            {message.role === "agent" ? "Nexo Assist" : message.authorName}
                            <span>{message.role === "agent" ? "IA" : message.authorBadge}</span>
                          </div>
                        )}
                        {message.trace ? (
                          <button
                            type="button"
                            className="console-bubble"
                            aria-label={`Ver por que o assistente respondeu: ${message.text}`}
                            onClick={() => setOpenTraceId(openTraceId === message.id ? null : message.id)}
                          >
                            {message.text}
                            <small>
                              {message.createdAt.slice(11, 16)}
                              <CheckCheck size={14} />
                            </small>
                          </button>
                        ) : (
                          <div className="console-bubble">
                            {message.text}
                            <small>
                              {message.createdAt.slice(11, 16)}
                              {message.role !== "user" && <CheckCheck size={14} />}
                            </small>
                          </div>
                        )}
                        {message.trace && (
                          <DecisionTracePanel
                            trace={message.trace}
                            compact
                            label="Ver por quê"
                            placement={messageIndex >= 3 ? "above" : "below"}
                            open={openTraceId === message.id}
                            onOpenChange={(next) => setOpenTraceId(next ? message.id : null)}
                          />
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
            {assumed ? (
              <div className="analyst-composer">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                  aria-label="Mensagem para Ana"
                  placeholder="{`Escreva para ${firstName}...`}"
                />
                <button type="button" aria-label="Enviar mensagem" onClick={submit} disabled={!draft.trim()}>
                  <Send size={20} />
                </button>
              </div>
            ) : (
              <div className="takeover">
                <div className="takeover-row">
                  <div className="takeover-copy">
                    <span>✋</span>
                    <div>
                      <strong>{firstName} espera um atendente</strong>
                      <small>Agent pausado · até 12:05</small>
                    </div>
                  </div>
                  <button type="button" className="button-secondary" onClick={onReturnToAgent}>
                    <Bot size={17} />
                    Devolver ao agent
                  </button>
                  <button type="button" className="button-primary" onClick={onAssume}>
                    <Headset size={17} />
                    Assumir atendimento
                  </button>
                </div>
                <input disabled placeholder="Assuma o atendimento para responder" />
              </div>
            )}
          </>
        )}
      </section>
      {showTickets && (
        <aside className="ticket-history">
          <header>
            <div>
              <strong>
                Chamados {possessive} {firstName}
              </strong>
              <small>
                {detail?.tickets.filter((ticket) => ticket.status !== "resolvido" && ticket.status !== "fechado").length ?? 0} abertos ·{" "}
                {detail?.tickets.filter((ticket) => ticket.status === "resolvido" || ticket.status === "fechado").length ?? 0} encerrados
              </small>
            </div>
            <button type="button" className="icon-button" onClick={() => setShowTickets(false)} aria-label="Fechar painel de chamados">
              <X size={21} />
            </button>
          </header>
          <div className="history-body">
            <section>
              <h2>Desta conversa</h2>
              {detail?.tickets[0] && (
                <div className="current-ticket">
                  <div>
                    {detail.tickets[0].id}
                    <span>
                      <i className={`status-dot status-${assumed ? "em_andamento" : detail.tickets[0].status}`} />
                      {assumed ? "Em atendimento" : STATUS_LABEL[detail.tickets[0].status]}
                    </span>
                  </div>
                  <strong>{detail.tickets[0].title.replace(" do Windows", "")}</strong>
                  <p>
                    {CATEGORY_LABEL[detail.tickets[0].category]} · prioridade {PRIORITY_LABEL[detail.tickets[0].priority].toLowerCase()}
                  </p>
                  <footer>
                    <Headset size={16} />
                    {assumed ? `Assumido por ${analyst.name}` : "Transferido para um analista"}
                    <time>{assumed ? "10:12" : "10:05"}</time>
                  </footer>
                </div>
              )}
            </section>
            <section>
              <h2>Outros chamados</h2>
              {detail?.tickets.slice(1).map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} />
              ))}
            </section>
          </div>
          <footer>
            <button type="button" className="button-secondary">
              Ver todos os chamados {possessive} {firstName} <ArrowUpRight size={16} />
            </button>
          </footer>
        </aside>
      )}
    </main>
  );
}
