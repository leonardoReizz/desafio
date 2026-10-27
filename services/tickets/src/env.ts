import { z } from "zod";

const Env = z.object({
  TICKETS_PORT: z.coerce.number().int().positive().default(4001),
  TICKETS_DB_PATH: z.string().default("./data/tickets.db"),
  TICKETS_SERVICE_TOKEN: z.string().min(16, "TICKETS_SERVICE_TOKEN precisa ter ao menos 16 caracteres"),
  TICKETS_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.15),
  TICKETS_LATENCY_MS: z.coerce.number().int().min(0).default(150),
});
export type Env = z.infer<typeof Env>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuração inválida do serviço de chamados: ${issues}`);
  }
  return parsed.data;
}
