import { SendMessageInput, type ChatStreamEvent } from "@nexo/contracts";
import { requireEmployee } from "@/server/auth/session";
import { conversations, ticketsClient } from "@/server/container";
import { env } from "@/server/env";
import { jsonError, parseJson, route } from "@/server/http";
import { mastraRunner } from "@/server/agent/llm";
import { runEmployeeTurn } from "@/server/agent/run-turn";
import { allowRequest, consumeLlmBudget, recordLlmUsage } from "@/server/rate-limit";

/** Envia uma mensagem e devolve a resposta do agent em tempo real (Server-Sent Events). */
export async function POST(req: Request) {
  return route(async () => {
    const employee = await requireEmployee();
    if (!allowRequest(`chat:${employee.id}`, env().RATE_LIMIT_PER_MINUTE)) {
      return jsonError(429, "rate_limited", "Muitas mensagens em pouco tempo. Aguarde alguns segundos.");
    }
    const input = await parseJson(req, SendMessageInput);

    const encoder = new TextEncoder();
    const abort = new AbortController();
    req.signal.addEventListener("abort", () => abort.abort());

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: ChatStreamEvent) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            // cliente desconectou; o turno continua e fica persistido
          }
        };
        try {
          await runEmployeeTurn(
            { employee, conversationId: input.conversationId, text: input.text, action: input.action },
            {
              deps: { tickets: ticketsClient(), conversations: conversations(), now: () => new Date() },
              runner: mastraRunner,
              emit,
              signal: abort.signal,
              consumeLlmBudget,
              recordUsage: recordLlmUsage,
            },
          );
        } catch (e) {
          console.error("[chat] falha no turno", e instanceof Error ? e.message : "desconhecido");
          emit({ type: "error", code: "internal", message: "Não consegui processar sua mensagem. Tente de novo." });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
    });
  });
}
