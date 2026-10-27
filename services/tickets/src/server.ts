import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadEnv } from "./env";
import { openDatabase, TicketRepository } from "./repository";
import { buildSeedTickets } from "./seed-data";

const env = loadEnv();
const repo = new TicketRepository(openDatabase(env.TICKETS_DB_PATH));

// Primeira subida sem dados: popula o seed para a aplicação funcionar com "poucos comandos".
if (repo.count() === 0) {
  for (const ticket of buildSeedTickets(new Date())) repo.insertRaw(ticket);
  console.log("[tickets] banco vazio — dados de exemplo criados");
}

const app = createApp({
  repo,
  token: env.TICKETS_SERVICE_TOKEN,
  failureRate: env.TICKETS_FAILURE_RATE,
  latencyMs: env.TICKETS_LATENCY_MS,
});

serve({ fetch: app.fetch, port: env.TICKETS_PORT, hostname: env.TICKETS_HOST }, (info) => {
  console.log(`[tickets] ouvindo em http://${env.TICKETS_HOST}:${info.port} (falha simulada ${env.TICKETS_FAILURE_RATE * 100}%)`);
});
