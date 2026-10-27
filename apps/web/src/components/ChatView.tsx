"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, RotateCcw } from "lucide-react";
import type { ChatMessage, Conversation, Employee, TraceStep } from "@nexo/contracts";
import { MAX_USER_MESSAGES_PER_SESSION } from "@nexo/contracts";
import { ChatBlock, type DraftEdit } from "./ChatBlocks";
import { DecisionTracePanel, TraceStepLine } from "./DecisionTracePanel";
import { EmployeeShell } from "./EmployeeShell";

export interface ChatViewProps {
  messages: ChatMessage[];
  conversation: Conversation;
  employee: Employee;
  pendingSteps: TraceStep[];
  streamingText: string | null;
  isSending: boolean;
  error: string | null;
  selectedQuickReply?: string | null;
  editingDraft?: DraftEdit | null;
  onEditChange: (edit: DraftEdit) => void;
  onSaveDraftEdit: (id: string) => void;
  onCancelDraftEdit: () => void;
  onSend: (text: string) => void;
  onQuickReply: (value: string, label: string) => void;
  onSelectTicket: (ticketId: string, label: string) => void;
  onConfirmDraft: (draftId: string) => void;
  onEditDraft: (draftId: string) => void;
  onCancelDraft: (draftId: string) => void;
  onRetry?: () => void;
}
export function ChatView({
  messages,
  conversation,
  employee,
  pendingSteps,
  streamingText,
  isSending,
  error,
  selectedQuickReply,
  editingDraft,
  onEditChange,
  onSaveDraftEdit,
  onCancelDraftEdit,
  onSend,
  onQuickReply,
  onSelectTicket,
  onConfirmDraft,
  onEditDraft,
  onCancelDraft,
  onRetry,
}: ChatViewProps) {
  const [text, setText] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const limitReached = conversation.userMessageCount >= MAX_USER_MESSAGES_PER_SESSION;
  useEffect(() => {
    if (messages.length > 5) viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);
  function submit() {
    const value = text.trim();
    if (!value || isSending || limitReached) return;
    onSend(value);
    setText("");
  }
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const pending = messages
        .flatMap((message) => message.blocks)
        .find((block) => block.kind === "draft" && block.draft.status === "pending");
      if ((event.metaKey || event.ctrlKey) && pending?.kind === "draft") onConfirmDraft(pending.draft.id);
      else if (!event.metaKey && !event.ctrlKey) submit();
    }
  }
  return (
    <EmployeeShell employee={employee} section="chat" status={conversation.status}>
      <main className={`chat-page ${conversation.relatedTicketId ? "consultation" : ""}`}>
        <div className="chat-scroll" ref={viewport}>
          <div className="chat-thread" aria-live="polite">
            {messages.length === 0 && (
              <div className="chat-empty">
                <h1>Como posso ajudar?</h1>
                <p>Conte o que está acontecendo com a tecnologia da Nexo.</p>
                <div>
                  <button onClick={() => onSend("Preciso de ajuda com a VPN")}>Ajuda com VPN</button>
                  <button onClick={() => onSend("Qual o status do meu chamado?")}>Consultar chamado</button>
                  <button onClick={() => onSend("Quero falar com um analista")}>Falar com analista</button>
                </div>
              </div>
            )}
            {conversation.status !== "agent" && (
              <div className="human-banner">
                {conversation.status === "human" ? "Você está falando com Rafael Lima (Suporte N2)" : "Aguardando um analista…"}
              </div>
            )}
            {messages.map((message) => {
              const quick = message.blocks.find((block) => block.kind === "quick_replies");
              const cards = message.blocks.filter((block) => block.kind !== "quick_replies");
              const cardFirst = cards.some((block) => block.kind === "ticket_card");
              const renderBlock = (block: (typeof message.blocks)[number], index: number) => (
                <ChatBlock
                  key={`${message.id}-${index}`}
                  block={block}
                  selectedQuickReply={selectedQuickReply}
                  editingDraft={editingDraft}
                  onEditChange={onEditChange}
                  onSaveEdit={onSaveDraftEdit}
                  onCancelEdit={onCancelDraftEdit}
                  onQuickReply={onQuickReply}
                  onSelectTicket={onSelectTicket}
                  onConfirmDraft={onConfirmDraft}
                  onEditDraft={onEditDraft}
                  onCancelDraft={onCancelDraft}
                />
              );
              const bubble = (message.text || quick) && (
                <div className="agent-bubble">
                  {message.text}
                  {quick && renderBlock(quick, -1)}
                </div>
              );
              return (
                <div key={message.id} className={`chat-message chat-${message.role}`}>
                  {message.role === "system" ? (
                    <div className="system-divider">
                      <span>⇄ &nbsp;{message.text}</span>
                    </div>
                  ) : message.role === "user" ? (
                    <div className="user-bubble">{message.text}</div>
                  ) : (
                    <div className="agent-content">
                      {message.trace ? (
                        <DecisionTracePanel
                          trace={message.trace}
                          label={message.role === "analyst" ? (message.authorName ?? "Analista") : "Nexo Assist"}
                        />
                      ) : (
                        <div className="message-author">
                          {message.authorName}
                          {message.authorBadge && <span>{message.authorBadge}</span>}
                        </div>
                      )}
                      {cardFirst && cards.map(renderBlock)}
                      {bubble}
                      {!cardFirst && cards.map(renderBlock)}
                    </div>
                  )}
                </div>
              );
            })}
            {(pendingSteps.length > 0 || streamingText !== null) && (
              <div className="chat-message chat-agent">
                <div className="agent-content">
                  <div className="thinking-line">
                    <strong>Nexo Assist</strong>
                    <TraceStepLine steps={pendingSteps} pending />
                  </div>
                  <div className="agent-bubble">{streamingText || "Pensando…"}</div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="composer-wrap">
          {error && (
            <div className="send-error" role="alert">
              {error}{" "}
              <button type="button" onClick={onRetry}>
                <RotateCcw size={14} /> Tentar de novo
              </button>
            </div>
          )}
          {limitReached && <div className="limit-message">Você atingiu o limite de 30 mensagens nesta sessão.</div>}
          <div className="chat-composer">
            <textarea
              aria-label="Mensagem"
              placeholder={limitReached ? "Limite de mensagens atingido" : "Escreva para o Nexo..."}
              value={text}
              disabled={limitReached || isSending}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button type="button" className="button-primary" onClick={submit} disabled={!text.trim() || isSending || limitReached}>
              <ArrowUp size={18} />
              {isSending ? "Enviando" : "Enviar"}
            </button>
          </div>
          <div className="message-counter">
            {conversation.userMessageCount}/{MAX_USER_MESSAGES_PER_SESSION} mensagens nesta sessão
          </div>
        </div>
      </main>
    </EmployeeShell>
  );
}
