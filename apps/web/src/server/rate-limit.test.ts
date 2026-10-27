import { describe, expect, it } from "vitest";
import { allowRequest, clientIp } from "./rate-limit";

describe("rate limit", () => {
  it("bloqueia acima do limite na janela de um minuto e libera depois", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(allowRequest("k:a", 3, t0 + i)).toBe(true);
    expect(allowRequest("k:a", 3, t0 + 10)).toBe(false);
    expect(allowRequest("k:a", 3, t0 + 61_000)).toBe(true);
  });

  it("chaves diferentes não dividem o limite", () => {
    expect(allowRequest("k:b", 1, 5_000_000)).toBe(true);
    expect(allowRequest("k:c", 1, 5_000_000)).toBe(true);
  });
});

describe("clientIp", () => {
  it("usa o IP escrito pelo proxy, não o que o cliente forjou", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers())).toBe("local");
  });
});
