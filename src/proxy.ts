import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isRole, type Role } from "@/lib/roles";

const PAGE_RULES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/officer", roles: ["ADMIN", "OFFICER"] },
  { prefix: "/dashboard", roles: ["ADMIN", "OFFICER", "CADET"] },
];

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

async function readSessionToken(req: NextRequest) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

  if (!secret) {
    return null;
  }

  for (const cookieName of SESSION_COOKIE_NAMES) {
    try {
      const token = await getToken({ req, secret, cookieName });
      if (token) {
        return token;
      }
    } catch (error) {
      console.error(`Failed to decode session cookie ${cookieName}:`, error);
      return null;
    }
  }

  return null;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApiRequest = pathname.startsWith("/api");

  const rule = PAGE_RULES.find((entry) => pathname.startsWith(entry.prefix));

  if (!rule && !pathname.startsWith("/api/study-materials/download")) {
    return NextResponse.next();
  }

  const token = await readSessionToken(req);

  if (!token?.id) {
    if (isApiRequest) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (rule && (!isRole(token.role) || !rule.roles.includes(token.role))) {
    if (isApiRequest) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/officer/:path*",
    "/dashboard/:path*",
    "/api/study-materials/download/:path*",
  ],
};
