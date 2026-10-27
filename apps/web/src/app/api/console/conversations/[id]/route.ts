import { NextResponse } from "next/server";
import { requireAnalyst } from "@/server/auth/session";
import { conversations, ticketsClient, users } from "@/server/container";
import { conversationDetail } from "@/server/console/service";
import { route } from "@/server/http";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    await requireAnalyst();
    const { id } = await ctx.params;
    const deps = { conversations: conversations(), users: users(), tickets: ticketsClient(), now: () => new Date() };
    return NextResponse.json(await conversationDetail(deps, id));
  });
}
