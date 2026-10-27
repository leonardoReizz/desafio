import { NextResponse } from "next/server";
import { ConversationListFilter } from "@nexo/contracts";
import { requireAnalyst } from "@/server/auth/session";
import { conversations, ticketsClient, users } from "@/server/container";
import { listConversations } from "@/server/console/service";
import { BadRequest, route } from "@/server/http";

export async function GET(req: Request) {
  return route(async () => {
    const analyst = await requireAnalyst();
    const params = new URL(req.url).searchParams;
    const filter = ConversationListFilter.safeParse(params.get("filter") ?? "todas");
    if (!filter.success) throw new BadRequest("Filtro inválido");
    const q = (params.get("q") ?? "").slice(0, 100);
    const deps = { conversations: conversations(), users: users(), tickets: ticketsClient(), now: () => new Date() };
    return NextResponse.json(listConversations(deps, analyst, filter.data, q));
  });
}
