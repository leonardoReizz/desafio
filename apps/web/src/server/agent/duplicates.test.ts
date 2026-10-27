import { describe, expect, it } from "vitest";
import type { Ticket } from "@nexo/contracts";
import { findDuplicate } from "./duplicates";

const now = new Date("2026-10-21T13:00:00.000Z");
const base: Ticket = {
  id: "INC-1",
  type: "INC",
  title: "",
  description: "",
  category: "acesso",
  subcategory: null,
  priority: "media",
  affected: "so_eu",
  status: "aberto",
  requesterId: "emp_ana",
  assignedTeam: "N1",
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  lastServiceUpdateAt: null,
  resolvedAt: null,
  updates: [],
};

describe("findDuplicate", () => {
  it("encontra chamado aberto sobre o mesmo problema", () => {
    const t = { ...base, id: "INC-20311", category: "hardware" as const, title: "Notebook lento após atualização do Windows" };
    const m = findDuplicate([t], { category: "hardware", title: "Notebook muito lento", description: "desde a atualização" }, now);
    expect(m.kind).toBe("open");
  });

  it("sugere reabrir resolvido há até 7 dias", () => {
    const t = { ...base, id: "INC-20150", title: "Senha do SAP bloqueada", status: "resolvido" as const, resolvedAt: "2026-10-17T13:00:00.000Z" };
    const m = findDuplicate([t], { category: "acesso", title: "SAP bloqueado de novo", description: "senha bloqueou" }, now);
    expect(m.kind).toBe("reopenable");
  });

  it("não reabre resolvido há mais de 7 dias", () => {
    const t = { ...base, title: "Senha do SAP bloqueada", status: "resolvido" as const, resolvedAt: "2026-10-01T13:00:00.000Z" };
    expect(findDuplicate([t], { category: "acesso", title: "SAP bloqueado", description: "senha" }, now).kind).toBe("none");
  });

  it("ignora categoria diferente", () => {
    const t = { ...base, category: "hardware" as const, title: "VPN não conecta" };
    expect(findDuplicate([t], { category: "rede_vpn", title: "VPN não conecta", description: "erro 809" }, now).kind).toBe("none");
  });

  it("prefere o aberto ao reabrível", () => {
    const open = { ...base, id: "INC-A", title: "SAP sem acesso" };
    const resolved = { ...base, id: "INC-B", title: "SAP sem acesso bloqueado", status: "resolvido" as const, resolvedAt: "2026-10-20T13:00:00.000Z" };
    const m = findDuplicate([resolved, open], { category: "acesso", title: "SAP sem acesso bloqueado", description: "" }, now);
    expect(m.kind === "open" && m.ticket.id).toBe("INC-A");
  });
});
