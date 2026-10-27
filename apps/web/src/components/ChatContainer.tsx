"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatStreamEvent, Conversation, Employee, SendMessageInput, TicketDraft, TraceStep } from "@nexo/contracts";
import { api, ApiRequestError, readParam, streamChat } from "@/lib/api";
import { ChatView } from "./ChatView";
import type { DraftEdit } from "./ChatBlocks";

const POLL_MS = 3000;

/** Conversa ainda não criada: o servidor cria na primeira mensagem. */
function blankConversation(employeeId: string): Conversation {
  const now = new Date().toISOString();
  return {
    id: "",
    employeeId,
    status: "agent",
    handoffReason: null,
    handoffSummary: null,
    assignedAnalystId: null,
    relatedTicketId: null,
    lastConfidence: null,
    userMessageCount: 0,
    pendingTicket: null,
    employeeReadAt: null,
    analystReadAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

interface Snapshot {
  conversation: Conversation | null;
  messages: ChatMessage[];
}

type PendingSend = { text: string; action: SendMessageInput["action"] };

/** Chat do funcionário ligado à API: SSE para a resposta do agent, polling enquanto está com analista. */
export function ChatContainer({ employee }: { employee: Employee }) {
  const [conversation, setConversation] = useState<Conversation>(() => blankConversation(employee.id));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingSteps, setPendingSteps] = useState<TraceStep[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailed, setLastFailed] = useState<PendingSend | null>(null);
  const [selectedQuickReply, setSelectedQuickReply] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<DraftEdit | null>(null);
  const [loaded, setLoaded] = useState(false);
  const conversationIdRef = useRef("");
  useEffect(() => {
    conversationIdRef.current = conversation.id;
  }, [conversation.id]);

  const applySnapshot = useCallback(
    (s: Snapshot) => {
      setConversation(s.conversation ?? blankConversation(employee.id));
      setMessages(s.messages);
    },
    [employee.id],
  );

  // "Voltar outro dia e continuar de onde parei": retoma a última conversa aberta.
  useEffect(() => {
    api<Snapshot>(`/api/chat/conversation?${readParam()}`)
      .then(applySnapshot)
      .catch((e: unknown) => setError(e instanceof ApiRequestError ? e.message : "Não foi possível carregar a conversa."))
      .finally(() => setLoaded(true));
  }, [applySnapshot]);

  // Voltar para a aba conta como leitura: avisa o servidor (o analista vê ✓✓ azul).
  useEffect(() => {
    function onVisible() {
      const id = conversationIdRef.current;
      if (document.visibilityState !== "visible" || !id) return;
      api<Snapshot>(`/api/chat/conversation?id=${encodeURIComponent(id)}&read=1`)
        .then((s) => {
          if (conversationIdRef.current === id) applySnapshot(s);
        })
        .catch(() => {});
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [applySnapshot]);

  // Com analista, o agent não responde: buscamos as mensagens do analista periodicamente.
  useEffect(() => {
    if (!conversation.id || conversation.status === "agent" || isSending) return;
    const id = conversation.id;
    const t = window.setInterval(() => {
      api<Snapshot>(`/api/chat/conversation?id=${encodeURIComponent(id)}&${readParam()}`)
        .then((s) => {
          if (conversationIdRef.current === id) applySnapshot(s);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [conversation.id, conversation.status, isSending, applySnapshot]);

  function handleEvent(e: ChatStreamEvent, optimisticId: string) {
    switch (e.type) {
      case "user_message":
        setMessages((current) => {
          // Conversa nova (primeira mensagem ou anterior encerrada): recomeça o histórico.
          if (e.message.conversationId !== conversationIdRef.current) return [e.message];
          return current.map((m) => (m.id === optimisticId ? e.message : m));
        });
        conversationIdRef.current = e.message.conversationId;
        setConversation((c) => (c.id === e.message.conversationId ? { ...c, userMessageCount: c.userMessageCount + 1 } : c));
        break;
      case "step":
        setPendingSteps((s) => [...s, e.step]);
        break;
      case "text_delta":
        setStreamingText((t) => (t ?? "") + e.delta);
        break;
      case "agent_message":
        setMessages((current) => [...current, e.message]);
        setPendingSteps([]);
        setStreamingText(null);
        break;
      case "conversation":
        setConversation(e.conversation);
        // Mensagens de sistema (ex.: divisor de transferência) e cards atualizados vêm do servidor.
        void api<Snapshot>(`/api/chat/conversation?id=${encodeURIComponent(e.conversation.id)}&${readParam()}`)
          .then(applySnapshot)
          .catch(() => {});
        break;
      case "error":
        setError(e.message);
        break;
      case "done":
        break;
    }
  }

  async function send(text: string, action: SendMessageInput["action"] = null) {
    if (isSending) return;
    const optimisticId = `local-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: optimisticId,
      conversationId: conversation.id,
      role: "user",
      text,
      authorName: null,
      authorBadge: null,
      blocks: [],
      trace: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setIsSending(true);
    setError(null);
    setLastFailed(null);
    setPendingSteps([]);
    setStreamingText("");
    try {
      await streamChat({ conversationId: conversation.id || null, text, action }, (e) => handleEvent(e, optimisticId));
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== optimisticId));
      setError(e instanceof ApiRequestError ? e.message : "Não foi possível enviar.");
      setLastFailed({ text, action });
    } finally {
      setIsSending(false);
      setPendingSteps([]);
      setStreamingText(null);
    }
  }

  async function saveDraftEdit(id: string) {
    if (!editingDraft || editingDraft.id !== id) return;
    try {
      const r = await api<{ draft: TicketDraft; message: ChatMessage | null }>(`/api/chat/drafts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ conversationId: conversation.id, title: editingDraft.title, description: editingDraft.description }),
      });
      if (r.message) setMessages((m) => m.map((x) => (x.id === r.message?.id ? r.message : x)));
      setEditingDraft(null);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Não foi possível salvar o rascunho.");
    }
  }

  function draftById(id: string): TicketDraft | null {
    for (const m of messages) for (const b of m.blocks) if (b.kind === "draft" && b.draft.id === id) return b.draft;
    return null;
  }

  if (!loaded)
    return (
      <div role="status" className="page-loading">
        Carregando atendimento…
      </div>
    );

  return (
    <ChatView
      messages={messages}
      conversation={conversation}
      employee={employee}
      pendingSteps={pendingSteps}
      streamingText={streamingText}
      isSending={isSending}
      error={error}
      selectedQuickReply={selectedQuickReply}
      editingDraft={editingDraft}
      onEditChange={setEditingDraft}
      onSaveDraftEdit={(id) => void saveDraftEdit(id)}
      onCancelDraftEdit={() => setEditingDraft(null)}
      onSend={(text) => void send(text)}
      onQuickReply={(value, label) => {
        setSelectedQuickReply(value);
        void send(label, { kind: "quick_reply", value });
      }}
      onSelectTicket={(ticketId, label) => void send(label, { kind: "select_ticket", ticketId })}
      onConfirmDraft={() => void send("Confirmar", { kind: "quick_reply", value: "confirmar_rascunho" })}
      onEditDraft={(id) => {
        const d = draftById(id);
        if (d) setEditingDraft({ id, title: d.title, description: d.description });
      }}
      onCancelDraft={() => void send("Cancelar", { kind: "quick_reply", value: "cancelar_rascunho" })}
      {...(lastFailed ? { onRetry: () => void send(lastFailed.text, lastFailed.action) } : {})}
    />
  );
}
