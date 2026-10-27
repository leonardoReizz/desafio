"use client";
import { useState } from "react";
import type { ChatMessage, ConversationDetail, ConversationListFilter, ConversationStatus } from "@nexo/contracts";
import { analyst, assumedMessages, consoleDetail, consoleItems, consoleMessages } from "@/fixtures/demo";
import { ConsoleView } from "./ConsoleView";

function otherDetail(id: string, status: ConversationStatus, sentMessages: ChatMessage[]): ConversationDetail | null {
  const item = consoleItems.find((entry) => entry.id === id);
  if (!item) return null;
  const at = item.lastMessage?.at ?? "2026-10-21T10:00:00.000Z";
  return {
    conversation: {
      id,
      employeeId: item.employee.id,
      status,
      handoffReason: item.handoffReason,
      handoffSummary: item.handoffReason
        ? `${item.employee.name} pediu apoio para: ${item.lastMessage?.text ?? "atendimento de TI"}`
        : null,
      assignedAnalystId: status === "human" ? analyst.id : null,
      relatedTicketId: item.relatedTicketId,
      lastConfidence: item.lastConfidence,
      userMessageCount: 1,
      createdAt: at,
      updatedAt: at,
    },
    employee: {
      ...item.employee,
      email: `${item.employee.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replaceAll(" ", ".")}@nexo.com.br`,
      passwordChangedAt: at,
    },
    messages: [
      ...(item.lastMessage
        ? [
            {
              id: `${id}-last`,
              conversationId: id,
              role: item.lastMessage.role,
              text: item.lastMessage.text,
              authorName: null,
              authorBadge: null,
              blocks: [],
              trace: null,
              createdAt: at,
            } satisfies ChatMessage,
          ]
        : []),
      ...sentMessages,
    ],
    tickets: [],
    assignedAnalyst: status === "human" ? analyst : null,
  };
}
export function ConsoleContainer({ initialAssumed = false }: { initialAssumed?: boolean }) {
  const [status, setStatus] = useState<ConversationStatus>(initialAssumed ? "human" : "waiting_human");
  const [otherStatuses, setOtherStatuses] = useState<Record<string, ConversationStatus>>({});
  const [messages, setMessages] = useState<ChatMessage[]>(initialAssumed ? assumedMessages : consoleMessages);
  const [otherMessages, setOtherMessages] = useState<Record<string, ChatMessage[]>>({});
  const [filter, setFilter] = useState<ConversationListFilter>("para_voce");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>("ana-conversation");
  function updateStatus(next: ConversationStatus) {
    if (!selectedId) return;
    if (selectedId === "ana-conversation") setStatus(next);
    else setOtherStatuses((current) => ({ ...current, [selectedId]: next }));
  }
  function assume() {
    updateStatus("human");
    if (selectedId === "ana-conversation") setMessages(assumedMessages);
    setFilter("minhas");
  }
  function returnToAgent() {
    updateStatus("agent");
    setFilter("com_agent");
  }
  function close() {
    updateStatus("closed");
    setFilter("todas");
  }
  function send(text: string) {
    if (!selectedId) return;
    const next: ChatMessage = {
      id: `analyst-${Date.now()}`,
      conversationId: selectedId,
      role: "analyst",
      text,
      authorName: analyst.name,
      authorBadge: "Suporte N2",
      blocks: [],
      trace: null,
      createdAt: new Date().toISOString(),
    };
    if (selectedId === "ana-conversation") setMessages((current) => [...current, next]);
    else setOtherMessages((current) => ({ ...current, [selectedId]: [...(current[selectedId] ?? []), next] }));
  }
  const selectedItem = consoleItems.find((item) => item.id === selectedId);
  const detail =
    selectedId === "ana-conversation"
      ? consoleDetail(status, messages)
      : selectedItem
        ? otherDetail(selectedItem.id, otherStatuses[selectedItem.id] ?? selectedItem.status, otherMessages[selectedItem.id] ?? [])
        : null;
  return (
    <ConsoleView
      items={consoleItems}
      filter={filter}
      onFilterChange={setFilter}
      search={search}
      onSearchChange={setSearch}
      selectedId={selectedId}
      onSelect={setSelectedId}
      detail={detail}
      analyst={analyst}
      onAssume={assume}
      onReturnToAgent={returnToAgent}
      onClose={close}
      onSendAsAnalyst={send}
      loading={false}
      error={null}
      initialDraft={initialAssumed ? "Ótimo! Vou iniciar o acesso remoto, é só aceitar o pedido que vai aparecer na tela" : ""}
    />
  );
}
