import "server-only";
import { Agent, type AgentConfig } from "@mastra/core/agent";
import { z } from "zod";
import { AgentAction, Intent } from "@nexo/contracts";
import { env, type Env } from "../env";
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

type ProviderOptions =
  | { fal: { reasoning: { effort: Env["LLM_EFFORT"] } } }
  | { anthropic: { effort: Env["LLM_EFFORT"]; cacheControl: { type: "ephemeral" }; structuredOutputMode: "auto" } };

/** Modelo e opções do provider configurado. Chaves só vêm do .env. */
function resolveModel(): { modelId: string; model: AgentConfig["model"]; providerOptions: ProviderOptions } {
  const { LLM_PROVIDER, LLM_MODEL, LLM_EFFORT, FAL_KEY, FAL_BASE_URL, ANTHROPIC_API_KEY } = env();
  if (LLM_PROVIDER === "fal") {
    if (!FAL_KEY) throw new LlmNotConfiguredError("FAL_KEY não configurada");
    const modelId = LLM_MODEL || "anthropic/claude-opus-5.5";
    return {
      modelId,
      // Endpoint OpenAI-compatível do fal.ai (OpenRouter por baixo); o fal autentica com "Key", não "Bearer".
      model: { providerId: "fal", modelId, url: FAL_BASE_URL, headers: { Authorization: `Key ${FAL_KEY}` } },
      // Campos extras vão no corpo da requisição: esforço de raciocínio no formato do OpenRouter.
      providerOptions: { fal: { reasoning: { effort: LLM_EFFORT } } },
    };
  }
  if (!ANTHROPIC_API_KEY) throw new LlmNotConfiguredError("ANTHROPIC_API_KEY não configurada");
  const modelId = LLM_MODEL || "claude-opus-5-5";
  return {
    modelId,
    model: { id: `anthropic/${modelId}` as const, apiKey: ANTHROPIC_API_KEY },
    providerOptions: {
      anthropic: {
        effort: LLM_EFFORT,
        // Prompt de sistema + tools são estáveis: cache de prefixo reduz custo por mensagem.
        cacheControl: { type: "ephemeral" },
        structuredOutputMode: "auto",
      },
    },
  };
}

/** Runner real: Mastra Agent + Claude (via fal.ai ou Anthropic direto). */
export const mastraRunner: AgentRunner = {
  async run({ messages, tools, onReplyDelta, signal }) {
    const { modelId, model, providerOptions } = resolveModel();
    const agent = new Agent({ id: "nexo-assist", name: "Nexo Assist", instructions: AGENT_INSTRUCTIONS, model, tools });

    const modelMessages = messages.map((m) =>
      m.role === "user" ? { role: "user" as const, content: m.content } : { role: "assistant" as const, content: m.content },
    );
    const stream = await agent.stream(modelMessages, {
      maxSteps: 6,
      abortSignal: signal,
      modelSettings: { maxOutputTokens: 1500 },
      providerOptions,
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
      model: modelId,
    };
  },
};
