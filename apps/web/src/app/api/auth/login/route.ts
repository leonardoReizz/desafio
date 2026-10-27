import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/server/auth/session";
import { users } from "@/server/container";
import { jsonError, parseJson, route } from "@/server/http";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { allowRequest, clientIp } from "@/server/rate-limit";

const Body = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  // Protótipo: aceita qualquer senha (PRD), a menos que DEMO_PASSWORD esteja definida.
  password: z.string().min(1).max(200),
  remember: z.boolean().default(false),
});

export async function POST(req: Request) {
  return route(async () => {
    if (!allowRequest(`login:${clientIp(req.headers)}`, 10)) return jsonError(429, "rate_limited", "Muitas tentativas. Aguarde um minuto.");
    const { email, password, remember } = await parseJson(req, Body);
    if (!email.endsWith("@nexo.com.br")) return jsonError(400, "invalid_domain", "Use seu e-mail corporativo @nexo.com.br.");
    const user = users().findByEmail(email);
    // Mesma resposta para e-mail inexistente e senha errada (não revela quem tem conta).
    const invalid = () => jsonError(401, "invalid_credentials", "E-mail ou senha inválidos.");
    if (!user) return invalid();
    // Deploy público: DEMO_PASSWORD fecha o acesso; sem ela vale a regra do protótipo (qualquer senha).
    const demoPassword = env().DEMO_PASSWORD;
    if (demoPassword && !sameSecret(password, demoPassword)) return invalid();
    const id = user.role === "employee" ? user.employee.id : user.analyst.id;
    await createSession(id, remember);
    return NextResponse.json({ role: user.role, redirectTo: user.role === "employee" ? "/chat" : "/console" });
  });
}

function sameSecret(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
