import { NextResponse } from "next/server";
import { z } from "zod";
import { requireEmployee } from "@/server/auth/session";
import { conversations } from "@/server/container";
import { NotFound, parseJson, route } from "@/server/http";

const Body = z.object({
  conversationId: z.string(),
  title: z.string().trim().min(5).max(90),
  description: z.string().trim().min(10).max(800),
});

/** Edição manual do rascunho pelo funcionário ("Editar" no card) — sem LLM, só rascunho pendente. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const employee = await requireEmployee();
    const { id } = await ctx.params;
    const body = await parseJson(req, Body);
    const repo = conversations();
    const draft = repo.getOwned(body.conversationId, employee.id) ? repo.getDraft(id, body.conversationId, employee.id) : null;
    if (!draft || draft.status !== "pending") throw new NotFound("Rascunho não encontrado ou já confirmado");
    const updated = { ...draft, title: body.title, description: body.description };
    repo.saveDraft(body.conversationId, employee.id, updated);
    const msg = repo.findMessageWithDraft(body.conversationId, id);
    if (msg)
      repo.updateMessageBlocks(
        msg.id,
        msg.blocks.map((b) => (b.kind === "draft" && b.draft.id === id ? { kind: "draft", draft: updated } : b)),
      );
    return NextResponse.json({ draft: updated, message: msg ? repo.getMessage(msg.id) : null });
  });
}
