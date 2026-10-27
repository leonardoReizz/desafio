import "server-only";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { AgentAction, Intent } from "@nexo/contracts";
import { env } from "../env";
import { AGENT_INSTRUCTIONS } from "./prompt";
import type { createAgentTools } from "./tools";

/** Decisão estruturada que o modelo devolve junto com a resposta (base do trace). */
export const AgentDecision = z.object({
  resposta: z.string().min(1).max(1200),
  intencao: Intent,
  entendimento: z.string().max(300),
  acao: AgentAction,
  justificativa: z.string().max(600),
  regras: z.array(z.string().max(160)).max(6),
  confianca: z.number().min(0).max(1),
});
export type AgentDecision = z.infer<typeof AgentDecision>;

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RunnerResult {
  decision: AgentDecision | null;
  fallbackText: string;
  usage: { inputTokens: number; outputTokens: number } | null;
  model: string;
}

export interface AgentRunner {
  run(args: {
    messages: LlmMessage[];
    tools: ReturnType<typeof createAgentTools>;
    onReplyDelta: (delta: string) => void;
    signal: AbortSignal;
  }): Promise<RunnerResult>;
}

export class LlmNotConfiguredError extends Error {}

/** Runner real: Mastra Agent + Claude. */
export const mastraRunner: AgentRunner = {
  async run({ messages, tools, onReplyDelta, signal }) {
    const { ANTHROPIC_API_KEY, LLM_MODEL, LLM_EFFORT } = env();
    if (!ANTHROPIC_API_KEY) throw new LlmNotConfiguredError("ANTHROPIC_API_KEY não configurada");
    const agent = new Agent({
      id: "nexo-assist",
      name: "Nexo Assist",
      instructions: AGENT_INSTRUCTIONS,
      // Model router do Mastra (usa o provider Anthropic do AI SDK por baixo); chave vem do .env.
      model: { id: `anthropic/${LLM_MODEL}` as const, apiKey: ANTHROPIC_API_KEY },
      tools,
    });

    const modelMessages = messages.map((m) =>
      m.role === "user" ? { role: "user" as const, content: m.content } : { role: "assistant" as const, content: m.content },
    );
    const stream = await agent.stream(modelMessages, {
      maxSteps: 6,
      abortSignal: signal,
      modelSettings: { maxOutputTokens: 1500 },
      providerOptions: {
        anthropic: {
          effort: LLM_EFFORT,
          // Prompt de sistema + tools são estáveis: cache de prefixo reduz custo por mensagem.
          cacheControl: { type: "ephemeral" },
          structuredOutputMode: "auto",
        },
      },
      structuredOutput: { schema: AgentDecision },
    });

    // Streaming da resposta: o campo `resposta` chega parcial no objeto estruturado.
    let sent = "";
    for await (const partial of stream.objectStream) {
      const reply = (partial as { resposta?: unknown }).resposta;
      if (typeof reply === "string" && reply.length > sent.length && reply.startsWith(sent)) {
        onReplyDelta(reply.slice(sent.length));
        sent = reply;
      }
    }

    const object = await stream.object.catch(() => null);
    const parsed = AgentDecision.safeParse(object);
    const usage = await stream.usage.catch(() => null);
    return {
      decision: parsed.success ? parsed.data : null,
      fallbackText: parsed.success ? "" : await stream.text.catch(() => ""),
      usage: usage ? { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 } : null,
      model: LLM_MODEL,
    };
  },
};
