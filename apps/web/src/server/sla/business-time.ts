/**
 * Horário útil do service desk: seg–sex, 8h–18h, horário de Brasília.
 * Brasil não tem horário de verão desde 2019, então um offset fixo de -03:00 é exato e evita
 * depender do fuso do servidor (local, CI e deploy dão o mesmo resultado).
 */
const OFFSET_MS = -3 * 60 * 60 * 1000;
const OPEN_HOUR = 8;
const CLOSE_HOUR = 18;
const HOUR = 60 * 60 * 1000;

/** Converte um instante para um Date cujos campos UTC representam o horário de Brasília. */
function toLocal(d: Date): Date {
  return new Date(d.getTime() + OFFSET_MS);
}
function fromLocal(d: Date): Date {
  return new Date(d.getTime() - OFFSET_MS);
}
function isBusinessDay(local: Date): boolean {
  const dow = local.getUTCDay();
  return dow !== 0 && dow !== 6;
}
function atHour(local: Date, hour: number): Date {
  const x = new Date(local);
  x.setUTCHours(hour, 0, 0, 0);
  return x;
}
/** Próxima abertura do expediente a partir de um instante fora dele. */
function nextBusinessOpening(local: Date): Date {
  let opening = atHour(local, OPEN_HOUR);
  if (isBusinessDay(local) && local.getTime() < opening.getTime()) return opening;
  do opening = new Date(opening.getTime() + 24 * HOUR);
  while (!isBusinessDay(opening));
  return opening;
}

/** Move o instante para dentro do expediente (se já estiver dentro, não muda). */
function clampToBusiness(local: Date): Date {
  if (isBusinessDay(local)) {
    const open = atHour(local, OPEN_HOUR);
    const close = atHour(local, CLOSE_HOUR);
    if (local.getTime() >= open.getTime() && local.getTime() < close.getTime()) return local;
    if (local.getTime() < open.getTime()) return open;
  }
  return nextBusinessOpening(local);
}

export function addBusinessHours(start: Date, hours: number): Date {
  let cursor = clampToBusiness(toLocal(start));
  let remaining = hours * HOUR;
  while (remaining > 0) {
    const close = atHour(cursor, CLOSE_HOUR);
    const available = close.getTime() - cursor.getTime();
    if (remaining <= available) {
      cursor = new Date(cursor.getTime() + remaining);
      remaining = 0;
    } else {
      remaining -= available;
      cursor = nextBusinessOpening(close);
    }
  }
  return fromLocal(cursor);
}

export function addBusinessDays(start: Date, days: number): Date {
  return addBusinessHours(start, days * (CLOSE_HOUR - OPEN_HOUR));
}

/** Horas úteis decorridas entre dois instantes (para "há N dias úteis"). */
export function businessDaysBetween(from: Date, to: Date): number {
  let days = 0;
  let cursor = toLocal(from);
  const end = toLocal(to);
  while (cursor.getTime() < end.getTime()) {
    cursor = new Date(cursor.getTime() + 24 * HOUR);
    if (cursor.getTime() <= end.getTime() && isBusinessDay(cursor)) days++;
  }
  return days;
}

export function formatLocalTime(d: Date): string {
  const l = toLocal(d);
  return `${String(l.getUTCHours()).padStart(2, "0")}:${String(l.getUTCMinutes()).padStart(2, "0")}`;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatLocalDate(d: Date): string {
  const l = toLocal(d);
  return `${String(l.getUTCDate()).padStart(2, "0")} ${MONTHS[l.getUTCMonth()]}`;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  const la = toLocal(a);
  const lb = toLocal(b);
  return la.getUTCFullYear() === lb.getUTCFullYear() && la.getUTCMonth() === lb.getUTCMonth() && la.getUTCDate() === lb.getUTCDate();
}
