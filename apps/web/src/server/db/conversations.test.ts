import { describe, expect, it } from "vitest";
import { openAppDatabase } from "./client";
import { ConversationRepository } from "./conversations";

describe("confirmação de leitura", () => {
  it("marca leitura por lado, sem reordenar a fila nem voltar no tempo", () => {
    let now = new Date("2026-10-21T13:00:00.000Z");
    const repo = new ConversationRepository(openAppDatabase(":memory:"), () => now);
    const c = repo.create("emp_ana");
    now = new Date("2026-10-21T13:05:00.000Z");

    repo.markRead(c.id, "analyst", "2026-10-21T13:04:00.000Z");
    repo.markRead(c.id, "analyst", "2026-10-21T13:02:00.000Z"); // leitura antiga não sobrescreve
    const after = repo.get(c.id)!;
    expect(after.analystReadAt).toBe("2026-10-21T13:04:00.000Z");
    expect(after.employeeReadAt).toBeNull();
    expect(after.updatedAt).toBe(c.updatedAt);

    repo.markRead(c.id, "employee", "2026-10-21T13:05:00.000Z");
    expect(repo.get(c.id)!.employeeReadAt).toBe("2026-10-21T13:05:00.000Z");
  });
});
