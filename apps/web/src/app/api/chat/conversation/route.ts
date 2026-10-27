import { NextResponse } from "next/server";
import { requireEmployee } from "@/server/auth/session";
import { conversations } from "@/server/container";
import { NotFound, route } from "@/server/http";

/**
 * GET: retoma a última conversa aberta ("voltar outro dia e continuar de onde parei")
 * ou uma conversa específica (?id=) — sempre do próprio funcionário.
 */
export async function GET(req: Request) {
  return route(async () => {
    const employee = await requireEmployee();
    const repo = conversations();
    const id = new URL(req.url).searchParams.get("id");
    const conversation = id ? repo.getOwned(id, employee.id) : repo.latestOpenFor(employee.id);
    if (id && !conversation) throw new NotFound("Conversa não encontrada");
    return NextResponse.json({ employee, conversation, messages: conversation ? repo.messages(conversation.id) : [] });
  });
}

/** POST: começa uma conversa nova. */
export async function POST() {
  return route(async () => {
    const employee = await requireEmployee();
    const conversation = conversations().create(employee.id);
    return NextResponse.json({ employee, conversation, messages: [] }, { status: 201 });
  });
}
