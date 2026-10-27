import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { Analyst, Employee } from "@nexo/contracts";
import { db } from "../db/client";
import { UserRepository, type SessionUser } from "../db/users";
import { env } from "../env";

export const SESSION_COOKIE = "nexo_session";
const SHORT_TTL_S = 12 * 60 * 60;
const LONG_TTL_S = 30 * 24 * 60 * 60;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Sessão com token opaco aleatório em cookie HttpOnly; no banco fica só o hash
 * (vazar o banco não permite sequestrar sessões).
 */
export async function createSession(userId: string, remember: boolean): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const ttl = remember ? LONG_TTL_S : SHORT_TTL_S;
  const now = new Date();
  db()
    .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(hash(token), userId, now.toISOString(), new Date(now.getTime() + ttl * 1000).toISOString());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    ...(remember ? { maxAge: ttl } : {}),
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(token));
  store.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare<[string, string], { user_id: string }>("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?")
    .get(hash(token), new Date().toISOString());
  return row ? new UserRepository(db()).findById(row.user_id) : null;
}

export class AuthError extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? "Não autenticado" : "Sem permissão");
  }
}

export async function requireEmployee(): Promise<Employee> {
  const u = await currentUser();
  if (!u) throw new AuthError(401);
  if (u.role !== "employee") throw new AuthError(403);
  return u.employee;
}

export async function requireAnalyst(): Promise<Analyst> {
  const u = await currentUser();
  if (!u) throw new AuthError(401);
  if (u.role !== "analyst") throw new AuthError(403);
  return u.analyst;
}
