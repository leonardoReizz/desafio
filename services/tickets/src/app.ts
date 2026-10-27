import { Hono, type Context } from "hono";
import { timingSafeEqual } from "node:crypto";
import { AddUpdateInput, CreateTicketInput, TransferInput, type ApiError } from "@nexo/contracts";
import type { z } from "zod";
import { DomainError, type TicketRepository } from "./repository";

export interface AppOptions {
  repo: TicketRepository;
  token: string;
  /** Probabilidade (0..1) de responder 503, simulando o legado instável. */
  failureRate: number;
  latencyMs: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

type Vars = { Variables: { requesterId: string } };

const ERROR_STATUS = { not_found: 404, conflict: 409, reopen_window_expired: 422, not_open: 409, forbidden: 403 } as const;

function errorBody(code: string, message: string): ApiError {
  return { error: { code, message } };
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S> | Response> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json(errorBody("invalid_json", "Corpo da requisição não é JSON válido"), 400);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return c.json(errorBody("invalid_input", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")), 400);
  }
  return parsed.data;
}

export function createApp(opts: AppOptions): Hono<Vars> {
  const random = opts.random ?? Math.random;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const app = new Hono<Vars>();

  app.get("/health", (c) => c.json({ ok: true }));

  // Autenticação serviço-a-serviço + identidade do solicitante (privacidade em profundidade).
  app.use("/v1/*", async (c, next) => {
    const auth = c.req.header("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token || !safeEqual(token, opts.token)) return c.json(errorBody("unauthorized", "Token inválido"), 401);
    const requesterId = c.req.header("x-requester-id");
    if (!requesterId) return c.json(errorBody("missing_requester", "Header X-Requester-Id é obrigatório"), 400);
    c.set("requesterId", requesterId);
    await next();
  });

  // Simulação do legado: latência variável e indisponibilidade ocasional.
  app.use("/v1/*", async (c, next) => {
    if (opts.latencyMs > 0) await sleep(opts.latencyMs * (0.5 + random()));
    if (random() < opts.failureRate) {
      c.header("Retry-After", "1");
      return c.json(errorBody("unavailable", "Sistema de chamados temporariamente indisponível"), 503);
    }
    await next();
  });

  app.get("/v1/tickets", (c) => c.json({ tickets: opts.repo.listByRequester(c.get("requesterId")) }));

  app.get("/v1/tickets/:id", (c) => c.json({ ticket: opts.repo.getForRequester(c.req.param("id"), c.get("requesterId")) }));

  app.post("/v1/tickets", async (c) => {
    const body = await parseBody(c, CreateTicketInput);
    if (body instanceof Response) return body;
    // O dono vem do header autenticado, nunca do corpo.
    if (body.requesterId !== c.get("requesterId")) return c.json(errorBody("forbidden", "Solicitante divergente"), 403);
    const { ticket, replayed } = opts.repo.create(body, c.req.header("idempotency-key") ?? null);
    return c.json({ ticket }, replayed ? 200 : 201);
  });

  app.post("/v1/tickets/:id/updates", async (c) => {
    const body = await parseBody(c, AddUpdateInput);
    if (body instanceof Response) return body;
    const ticket = opts.repo.addUpdate(c.req.param("id"), c.get("requesterId"), body, c.req.header("idempotency-key") ?? null);
    return c.json({ ticket });
  });

  app.post("/v1/tickets/:id/transfer", async (c) => {
    const body = await parseBody(c, TransferInput);
    if (body instanceof Response) return body;
    return c.json({ ticket: opts.repo.transfer(c.req.param("id"), c.get("requesterId"), body) });
  });

  app.onError((err, c) => {
    if (err instanceof DomainError) return c.json(errorBody(err.code, err.message), ERROR_STATUS[err.code]);
    console.error("[tickets] erro inesperado", err instanceof Error ? err.message : err);
    return c.json(errorBody("internal", "Erro interno"), 500);
  });

  app.notFound((c) => c.json(errorBody("route_not_found", "Rota não encontrada"), 404));
  return app;
}
