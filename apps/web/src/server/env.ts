import "server-only";
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // fal = endpoint OpenAI-compatível do fal.ai (OpenRouter por baixo); anthropic = API da Anthropic direto.
  LLM_PROVIDER: z.enum(["fal", "anthropic"]).default("fal"),
  FAL_KEY: z.string().optional(),
  FAL_BASE_URL: z.url().default("https://fal.run/openrouter/router/openai/v1"),
  ANTHROPIC_API_KEY: z.string().optional(),
  // Vazio = padrão do provider (fal: anthropic/claude-opus-5.5; anthropic: claude-opus-5-5).
  LLM_MODEL: z.string().optional(),
  LLM_EFFORT: z.enum(["low", "medium", "high"]).default("low"),
  APP_DB_PATH: z.string().default("./data/app.db"),
  TICKETS_SERVICE_URL: z.url().default("http://localhost:4001"),
  TICKETS_SERVICE_TOKEN: z.string().min(16, "defina TICKETS_SERVICE_TOKEN (>= 16 caracteres)"),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(12),
  DEMO_DAILY_LLM_BUDGET: z.coerce.number().int().min(0).default(0),
});
export type Env = z.infer<typeof Env>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuração inválida: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
