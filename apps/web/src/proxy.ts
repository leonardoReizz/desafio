import { NextResponse, type NextRequest } from "next/server";

/**
 * Redireciona para /login quem não tem cookie de sessão. É só uma conveniência de navegação:
 * a autorização de verdade (sessão válida, papel, dono do recurso) é feita em cada rota da API.
 */
export function proxy(req: NextRequest) {
  if (!req.cookies.has("nexo_session")) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/chat/:path*", "/perfil/:path*", "/console/:path*"] };
