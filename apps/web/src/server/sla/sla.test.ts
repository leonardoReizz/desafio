import { describe, expect, it } from "vitest";
import { addBusinessDays, addBusinessHours } from "./business-time";
import { classifyPriority, type PrioritySignals } from "./priority";
import { computeSla, deadlineFrom } from "./sla";

// Horários em -03:00 (Brasília). 2026-10-21 é quarta-feira.
const at = (iso: string) => new Date(iso);

describe("horário útil", () => {
  it("soma horas dentro do expediente", () => {
    expect(addBusinessHours(at("2026-10-21T09:43:00-03:00"), 4).toISOString()).toBe(at("2026-10-21T13:43:00-03:00").toISOString());
  });

  it("transborda para o dia útil seguinte", () => {
    expect(addBusinessHours(at("2026-10-21T16:00:00-03:00"), 4).toISOString()).toBe(at("2026-10-22T10:00:00-03:00").toISOString());
  });

  it("pula o fim de semana", () => {
    // sexta 17h + 4h úteis = segunda 11h
    expect(addBusinessHours(at("2026-10-23T17:00:00-03:00"), 4).toISOString()).toBe(at("2026-10-26T11:00:00-03:00").toISOString());
  });

  it("aberto fora do expediente começa a contar na abertura", () => {
    expect(addBusinessHours(at("2026-10-21T22:00:00-03:00"), 1).toISOString()).toBe(at("2026-10-22T09:00:00-03:00").toISOString());
  });

  it("3 dias úteis a partir de quinta caem na terça", () => {
    expect(addBusinessDays(at("2026-10-22T14:20:00-03:00"), 3).toISOString()).toBe(at("2026-10-27T14:20:00-03:00").toISOString());
  });
});

describe("prioridade (Anexo A)", () => {
  const base: PrioritySignals = { affected: "so_eu", blocksWork: false, sameDayCommitment: false, hasWorkaround: true, isRequest: false };

  it("algo parado para a equipe é Crítica", () => {
    expect(classifyPriority({ ...base, affected: "equipe", blocksWork: true, hasWorkaround: false }).priority).toBe("critica");
  });
  it("compromisso no mesmo dia é Alta (caso da VPN antes da reunião das 14h)", () => {
    expect(classifyPriority({ ...base, blocksWork: true, sameDayCommitment: true, hasWorkaround: false }).priority).toBe("alta");
  });
  it("impede uma pessoa de trabalhar é Alta", () => {
    expect(classifyPriority({ ...base, blocksWork: true, hasWorkaround: false }).priority).toBe("alta");
  });
  it("atrapalha mas tem alternativa é Média", () => {
    expect(classifyPriority(base).priority).toBe("media");
  });
  it("pedido sem urgência é Baixa", () => {
    expect(classifyPriority({ ...base, isRequest: true }).priority).toBe("baixa");
  });
  it("equipe afetada mas com alternativa não é crítica", () => {
    expect(classifyPriority({ ...base, affected: "equipe", blocksWork: true, hasWorkaround: true }).priority).toBe("media");
  });
});

describe("SLA do chamado", () => {
  const now = at("2026-10-21T10:05:00-03:00");

  it("chamado média sem atualização há 6 dias está vencido", () => {
    const sla = computeSla(
      {
        status: "aguardando_analista",
        priority: "media",
        createdAt: "2026-10-10T14:20:00-03:00",
        lastServiceUpdateAt: "2026-10-15T09:10:00-03:00",
      },
      now,
    );
    expect(sla.overdue).toBe(true);
    expect(sla.label).toBe("prazo vencido");
  });

  it("chamado resolvido não tem prazo", () => {
    expect(computeSla({ status: "resolvido", priority: "alta", createdAt: now.toISOString(), lastServiceUpdateAt: null }, now)).toEqual({
      dueAt: null,
      overdue: false,
      label: "encerrado",
    });
  });

  it("rótulo mostra horário quando vence no mesmo dia", () => {
    const sla = computeSla({ status: "aberto", priority: "alta", createdAt: "2026-10-21T09:43:00-03:00", lastServiceUpdateAt: null }, now);
    expect(sla.label).toBe("resposta até 13:43");
  });

  it("crítica conta 1 hora corrida, mesmo fora do expediente", () => {
    expect(deadlineFrom(at("2026-10-24T23:30:00-03:00"), "critica").toISOString()).toBe(at("2026-10-25T00:30:00-03:00").toISOString());
  });
});
