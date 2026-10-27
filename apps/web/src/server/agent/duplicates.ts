import { OPEN_STATUSES, type Category, type Ticket } from "@nexo/contracts";
import { normalize } from "../kb/search";

const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type DuplicateMatch =
  | { kind: "open"; ticket: Ticket; similarity: number }
  | { kind: "reopenable"; ticket: Ticket; similarity: number }
  | { kind: "none" };

function similarity(a: string, b: string): number {
  const ta = new Set(normalize(a));
  const tb = new Set(normalize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

/**
 * Regra "sem duplicidade" do Anexo A aplicada em código: mesmo funcionário, mesma categoria e
 * texto parecido → atualizar o aberto (ou reabrir resolvido há ≤ 7 dias) em vez de criar outro.
 */
export function findDuplicate(
  tickets: readonly Ticket[],
  draft: { category: Category; title: string; description: string },
  now: Date,
  threshold = 0.5,
): DuplicateMatch {
  // Aberto tem precedência sobre reabrível, independentemente do score.
  let open: { ticket: Ticket; similarity: number } | null = null;
  let reopenable: { ticket: Ticket; similarity: number } | null = null;
  for (const t of tickets) {
    if (t.category !== draft.category) continue;
    const score = Math.max(similarity(draft.title, t.title), similarity(`${draft.title} ${draft.description}`, `${t.title} ${t.description}`));
    if (score < threshold) continue;
    if (OPEN_STATUSES.includes(t.status)) {
      if (!open || score > open.similarity) open = { ticket: t, similarity: score };
    } else if (t.resolvedAt && now.getTime() - Date.parse(t.resolvedAt) <= REOPEN_WINDOW_MS) {
      if (!reopenable || score > reopenable.similarity) reopenable = { ticket: t, similarity: score };
    }
  }
  if (open) return { kind: "open", ...open };
  if (reopenable) return { kind: "reopenable", ...reopenable };
  return { kind: "none" };
}
