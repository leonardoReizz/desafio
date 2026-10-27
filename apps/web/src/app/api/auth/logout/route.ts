import { NextResponse } from "next/server";
import { destroySession } from "@/server/auth/session";
import { route } from "@/server/http";

export async function POST() {
  return route(async () => {
    await destroySession();
    return NextResponse.json({ ok: true });
  });
}
