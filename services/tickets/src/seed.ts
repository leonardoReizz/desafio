import { loadEnv } from "./env";
import { openDatabase, TicketRepository } from "./repository";
import { buildSeedTickets } from "./seed-data";

const env = loadEnv();
const repo = new TicketRepository(openDatabase(env.TICKETS_DB_PATH));
repo.reset();
const tickets = buildSeedTickets(new Date());
for (const ticket of tickets) repo.insertRaw(ticket);
console.log(`[tickets] seed concluído: ${tickets.length} chamados`);
