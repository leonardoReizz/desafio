/** Formatação de datas sempre no fuso de Brasília (o mesmo do expediente e do SLA no servidor). */
const TZ = "America/Sao_Paulo";

const clock = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayMonth = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "short" });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export function formatClock(iso: string): string {
  return clock.format(new Date(iso));
}

/** "16 out" */
export function formatDayMonth(iso: string): string {
  return dayMonth.format(new Date(iso)).replace(".", "").replace(" de ", " ");
}

/** "16 out, 14:20" */
export function formatDateTime(iso: string): string {
  return `${formatDayMonth(iso)}, ${formatClock(iso)}`;
}

function daysBetween(iso: string, now: Date): number {
  const a = Date.parse(`${dayKey.format(new Date(iso))}T00:00:00Z`);
  const b = Date.parse(`${dayKey.format(now)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** "hoje", "ontem", "há 5 dias" */
export function formatRelativeDay(iso: string, now = new Date()): string {
  const d = daysBetween(iso, now);
  if (d <= 0) return "hoje";
  if (d === 1) return "ontem";
  return `há ${d} dias`;
}

/** Horário da lista de conversas: "agora", "10:05", "ontem", "16 out". */
export function formatListTime(iso: string, now = new Date()): string {
  if (now.getTime() - Date.parse(iso) < 2 * 60_000) return "agora";
  const d = daysBetween(iso, now);
  if (d <= 0) return formatClock(iso);
  if (d === 1) return "ontem";
  return formatDayMonth(iso);
}

/** Rótulo do divisor de dia no histórico. */
export function formatDayMarker(iso: string, now = new Date()): string {
  const d = daysBetween(iso, now);
  return d <= 0 ? "Hoje" : d === 1 ? "Ontem" : formatDayMonth(iso);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

const TONES = ["blue", "peach", "purple", "mint", "rose", "gray", "yellow"] as const;

/** Cor estável do avatar a partir do id (mesma pessoa, mesma cor em todas as telas). */
export function avatarTone(id: string): (typeof TONES)[number] {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length]!;
}
