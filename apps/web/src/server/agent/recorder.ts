import "server-only";
import { randomUUID } from "node:crypto";
import type { HandoffReason, TraceStep, UiBlock } from "@nexo/contracts";
import { TicketServiceError, TicketServiceUnavailableError } from "../tickets-client/client";

export interface StepOutcome<T> {
  result: T;
  detail: string | null;
  attempts?: number;
}

export interface HandoffRequest {
  reason: HandoffReason;
  summary: string;
  team: "N1" | "N2";
  ticketId: string | null;
}

/**
 * Registra o que o agent efetivamente fez neste turno. Os passos do trace vêm daqui (execução
 * real das tools), nunca do texto do modelo — é isso que torna a transparência confiável.
 */
export class TurnRecorder {
  readonly steps: TraceStep[] = [];
  readonly blocks: UiBlock[] = [];
  readonly rules = new Set<string>();
  readonly guardrails = new Set<string>();
  handoff: HandoffRequest | null = null;
  focusTicketId: string | null = null;

  constructor(private readonly onStep: (step: TraceStep) => void = () => {}) {}

  async run<T>(tool: string, label: string, fn: () => Promise<StepOutcome<T>>): Promise<T> {
    const started = Date.now();
    try {
      const out = await fn();
      const attempts = out.attempts ?? 1;
      this.push({
        tool,
        label,
        status: attempts > 1 ? "recuperado" : "ok",
        durationMs: Date.now() - started,
        detail: out.detail,
        attempts,
      });
      return out.result;
    } catch (e) {
      const attempts = e instanceof TicketServiceUnavailableError ? Math.max(e.attempts, 1) : 1;
      const detail =
        e instanceof TicketServiceUnavailableError
          ? `sistema de chamados indisponível após ${attempts} tentativa(s)`
          : e instanceof TicketServiceError
            ? e.message
            : "falha inesperada";
      this.push({ tool, label, status: "erro", durationMs: Date.now() - started, detail, attempts });
      throw e;
    }
  }

  /** Passo puramente de código (ex.: cálculo de prazo) — também aparece no trace. */
  note(tool: string, label: string, detail: string | null): void {
    this.push({ tool, label, status: "ok", durationMs: 0, detail, attempts: 1 });
  }

  private push(s: Omit<TraceStep, "id">): void {
    const step: TraceStep = { id: randomUUID(), ...s };
    this.steps.push(step);
    this.onStep(step);
  }
}
