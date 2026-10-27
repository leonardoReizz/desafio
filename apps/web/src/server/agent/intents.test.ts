import { describe, expect, it } from "vitest";
import { asksForHuman, isExplicitCancel, isExplicitConfirmation } from "./intents";

describe("confirmação explícita (guardrail de criação)", () => {
  it.each(["sim", "Sim!", "pode criar", "Sim, pode abrir", "confirmo", "ok", "tá certo", "Perfeito"])("aceita %s", (t) => {
    expect(isExplicitConfirmation(t)).toBe(true);
  });

  it.each([
    "sim, mas muda a prioridade para crítica",
    "não",
    "quero falar com um analista",
    "Meu notebook não conecta na VPN desde ontem. Aparece o erro 809.",
    "",
  ])("rejeita %s", (t) => {
    expect(isExplicitConfirmation(t)).toBe(false);
  });
});

describe("cancelamento", () => {
  it.each(["não", "cancela", "deixa pra lá", "não precisa"])("aceita %s", (t) => expect(isExplicitCancel(t)).toBe(true));
  it("não confunde com frase longa", () => expect(isExplicitCancel("não consigo acessar o SAP desde ontem de manhã")).toBe(false));
});

describe("pedido de humano", () => {
  it.each(["Quero falar com um analista.", "preciso falar com alguém", "pode chamar um atendente?"])("detecta %s", (t) => {
    expect(asksForHuman(t)).toBe(true);
  });
  it("não detecta em pergunta comum", () => expect(asksForHuman("como reseto minha senha?")).toBe(false));
});
