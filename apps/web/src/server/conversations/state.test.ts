import { describe, expect, it } from "vitest";
import { agentMayRespond, InvalidTransitionError, transition } from "./state";

describe("máquina de estados da conversa", () => {
  it("segue o fluxo transferir → assumir → devolver", () => {
    let s = transition("agent", "transfer");
    expect(s).toBe("waiting_human");
    s = transition(s, "assume");
    expect(s).toBe("human");
    s = transition(s, "return_to_agent");
    expect(s).toBe("agent");
  });

  it("analista pode devolver sem assumir", () => {
    expect(transition("waiting_human", "return_to_agent")).toBe("agent");
  });

  it("analista pode assumir uma conversa que está com o agent", () => {
    expect(transition("agent", "assume")).toBe("human");
  });

  it("não permite assumir de novo uma conversa já com analista", () => {
    expect(() => transition("human", "assume")).toThrow(InvalidTransitionError);
  });

  it("conversa encerrada é terminal", () => {
    expect(() => transition("closed", "return_to_agent")).toThrow(InvalidTransitionError);
  });

  it("agent só responde quando a conversa está com ele", () => {
    expect(agentMayRespond("agent")).toBe(true);
    expect(agentMayRespond("waiting_human")).toBe(false);
    expect(agentMayRespond("human")).toBe(false);
    expect(agentMayRespond("closed")).toBe(false);
  });
});
