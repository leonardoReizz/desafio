import { z } from "zod";
import { ApiError, Ticket, type AddUpdateInput, type CreateTicketInput, type TransferInput } from "@nexo/contracts";

export class TicketServiceUnavailableError extends Error {
  constructor(readonly attempts: number) {
    super("Sistema de chamados indisponível");
  }
}

export class TicketServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface CallResult<T> {
  data: T;
  attempts: number;
}

export interface TicketsClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const TicketEnvelope = z.object({ ticket: Ticket });
const TicketListEnvelope = z.object({ tickets: z.array(Ticket) });

/**
 * Cliente do sistema legado. O legado fica indisponível por alguns segundos de vez em quando, então:
 * - timeout por tentativa;
 * - retry com backoff exponencial + jitter só em falhas transitórias (5xx, timeout, rede);
 * - Idempotency-Key em escritas, para o retry nunca duplicar chamado;
 * - circuit breaker: após falhas seguidas, falha rápido por alguns segundos em vez de empilhar espera.
 */
export class TicketsClient {
  private consecutiveFailures = 0;
  private openUntil = 0;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  static readonly BREAKER_THRESHOLD = 5;
  static readonly BREAKER_COOLDOWN_MS = 10_000;

  constructor(private readonly opts: TicketsClientOptions) {
    this.timeoutMs = opts.timeoutMs ?? 3000;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 250;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
  }

  async listByRequester(requesterId: string): Promise<CallResult<Ticket[]>> {
    const r = await this.request("GET", "/v1/tickets", requesterId, TicketListEnvelope);
    return { data: r.data.tickets, attempts: r.attempts };
  }

  async get(ticketId: string, requesterId: string): Promise<CallResult<Ticket>> {
    const r = await this.request("GET", `/v1/tickets/${encodeURIComponent(ticketId)}`, requesterId, TicketEnvelope);
    return { data: r.data.ticket, attempts: r.attempts };
  }

  async create(input: CreateTicketInput, idempotencyKey: string): Promise<CallResult<Ticket>> {
    const r = await this.request("POST", "/v1/tickets", input.requesterId, TicketEnvelope, input, idempotencyKey);
    return { data: r.data.ticket, attempts: r.attempts };
  }

  async addUpdate(ticketId: string, requesterId: string, input: AddUpdateInput, idempotencyKey: string): Promise<CallResult<Ticket>> {
    const r = await this.request(
      "POST",
      `/v1/tickets/${encodeURIComponent(ticketId)}/updates`,
      requesterId,
      TicketEnvelope,
      input,
      idempotencyKey,
    );
    return { data: r.data.ticket, attempts: r.attempts };
  }

  async transfer(ticketId: string, requesterId: string, input: TransferInput): Promise<CallResult<Ticket>> {
    const r = await this.request("POST", `/v1/tickets/${encodeURIComponent(ticketId)}/transfer`, requesterId, TicketEnvelope, input);
    return { data: r.data.ticket, attempts: r.attempts };
  }

  private async request<S extends z.ZodType>(
    method: "GET" | "POST",
    path: string,
    requesterId: string,
    schema: S,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<CallResult<z.infer<S>>> {
    if (this.now() < this.openUntil) throw new TicketServiceUnavailableError(0);

    let attempt = 0;
    while (attempt < this.maxAttempts) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
          method,
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${this.opts.token}`,
            "x-requester-id": requesterId,
            ...(body !== undefined ? { "content-type": "application/json" } : {}),
            ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });

        if (res.status >= 500) throw new TransientError(`HTTP ${res.status}`);

        const json: unknown = await res.json();
        if (!res.ok) {
          const err = ApiError.safeParse(json);
          this.recordSuccess(); // respondeu: o serviço está de pé, o erro é de negócio
          throw new TicketServiceError(
            res.status,
            err.success ? err.data.error.code : "unknown",
            err.success ? err.data.error.message : `HTTP ${res.status}`,
          );
        }
        this.recordSuccess();
        return { data: schema.parse(json), attempts: attempt };
      } catch (e) {
        if (e instanceof TicketServiceError) throw e;
        const transient = e instanceof TransientError || (e instanceof Error && (e.name === "AbortError" || e.name === "TypeError"));
        if (!transient) throw e;
        if (attempt >= this.maxAttempts) {
          this.recordFailure();
          throw new TicketServiceUnavailableError(attempt);
        }
        const backoff = this.baseDelayMs * 2 ** (attempt - 1);
        await this.sleep(backoff + Math.random() * backoff * 0.3);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new TicketServiceUnavailableError(attempt);
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
  }

  private recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= TicketsClient.BREAKER_THRESHOLD) {
      this.openUntil = this.now() + TicketsClient.BREAKER_COOLDOWN_MS;
      this.consecutiveFailures = 0;
    }
  }
}

class TransientError extends Error {}
