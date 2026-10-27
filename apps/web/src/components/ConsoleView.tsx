"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  ChevronRight,
  CircleCheck,
  FileText,
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
import { avatarTone, formatClock, formatDayMarker, formatDayMonth, formatListTime, initials } from "@/lib/format";
import { Brand } from "./Brand";
import { LogoutButton } from "./LogoutButton";
import { isReadBy, ReadReceipt } from "./ReadReceipt";
import { DecisionTracePanel } from "./DecisionTracePanel";

const filterLabels: { id: ConversationListFilter; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "para_voce", label: "Para você" },
  { id: "com_agent", label: "Com o agent" },
  { id: "minhas", label: "Minhas" },
];
function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
}
function listStatus(item: ConversationListItem, analystId: string) {
  if (item.status === "waiting_human" && item.handoffReason === "baixa_confianca")
    return { text: `Agent pediu ajuda · confiança ${Math.round((item.lastConfidence ?? 0) * 100)}%`, tone: "amber" };
  if (item.status === "waiting_human") {
    const waiting = item.waitingSince ? `aguarda há ${minutesSince(item.waitingSince)} min` : "aguardando";
    return { text: item.relatedTicketId ? `Transferida · ${item.relatedTicketId}` : `Transferida · ${waiting}`, tone: "red" };
  }
  if (item.status === "human")
    return item.assignedAnalystId === analystId
      ? { text: "Você está atendendo", tone: "blue" }
      : { text: "Com outro analista", tone: "gray" };
  if (item.status === "closed") return { text: item.assignedAnalystId ? "Encerrada pelo analista" : "Resolvida pelo agent", tone: "gray" };
  return { text: "Agent atendendo", tone: "green" };
}
/** Momento do último evento de sistema que contém o texto (transferência, assumiu…). */
function systemEventAt(detail: ConversationDetail, needle: string): string | null {
  return [...detail.messages].reverse().find((m) => m.role === "system" && m.text.includes(needle))?.createdAt ?? null;
}
function TicketRow({ ticket }: { ticket: TicketView }) {
  return (
    <button type="button" className="history-ticket">
      <span className={`status-dot status-${ticket.status}`} />
      <span>
        <strong>{ticket.title}</strong>
        <small>
          {ticket.id} · {STATUS_LABEL[ticket.status]}
          {ticket.resolvedAt && ` em ${formatDayMonth(ticket.resolvedAt)}`}
        </small>
      </span>
      <ChevronRight size={17} />
    </button>
  );
}
const CLOSED_STATUSES = new Set<TicketView["status"]>(["resolvido", "fechado"]);
export interface ConsoleViewProps {
  items: ConversationListItem[];
  counts: Record<ConversationListFilter, number>;
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
  /** Ação em andamento (assumir/devolver/encerrar/enviar): desabilita botões contra duplo clique. */
  busy?: boolean;
  ticketsUnavailable?: boolean;
  initialDraft?: string;
}
export function ConsoleView({
  items,
  counts,
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
  busy = false,
  ticketsUnavailable = false,
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
  // Celular: um painel por vez (lista ↔ conversa). Telas estreitas: chamados viram gaveta sobreposta.
  const [pane, setPane] = useState<"list" | "chat">("list");
  const [ticketsDrawer, setTicketsDrawer] = useState(false);
  const isNarrow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1050px)").matches;
  function toggleTickets(open: boolean) {
    if (isNarrow()) setTicketsDrawer(open);
    else setShowTickets(open);
  }
  // Filtro e busca são aplicados no servidor; aqui só renderizamos.
  const filtered = items;
  const status = detail?.conversation.status;
  const assumed = status === "human" && detail?.conversation.assignedAnalystId === analyst.id;
  const firstName = detail?.employee.name.split(" ")[0] ?? "funcionário";
  const [showAllTickets, setShowAllTickets] = useState(false);
  const related = detail?.tickets.find((t) => t.id === detail.conversation.relatedTicketId) ?? null;
  const others = (detail?.tickets ?? []).filter(
    (t) => t.id !== related?.id && (showAllTickets || !CLOSED_STATUSES.has(t.status) || t.resolvedAt),
  );
  const transferredAt = detail ? systemEventAt(detail, "Transferida") : null;
  const assumedAt = detail ? systemEventAt(detail, "assumiu") : null;
  // Meta de primeira resposta do analista após a transferência: 2 horas.
  const pausedUntil = transferredAt ? formatClock(new Date(Date.parse(transferredAt) + 2 * 3_600_000).toISOString()) : null;
  function submit() {
    if (!draft.trim() || !assumed) return;
    onSendAsAnalyst(draft.trim());
    setDraft("");
  }
  return (
    <main className={`console-shell pane-${pane} ${showTickets ? "" : "no-tickets"} ${ticketsDrawer ? "tickets-open" : ""}`}>
      <aside className="console-rail">
        <Brand compact />
        <button type="button" className="rail-current" aria-label="Conversas" onClick={() => setPane("list")}>
          <MessageCircle size={22} />
          {counts.para_voce > 0 && <span>{counts.para_voce}</span>}
        </button>
        <div className="rail-spacer" />
        <LogoutButton compact />
        <span className="rail-avatar" title={`${analyst.name} · Suporte ${analyst.team}`}>
          {initials(analyst.name)}
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
                {option.id !== "todas" && counts[option.id] > 0 && <b>{counts[option.id]}</b>}
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
              const state = listStatus(item, analyst.id);
              const preview = item.lastMessage ? `${item.lastMessage.role === "agent" ? "Nexo: " : ""}${item.lastMessage.text}` : "";
              return (
                <button
                  type="button"
                  className={`conversation-item ${item.id === selectedId ? "selected" : ""}`}
                  key={item.id}
                  onClick={() => {
                    onSelect(item.id);
                    setPane("chat");
                  }}
                >
                  <span className={`list-avatar ${avatarTone(item.employee.id)}`}>
                    {initials(item.employee.name)}
                    <i />
                  </span>
                  <span className="item-body">
                    <span className="item-name">
                      {item.employee.name}
                      <time className={item.unreadCount > 0 ? "unread-time" : ""}>
                        {item.lastMessage ? formatListTime(item.lastMessage.at) : ""}
                      </time>
                    </span>
                    <span className="item-preview">{preview}</span>
                    <span className={`item-status ${state.tone}`}>
                      <i />
                      {state.text}
                    </span>
                  </span>
                  {item.unreadCount > 0 && item.id !== selectedId && <b className="unread">{item.unreadCount}</b>}
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
              <button
                type="button"
                className="icon-button mobile-back"
                onClick={() => {
                  setPane("list");
                  setTicketsDrawer(false);
                }}
                aria-label="Voltar para as conversas"
              >
                <ArrowLeft size={20} />
              </button>
              <span className={`avatar ${avatarTone(detail.employee.id)}`}>{initials(detail.employee.name)}</span>
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
                    <button type="button" className="button-secondary" onClick={onReturnToAgent} disabled={busy}>
                      <Bot size={17} />
                      Devolver ao agent
                    </button>
                    <button type="button" className="button-danger" onClick={onClose} disabled={busy}>
                      <CircleCheck size={17} />
                      Encerrar atendimento
                    </button>
                  </>
                ) : status === "waiting_human" ? (
                  <span className="waiting-pill">
                    <Bot size={16} />
                    Aguardando atendente
                  </span>
                ) : (
                  <span className="waiting-pill neutral">
                    <Bot size={16} />
                    {status === "agent"
                      ? "Com o agent"
                      : status === "closed"
                        ? "Encerrada"
                        : `Com ${detail.assignedAnalyst?.name ?? "outro analista"}`}
                  </span>
                )}
                <button
                  type="button"
                  className="icon-button tickets-toggle"
                  onClick={() => toggleTickets(isNarrow() ? !ticketsDrawer : !showTickets)}
                  aria-label="Chamados do funcionário"
                  aria-pressed={showTickets}
                >
                  <FileText size={19} />
                </button>
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
                {detail.messages[0] && <div className="day-marker">{formatDayMarker(detail.messages[0].createdAt)}</div>}
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
                              {formatClock(message.createdAt)}
                              <ReadReceipt read={isReadBy(detail.conversation.employeeReadAt, message.createdAt)} />
                            </small>
                          </button>
                        ) : (
                          <div className="console-bubble">
                            {message.text}
                            <small>
                              {formatClock(message.createdAt)}
                              {message.role !== "user" && (
                                <ReadReceipt read={isReadBy(detail.conversation.employeeReadAt, message.createdAt)} />
                              )}
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
                  aria-label={`Mensagem para ${firstName}`}
                  placeholder={`Escreva para ${firstName}...`}
                />
                <button type="button" aria-label="Enviar mensagem" onClick={submit} disabled={!draft.trim() || busy}>
                  <Send size={20} />
                </button>
              </div>
            ) : status === "waiting_human" ? (
              <div className="takeover">
                <div className="takeover-row">
                  <div className="takeover-copy">
                    <span>✋</span>
                    <div>
                      <strong>{firstName} espera um atendente</strong>
                      <small>Agent pausado{pausedUntil && ` · responder até ${pausedUntil}`}</small>
                    </div>
                  </div>
                  <button type="button" className="button-secondary" onClick={onReturnToAgent} disabled={busy}>
                    <Bot size={17} />
                    Devolver ao agent
                  </button>
                  <button type="button" className="button-primary" onClick={onAssume} disabled={busy}>
                    <Headset size={17} />
                    Assumir atendimento
                  </button>
                </div>
                <input disabled placeholder="Assuma o atendimento para responder" />
              </div>
            ) : (
              <div className="takeover">
                <input
                  disabled
                  placeholder={
                    status === "agent"
                      ? "O Nexo Assist está atendendo esta conversa"
                      : status === "closed"
                        ? "Atendimento encerrado"
                        : `Em atendimento por ${detail.assignedAnalyst?.name ?? "outro analista"}`
                  }
                />
              </div>
            )}
          </>
        )}
      </section>
      {
        <aside className="ticket-history">
          <header>
            <div>
              <strong>Chamados de {firstName}</strong>
              <small>
                {ticketsUnavailable
                  ? "sistema de chamados instável"
                  : `${detail?.tickets.filter((t) => !CLOSED_STATUSES.has(t.status)).length ?? 0} abertos · ${
                      detail?.tickets.filter((t) => CLOSED_STATUSES.has(t.status)).length ?? 0
                    } encerrados`}
              </small>
            </div>
            <button type="button" className="icon-button" onClick={() => toggleTickets(false)} aria-label="Fechar painel de chamados">
              <X size={21} />
            </button>
          </header>
          <div className="history-body">
            <section>
              <h2>Desta conversa</h2>
              {related ? (
                <div className="current-ticket">
                  <div>
                    {related.id}
                    <span>
                      <i className={`status-dot status-${assumed ? "em_andamento" : related.status}`} />
                      {assumed ? "Em atendimento" : STATUS_LABEL[related.status]}
                    </span>
                  </div>
                  <strong>{related.title}</strong>
                  <p>
                    {CATEGORY_LABEL[related.category]} · prioridade {PRIORITY_LABEL[related.priority].toLowerCase()} · {related.sla.label}
                  </p>
                  {(assumed && assumedAt) || transferredAt ? (
                    <footer>
                      <Headset size={16} />
                      {assumed ? `Assumido por ${analyst.name}` : "Transferido para um analista"}
                      <time>{formatClock((assumed ? assumedAt : transferredAt) ?? "")}</time>
                    </footer>
                  ) : null}
                </div>
              ) : (
                <p className="history-empty">Nenhum chamado ligado a esta conversa.</p>
              )}
            </section>
            <section>
              <h2>Outros chamados</h2>
              {others.map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} />
              ))}
            </section>
          </div>
          <footer>
            <button type="button" className="button-secondary" onClick={() => setShowAllTickets((v) => !v)}>
              {showAllTickets ? "Mostrar só os recentes" : `Ver todos os chamados de ${firstName}`} <ArrowUpRight size={16} />
            </button>
          </footer>
        </aside>
      }
    </main>
  );
}
