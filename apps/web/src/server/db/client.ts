import "server-only";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DEMO_ANALYSTS, DEMO_EMPLOYEES } from "@nexo/contracts";
import { env } from "../env";

const MIGRATION = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('employee', 'analyst')),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    department TEXT,
    team TEXT,
    password_changed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL,
    handoff_reason TEXT,
    handoff_summary TEXT,
    handoff_at TEXT,
    assigned_analyst_id TEXT REFERENCES users(id),
    related_ticket_id TEXT,
    last_confidence REAL,
    user_message_count INTEGER NOT NULL DEFAULT 0,
    analyst_read_at TEXT,
    employee_read_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_conv_employee ON conversations(employee_id, updated_at);
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    author_name TEXT,
    author_badge TEXT,
    blocks_json TEXT NOT NULL DEFAULT '[]',
    trace_json TEXT,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_seq ON messages(conversation_id, seq);
  CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL,
    data_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS llm_usage (
    day TEXT PRIMARY KEY,
    calls INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0
  );
`;

function seedUsers(db: Database.Database): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO users (id, role, name, email, department, team, password_changed_at)
     VALUES (@id, @role, @name, @email, @department, @team, @passwordChangedAt)`,
  );
  const passwordChangedAt = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString();
  for (const e of DEMO_EMPLOYEES) insert.run({ ...e, role: "employee", team: null, passwordChangedAt });
  for (const a of DEMO_ANALYSTS) insert.run({ ...a, role: "analyst", department: "Service desk", passwordChangedAt });
}

export function openAppDatabase(path: string): Database.Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(MIGRATION);
  // Bancos criados antes da confirmação de leitura do funcionário.
  const cols = db.prepare<[], { name: string }>("PRAGMA table_info(conversations)").all();
  if (!cols.some((c) => c.name === "employee_read_at")) db.exec("ALTER TABLE conversations ADD COLUMN employee_read_at TEXT");
  seedUsers(db);
  return db;
}

// Uma conexão por processo; sobrevive ao HMR do Next em dev.
const globalForDb = globalThis as unknown as { __nexoDb?: Database.Database };

export function db(): Database.Database {
  globalForDb.__nexoDb ??= openAppDatabase(env().APP_DB_PATH);
  return globalForDb.__nexoDb;
}
