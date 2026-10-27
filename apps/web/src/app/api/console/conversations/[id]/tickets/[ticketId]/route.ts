import { NextResponse } from "next/server";
import { z } from "zod";
import { AnalystTicketStatus } from "@nexo/contracts";
import { requireAnalyst } from "@/server/auth/session";
import { conversations, ticketsClient, users } from "@/server/container";
import { updateTicket } from "@/server/console/service";
import { BadRequest, parseJson, route } from "@/server/http";

const Body = z.object({
  status: AnalystTicketStatus.nullable().default(null),
  note: z.string().trim().max(2000).nullable().default(null),
});

/** Analista muda o status e/ou registra uma nota num chamado do funcionário da conversa. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string; ticketId: string }> }) {
  return route(async () => {
    const analyst = await requireAnalyst();
    const { id, ticketId } = await ctx.params;
    if (!/^(INC|REQ)-\d{5}$/.test(ticketId)) throw new BadRequest("Chamado inválido");
    const body = await parseJson(req, Body);
    if (!body.status && !body.note) throw new BadRequest("Informe um status ou uma nota");
    const deps = { conversations: conversations(), users: users(), tickets: ticketsClient(), now: () => new Date() };
    return NextResponse.json({ ticket: await updateTicket(deps, analyst, id, ticketId, body) });
  });
}
