import type { Affected, Priority } from "@nexo/contracts";
import { PRIORITY_LABEL } from "@nexo/contracts";

/**
 * Sinais que o agent extrai da conversa. A decisão da prioridade é feita aqui, em código,
 * aplicando a tabela do Anexo A — o LLM não "escolhe" a prioridade.
 */
export interface PrioritySignals {
  affected: Affected;
  /** Algo parou / a(s) pessoa(s) não consegue(m) trabalhar. */
  blocksWork: boolean;
  /** Há um compromisso em risco no mesmo dia (reunião, entrega, fechamento). */
  sameDayCommitment: boolean;
  /** Existe alternativa razoável enquanto não resolve. */
  hasWorkaround: boolean;
  /** É um pedido (REQ) sem urgência. */
  isRequest: boolean;
}

export interface PriorityDecision {
  priority: Priority;
  /** Regra aplicada, em pt-BR, para o trace. */
  rule: string;
}

export function classifyPriority(s: PrioritySignals): PriorityDecision {
  const many = s.affected !== "so_eu";
  if (many && s.blocksWork && !s.hasWorkaround) {
    return { priority: "critica", rule: "Algo parado para uma equipe ou para a empresa → Crítica (1 hora)" };
  }
  if (s.sameDayCommitment) {
    return { priority: "alta", rule: "Compromisso em risco no mesmo dia → Alta (4 horas úteis)" };
  }
  if (s.blocksWork && !s.hasWorkaround) {
    return { priority: "alta", rule: "Impede a pessoa de trabalhar → Alta (4 horas úteis)" };
  }
  if (s.isRequest && !s.blocksWork) {
    return { priority: "baixa", rule: "Pedido sem urgência → Baixa (5 dias úteis)" };
  }
  return { priority: "media", rule: "Atrapalha, mas há alternativa → Média (3 dias úteis)" };
}

export function describePriority(p: Priority): string {
  return PRIORITY_LABEL[p];
}
