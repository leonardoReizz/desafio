import { NextResponse } from "next/server";
import { AuthError, currentUser } from "@/server/auth/session";
import { route } from "@/server/http";

export async function GET() {
  return route(async () => {
    const user = await currentUser();
    if (!user) throw new AuthError(401);
    return NextResponse.json(user);
  });
}
