import "server-only";
import type Database from "better-sqlite3";
import type { Analyst, Employee } from "@nexo/contracts";

export type SessionUser = { role: "employee"; employee: Employee } | { role: "analyst"; analyst: Analyst };

interface UserRow {
  id: string;
  role: "employee" | "analyst";
  name: string;
  email: string;
  department: string | null;
  team: "N1" | "N2" | null;
  password_changed_at: string;
}

function toUser(row: UserRow): SessionUser {
  if (row.role === "analyst") {
    return { role: "analyst", analyst: { id: row.id, name: row.name, email: row.email, team: row.team ?? "N1" } };
  }
  return {
    role: "employee",
    employee: { id: row.id, name: row.name, email: row.email, department: row.department ?? "", passwordChangedAt: row.password_changed_at },
  };
}

export class UserRepository {
  constructor(private readonly db: Database.Database) {}

  findByEmail(email: string): SessionUser | null {
    const row = this.db.prepare<[string], UserRow>("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
    return row ? toUser(row) : null;
  }

  findById(id: string): SessionUser | null {
    const row = this.db.prepare<[string], UserRow>("SELECT * FROM users WHERE id = ?").get(id);
    return row ? toUser(row) : null;
  }

  getEmployee(id: string): Employee | null {
    const u = this.findById(id);
    return u?.role === "employee" ? u.employee : null;
  }

  getAnalyst(id: string): Analyst | null {
    const u = this.findById(id);
    return u?.role === "analyst" ? u.analyst : null;
  }
}
