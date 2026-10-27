import { normalize } from "../kb/search";

/**
 * Detecção determinística de confirmações/cancelamentos curtos. É usada como guardrail (o modelo
 * não consegue gravar um chamado sem que o funcionário tenha confirmado) e como atalho sem LLM
 * quando há rascunho pendente e a resposta é inequívoca ("sim", "pode criar").
 */
const CONFIRM = [
  /^(sim|s|ok|okay|isso|confirmo|confirmado|confirmar|certo|correto|perfeito|beleza|blz|fechado|positivo)$/,
  /^(sim|ok|isso|perfeito|certo)?\s*(pode|podes)\s+(criar|abrir|registrar|mandar|enviar|confirmar|seguir|atualizar|reabrir)/,
  /^(pode|podes)\s+(sim|ser)$/,
  /^(esta|ta)\s+(certo|correto|ok|otimo)/,
  /^confirm/,
];

const CANCEL = [/^(nao|n|cancela|cancelar|cancele|desisto|deixa|esquece)(\s|$)/, /^nao\s+(precisa|quero|obrigad)/];

function canonical(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isExplicitConfirmation(text: string): boolean {
  const t = canonical(text);
  if (t.length === 0 || t.length > 60) return false;
  // "sim, mas muda a prioridade" não é confirmação pura.
  if (/\b(mas|porem|so que|exceto|muda|altera|troca|corrige)\b/.test(t)) return false;
  return CONFIRM.some((r) => r.test(t));
}

export function isExplicitCancel(text: string): boolean {
  const t = canonical(text);
  if (t.length === 0 || t.length > 40) return false;
  return CANCEL.some((r) => r.test(t));
}

/** Pedido direto de humano, para atalho sem LLM. */
export function asksForHuman(text: string): boolean {
  const t = normalize(text).join(" ");
  return /\b(falar|conversar|chamar|quero|preciso)\b.*\b(analista|atendente|humano|pessoa|alguem)\b/.test(t);
}
