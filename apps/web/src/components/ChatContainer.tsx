"use client";
import { useState } from "react";
import type { ChatMessage, TicketDraft } from "@nexo/contracts";
import { consultationMessages, conversation, employee, newTicketMessages } from "@/fixtures/demo";
import { ChatView } from "./ChatView";
import type { DraftEdit } from "./ChatBlocks";

const makeUser = (text: string, id: string): ChatMessage => ({
  id,
  conversationId: "ana-conversation",
  role: "user",
  text,
  authorName: null,
  authorBadge: null,
  blocks: [],
  trace: null,
  createdAt: new Date().toISOString(),
});
export function ChatContainer({ variant = "novo" }: { variant?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    variant === "consulta" ? consultationMessages : variant === "vazio" ? [] : newTicketMessages,
  );
  const [count, setCount] = useState(variant === "consulta" ? 16 : variant === "limite" ? 30 : 18);
  const [status, setStatus] = useState<"agent" | "waiting_human" | "human">(
    variant === "humano" ? "human" : variant === "aguardando" ? "waiting_human" : "agent",
  );
  const [selectedQuickReply, setSelectedQuickReply] = useState<string | null>("so_eu");
  const [error, setError] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<DraftEdit | null>(null);
  function addUser(text: string) {
    setMessages((current) => [...current, makeUser(text, `demo-${Date.now()}`)]);
    setCount((current) => current + 1);
    setError(null);
  }
  function updateDraft(id: string, patch: Partial<TicketDraft>) {
    setMessages((current) =>
      current.map((message) => ({
        ...message,
        blocks: message.blocks.map((block) =>
          block.kind === "draft" && block.draft.id === id ? { ...block, draft: { ...block.draft, ...patch } } : block,
        ),
      })),
    );
  }
  function quickReply(value: string, label: string) {
    setSelectedQuickReply(value);
    addUser(label);
    if (value === "analista") setStatus("waiting_human");
  }
  return (
    <ChatView
      messages={messages}
      conversation={{ ...conversation(status), userMessageCount: count, relatedTicketId: variant === "consulta" ? "INC-20311" : null }}
      employee={employee}
      pendingSteps={[]}
      streamingText={null}
      isSending={false}
      error={error}
      selectedQuickReply={selectedQuickReply}
      editingDraft={editingDraft}
      onEditChange={setEditingDraft}
      onSaveDraftEdit={(id) => {
        if (editingDraft?.id === id) updateDraft(id, { title: editingDraft.title.trim(), description: editingDraft.description.trim() });
        setEditingDraft(null);
      }}
      onCancelDraftEdit={() => setEditingDraft(null)}
      onSend={addUser}
      onQuickReply={quickReply}
      onSelectTicket={(_, label) => addUser(label)}
      onConfirmDraft={(id) => updateDraft(id, { status: "confirmed", resultTicketId: "INC-20517" })}
      onEditDraft={(id) => {
        const currentDraft = messages.flatMap((message) => message.blocks).find((block) => block.kind === "draft" && block.draft.id === id);
        if (currentDraft?.kind === "draft")
          setEditingDraft({ id, title: currentDraft.draft.title, description: currentDraft.draft.description });
      }}
      onCancelDraft={(id) => updateDraft(id, { status: "cancelled" })}
      onRetry={() => setError(null)}
    />
  );
}
