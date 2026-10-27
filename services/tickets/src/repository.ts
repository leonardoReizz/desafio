import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  OPEN_STATUSES,
  Ticket,
  type AddUpdateInput,
  type CreateTicketInput,
  type TicketStatus,
  type TicketUpdate,
  type TransferInput,
} from "@nexo/contracts";

const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export class DomainError extends Error {
  constructor(
    readonly code: "not_found" | "conflict" | "reopen_window_expired" | "not_open",
    message: string,
  ) {
    super(message);
  }
}

interface TicketRow {
  id: string;
  type: string;
  title: string;
  description: string;
  category: string;
  subcategory: string | null;
  priority: string;
  affected: string;
  status: string;
  requester_id: string;
  assigned_team: string | null;
  created_at: string;
  updated_at: string;
  last_service_update_at: string | null;
  resolved_at: string | null;
}

interface UpdateRow {
  id: string;
  ticket_id: string;
  at: string;
  author: string;
  author_name: string;
  text: string;
}

export function openDatabase(path: string): Database.Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT,
      priority TEXT NOT NULL,
      affected TEXT NOT NULL,
      status TEXT NOT NULL,
      requester_id TEXT NOT NULL,
      assigned_team TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_service_update_at TEXT,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets(requester_id);
    CREATE TABLE IF NOT EXISTS ticket_updates (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      at TEXT NOT NULL,
      author TEXT NOT NULL,
      author_name TEXT NOT NULL,
      text TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_updates_ticket ON ticket_updates(ticket_id, at);
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

export class TicketRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  listByRequester(requesterId: string): Ticket[] {
    const rows = this.db
      .prepare<[string], TicketRow>("SELECT * FROM tickets WHERE requester_id = ? ORDER BY updated_at DESC")
      .all(requesterId);
    return rows.map((r) => this.hydrate(r));
  }

  /** Retorna o chamado apenas se pertencer ao solicitante — privacidade aplicada na fonte. */
  getForRequester(id: string, requesterId: string): Ticket {
    const row = this.db
      .prepare<[string, string], TicketRow>("SELECT * FROM tickets WHERE id = ? AND requester_id = ?")
      .get(id, requesterId);
    // Mesmo erro para "não existe" e "não é seu": não vaza existência de chamado alheio.
    if (!row) throw new DomainError("not_found", `Chamado ${id} não encontrado`);
    return this.hydrate(row);
  }

  create(input: CreateTicketInput, idempotencyKey: string | null): { ticket: Ticket; replayed: boolean } {
    return this.db.transaction(() => {
      if (idempotencyKey) {
        const existing = this.db
          .prepare<[string], { ticket_id: string }>("SELECT ticket_id FROM idempotency_keys WHERE key = ?")
          .get(idempotencyKey);
        if (existing) return { ticket: this.getForRequester(existing.ticket_id, input.requesterId), replayed: true };
      }
      const id = this.nextId(input.type);
      const at = this.now().toISOString();
      this.db
        .prepare(
          `INSERT INTO tickets (id, type, title, description, category, subcategory, priority, affected, status,
             requester_id, assigned_team, created_at, updated_at, last_service_update_at, resolved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aberto', ?, ?, ?, ?, NULL, NULL)`,
        )
        .run(
          id,
          input.type,
          input.title,
          input.description,
          input.category,
          input.subcategory,
          input.priority,
          input.affected,
          input.requesterId,
          input.priority === "critica" ? "N2" : "N1",
          at,
          at,
        );
      this.insertUpdate(id, { author: "sistema", authorName: "Nexo Assist", text: "Chamado aberto pelo Nexo Assist." }, at);
      if (idempotencyKey) {
        this.db.prepare("INSERT INTO idempotency_keys (key, ticket_id, created_at) VALUES (?, ?, ?)").run(idempotencyKey, id, at);
      }
      return { ticket: this.getForRequester(id, input.requesterId), replayed: false };
    })();
  }

  addUpdate(id: string, requesterId: string, input: AddUpdateInput, idempotencyKey: string | null): Ticket {
    return this.db.transaction(() => {
      if (idempotencyKey) {
        const existing = this.db
          .prepare<[string], { ticket_id: string }>("SELECT ticket_id FROM idempotency_keys WHERE key = ?")
          .get(idempotencyKey);
        if (existing) return this.getForRequester(existing.ticket_id, requesterId);
      }
      const ticket = this.getForRequester(id, requesterId);
      const nowDate = this.now();
      const at = nowDate.toISOString();
      const isOpen = OPEN_STATUSES.includes(ticket.status);

      let status: TicketStatus = ticket.status;
      let resolvedAt = ticket.resolvedAt;
      if (input.reopen) {
        if (isOpen) throw new DomainError("conflict", `Chamado ${id} já está aberto`);
        const resolvedMs = ticket.resolvedAt ? Date.parse(ticket.resolvedAt) : Number.NaN;
        if (Number.isNaN(resolvedMs) || nowDate.getTime() - resolvedMs > REOPEN_WINDOW_MS) {
          throw new DomainError("reopen_window_expired", `Chamado ${id} foi resolvido há mais de 7 dias; abra um novo`);
        }
        status = "aberto";
        resolvedAt = null;
      } else if (!isOpen) {
        throw new DomainError("not_open", `Chamado ${id} está ${ticket.status}; só é possível reabrir`);
      } else if (ticket.status === "aguardando_usuario" && input.author === "funcionario") {
        status = "aguardando_analista";
      }

      this.insertUpdate(id, input, at);
      this.db
        .prepare(
          `UPDATE tickets SET status = ?, resolved_at = ?, priority = COALESCE(?, priority), updated_at = ?,
             last_service_update_at = CASE WHEN ? IN ('analista') THEN ? ELSE last_service_update_at END
           WHERE id = ?`,
        )
        .run(status, resolvedAt, input.priority ?? null, at, input.author, at, id);
      if (input.reopen) {
        this.insertUpdate(id, { author: "sistema", authorName: "Nexo Assist", text: "Chamado reaberto a pedido do funcionário." }, at);
      }
      if (idempotencyKey) {
        this.db.prepare("INSERT INTO idempotency_keys (key, ticket_id, created_at) VALUES (?, ?, ?)").run(idempotencyKey, id, at);
      }
      return this.getForRequester(id, requesterId);
    })();
  }

  transfer(id: string, requesterId: string, input: TransferInput): Ticket {
    return this.db.transaction(() => {
      const ticket = this.getForRequester(id, requesterId);
      if (!OPEN_STATUSES.includes(ticket.status)) throw new DomainError("not_open", `Chamado ${id} não está aberto`);
      const at = this.now().toISOString();
      this.insertUpdate(
        id,
        { author: "sistema", authorName: "Nexo Assist", text: `Transferido para Suporte ${input.team}. Resumo: ${input.summary}` },
        at,
      );
      this.db
        .prepare("UPDATE tickets SET assigned_team = ?, status = 'aguardando_analista', updated_at = ? WHERE id = ?")
        .run(input.team, at, id);
      return this.getForRequester(id, requesterId);
    })();
  }

  count(): number {
    return this.db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM tickets").get()?.n ?? 0;
  }

  /** Usado só pelo seed. */
  insertRaw(ticket: Ticket): void {
    this.db
      .prepare(
        `INSERT INTO tickets (id, type, title, description, category, subcategory, priority, affected, status,
           requester_id, assigned_team, created_at, updated_at, last_service_update_at, resolved_at)
         VALUES (@id, @type, @title, @description, @category, @subcategory, @priority, @affected, @status,
           @requesterId, @assignedTeam, @createdAt, @updatedAt, @lastServiceUpdateAt, @resolvedAt)`,
      )
      .run({ ...ticket });
    for (const u of ticket.updates) {
      this.db
        .prepare("INSERT INTO ticket_updates (id, ticket_id, at, author, author_name, text) VALUES (?, ?, ?, ?, ?, ?)")
        .run(u.id, ticket.id, u.at, u.author, u.authorName, u.text);
    }
  }

  reset(): void {
    this.db.exec("DELETE FROM ticket_updates; DELETE FROM idempotency_keys; DELETE FROM tickets;");
  }

  private insertUpdate(ticketId: string, u: Pick<TicketUpdate, "author" | "authorName" | "text">, at: string): void {
    this.db
      .prepare("INSERT INTO ticket_updates (id, ticket_id, at, author, author_name, text) VALUES (?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), ticketId, at, u.author, u.authorName, u.text);
  }

  private nextId(type: "INC" | "REQ"): string {
    const base = type === "INC" ? 20500 : 10500;
    const row = this.db
      .prepare<[string], { maxNum: number | null }>(
        "SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) AS maxNum FROM tickets WHERE id LIKE ? || '-%'",
      )
      .get(type);
    const next = Math.max(row?.maxNum ?? 0, base) + 1;
    return `${type}-${String(next).padStart(5, "0")}`;
  }

  private hydrate(row: TicketRow): Ticket {
    const updates = this.db
      .prepare<[string], UpdateRow>("SELECT * FROM ticket_updates WHERE ticket_id = ? ORDER BY at ASC")
      .all(row.id)
      .map((u) => ({ id: u.id, at: u.at, author: u.author, authorName: u.author_name, text: u.text }));
    // Valida a linha ao sair do banco: dado corrompido falha aqui, não na UI.
    return Ticket.parse({
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      category: row.category,
      subcategory: row.subcategory,
      priority: row.priority,
      affected: row.affected,
      status: row.status,
      requesterId: row.requester_id,
      assignedTeam: row.assigned_team,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastServiceUpdateAt: row.last_service_update_at,
      resolvedAt: row.resolved_at,
      updates,
    });
  }
}
