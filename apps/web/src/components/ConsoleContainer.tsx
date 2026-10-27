"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Analyst, ConversationDetail, ConversationListFilter, ConversationListItem } from "@nexo/contracts";
import { api, ApiRequestError, readParam } from "@/lib/api";
import { ConsoleView } from "./ConsoleView";

const POLL_MS = 3000;
const EMPTY_COUNTS: Record<ConversationListFilter, number> = { todas: 0, para_voce: 0, com_agent: 0, minhas: 0 };

type Detail = ConversationDetail & { ticketsUnavailable: boolean };

function message(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : "Erro inesperado.";
}

/** Console do analista ligado à API: lista com filtros, detalhe e ações de atendimento. */
export function ConsoleContainer({ analyst }: { analyst: Analyst }) {
  const [filter, setFilter] = useState<ConversationListFilter>("para_voce");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const loadList = useCallback(async () => {
    try {
      const data = await api<{ items: ConversationListItem[]; counts: typeof EMPTY_COUNTS }>(
        `/api/console/conversations?filter=${filter}&q=${encodeURIComponent(search)}`,
      );
      setItems(data.items);
      setCounts(data.counts);
      setError(null);
      // Primeira carga: abre a conversa mais antiga esperando atendente.
      if (!selectedRef.current && data.items[0]) setSelectedId(data.items[0].id);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const data = await api<Detail>(`/api/console/conversations/${encodeURIComponent(id)}?${readParam()}`);
      if (selectedRef.current === id) setDetail(data);
    } catch (e) {
      if (selectedRef.current === id) setError(message(e));
    }
  }, []);

  // Polling: primeira carga imediata e depois a cada POLL_MS (callbacks fora do corpo do efeito).
  useEffect(() => {
    const first = window.setTimeout(() => void loadList(), 0);
    const t = window.setInterval(() => void loadList(), POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    const first = window.setTimeout(() => void loadDetail(selectedId), 0);
    const t = window.setInterval(() => void loadDetail(selectedId), POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [selectedId, loadDetail]);

  // Voltar para a aba conta como leitura da conversa aberta.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && selectedRef.current) void loadDetail(selectedRef.current);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadDetail]);

  // Ao trocar de conversa, não mostra o detalhe da anterior enquanto carrega.
  const shownDetail = detail?.conversation.id === selectedId ? detail : null;

  async function act(path: string, body?: unknown): Promise<boolean> {
    if (!selectedId || busy) return false;
    setBusy(true);
    try {
      await api(`/api/console/conversations/${encodeURIComponent(selectedId)}/${path}`, {
        method: "POST",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      setError(null);
      await Promise.all([loadDetail(selectedId), loadList()]);
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConsoleView
      items={items}
      counts={counts}
      filter={filter}
      onFilterChange={setFilter}
      search={search}
      onSearchChange={setSearch}
      selectedId={selectedId}
      onSelect={setSelectedId}
      detail={shownDetail}
      analyst={analyst}
      onAssume={() => void act("assume")}
      onReturnToAgent={() => void act("return")}
      onClose={() => void act("close")}
      onSendAsAnalyst={(text) => void act("messages", { text })}
      onUpdateTicket={(ticketId, status, note) => act(`tickets/${encodeURIComponent(ticketId)}`, { status, note })}
      loading={loading}
      error={error}
      busy={busy}
      ticketsUnavailable={shownDetail?.ticketsUnavailable ?? false}
    />
  );
}
