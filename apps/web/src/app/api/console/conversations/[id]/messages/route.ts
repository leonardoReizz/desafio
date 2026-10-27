import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAnalyst } from "@/server/auth/session";
import { conversations, ticketsClient, users } from "@/server/container";
import { sendAnalystMessage } from "@/server/console/service";
import { parseJson, route } from "@/server/http";

const Body = z.object({ text: z.string().trim().min(1).max(2000) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const analyst = await requireAnalyst();
    const { id } = await ctx.params;
    const { text } = await parseJson(req, Body);
    const deps = { conversations: conversations(), users: users(), tickets: ticketsClient(), now: () => new Date() };
    return NextResponse.json({ message: sendAnalystMessage(deps, analyst, id, text) }, { status: 201 });
  });
}
