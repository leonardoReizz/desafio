import "server-only";
import { db } from "./db/client";
import { env } from "./env";
import { RateLimited } from "./http";

/** Janela deslizante em memória por chave (usuário/IP). Suficiente para uma instância. */
const buckets = new Map<string, number[]>();
let lastSweep = 0;

/** Remove chaves sem acesso no último minuto (evita crescer sem limite com muitos IPs). */
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, hits] of buckets) if ((hits.at(-1) ?? 0) <= now - 60_000) buckets.delete(key);
}

export function allowRequest(key: string, limitPerMinute: number, now = Date.now()): boolean {
  sweep(now);
  const windowStart = now - 60_000;
  const hits = (buckets.get(key) ?? []).filter((t) => t > windowStart);
  if (hits.length >= limitPerMinute) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Orçamento diário de chamadas ao LLM (DEMO_DAILY_LLM_BUDGET; 0 = ilimitado). Persistido no banco. */
export function consumeLlmBudget(): boolean {
  const budget = env().DEMO_DAILY_LLM_BUDGET;
  const day = today();
  db().prepare("INSERT OR IGNORE INTO llm_usage (day) VALUES (?)").run(day);
  if (budget > 0) {
    const row = db().prepare<[string], { calls: number }>("SELECT calls FROM llm_usage WHERE day = ?").get(day);
    if ((row?.calls ?? 0) >= budget) return false;
  }
  db().prepare("UPDATE llm_usage SET calls = calls + 1 WHERE day = ?").run(day);
  return true;
}

export function recordLlmUsage(usage: { inputTokens: number; outputTokens: number }): void {
  db()
    .prepare("UPDATE llm_usage SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ? WHERE day = ?")
    .run(usage.inputTokens, usage.outputTokens, today());
}

/**
 * IP do cliente atrás do proxy (nginx do CapRover). O primeiro valor de X-Forwarded-For vem do
 * cliente e pode ser forjado; X-Real-IP e o último valor são escritos pelo proxy.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwarded || "local";
}

/** Ações que alteram estado no console (assumir, responder, mexer em chamado). */
export function limitAnalystAction(analystId: string): void {
  if (!allowRequest(`console:${analystId}`, env().CONSOLE_RATE_LIMIT_PER_MINUTE)) throw new RateLimited();
}
