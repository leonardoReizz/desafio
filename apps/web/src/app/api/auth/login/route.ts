import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/server/auth/session";
import { users } from "@/server/container";
import { jsonError, parseJson, route } from "@/server/http";
import { allowRequest } from "@/server/rate-limit";

const Body = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  // Protótipo: aceita qualquer senha para os usuários de exemplo (PRD). Ainda exige preenchimento.
  password: z.string().min(1).max(200),
  remember: z.boolean().default(false),
});

export async function POST(req: Request) {
  return route(async () => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!allowRequest(`login:${ip}`, 10)) return jsonError(429, "rate_limited", "Muitas tentativas. Aguarde um minuto.");
    const { email, remember } = await parseJson(req, Body);
    if (!email.endsWith("@nexo.com.br")) return jsonError(400, "invalid_domain", "Use seu e-mail corporativo @nexo.com.br.");
    const user = users().findByEmail(email);
    if (!user) return jsonError(401, "unknown_email", "E-mail não encontrado.");
    const id = user.role === "employee" ? user.employee.id : user.analyst.id;
    await createSession(id, remember);
    return NextResponse.json({ role: user.role, redirectTo: user.role === "employee" ? "/chat" : "/console" });
  });
}
