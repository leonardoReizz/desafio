import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { AuthError } from "./auth/session";
import { InvalidTransitionError } from "./conversations/state";
import { TicketServiceError, TicketServiceUnavailableError } from "./tickets-client/client";

export function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequest("Corpo inválido");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new BadRequest(parsed.error.issues.map((i) => `${i.path.join(".") || "corpo"}: ${i.message}`).join("; "));
  return parsed.data;
}

export class BadRequest extends Error {}
export class NotFound extends Error {}

/** Mapeia erros conhecidos para respostas sem detalhes internos; o resto vira 500 genérico. */
export function handleError(e: unknown): NextResponse {
  if (e instanceof AuthError) return jsonError(e.status, e.status === 401 ? "unauthenticated" : "forbidden", e.message);
  if (e instanceof BadRequest) return jsonError(400, "invalid_input", e.message);
  if (e instanceof NotFound) return jsonError(404, "not_found", e.message);
  if (e instanceof InvalidTransitionError) return jsonError(409, "invalid_transition", "A conversa não está em um estado que permita essa ação.");
  if (e instanceof TicketServiceUnavailableError) return jsonError(503, "tickets_unavailable", "O sistema de chamados está instável. Tente de novo em instantes.");
  if (e instanceof TicketServiceError) return jsonError(e.status === 404 ? 404 : 502, e.code, e.status === 404 ? "Não encontrado" : "Erro no sistema de chamados");
  console.error("[api] erro inesperado", e instanceof Error ? e.message : "desconhecido");
  return jsonError(500, "internal", "Erro inesperado. Tente de novo.");
}

export async function route(fn: () => Promise<NextResponse | Response>): Promise<NextResponse | Response> {
  try {
    return await fn();
  } catch (e) {
    return handleError(e);
  }
}
