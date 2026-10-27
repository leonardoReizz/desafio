import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAnalyst } from "@/server/auth/session";
import { limitAnalystAction } from "@/server/rate-limit";
import { conversations, ticketsClient, users } from "@/server/container";
import { assume, close, returnToAgent } from "@/server/console/service";
import { NotFound, route } from "@/server/http";

const Action = z.enum(["assume", "return", "close"]);

/** Assumir (pausa o agent), devolver ao agent ou encerrar. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string; action: string }> }) {
  return route(async () => {
    const analyst = await requireAnalyst();
    limitAnalystAction(analyst.id);
    const { id, action } = await ctx.params;
    const parsed = Action.safeParse(action);
    if (!parsed.success) throw new NotFound("Ação desconhecida");
    const deps = { conversations: conversations(), users: users(), tickets: ticketsClient(), now: () => new Date() };
    ({ assume, return: returnToAgent, close })[parsed.data](deps, analyst, id);
    return NextResponse.json({ conversation: deps.conversations.get(id) });
  });
}
