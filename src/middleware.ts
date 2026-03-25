import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/auth";

const publicRoutes = ["/login", "/register"];
const onboardingRoute = "/onboarding";

export default async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const isPublicRoute = publicRoutes.some((r) => path === r || path.startsWith(r + "/"));
  const isOnboardingRoute = path === onboardingRoute;

  const cookie = req.cookies.get("session")?.value;
  let session: Record<string, unknown> | null = null;

  if (cookie) {
    try {
      session = await decrypt(cookie);
    } catch {
      // Token inválido ou expirado
    }
  }

  // Usuário autenticado tentando acessar rota pública → redireciona para o dashboard
  if (isPublicRoute && session) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  // Usuário não autenticado tentando acessar rota protegida → redireciona para login
  if (!isPublicRoute && !session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  // Usuário autenticado sem onboarding concluído → redireciona para onboarding
  // (exceto se já estiver na rota de onboarding)
  if (session && !isOnboardingRoute && !isPublicRoute) {
    if (session.onboardingCompleted === false) {
      return NextResponse.redirect(new URL(onboardingRoute, req.nextUrl));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$|.*\\.ico$|.*\\.svg$|manifest|uploads).*)"],
};
