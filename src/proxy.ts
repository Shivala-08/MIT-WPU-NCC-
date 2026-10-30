import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PROTECTED_PAGE_PREFIXES = ["/admin", "/officer", "/dashboard", "/profile"];

const PROTECTED_API_PREFIXES = [
  "/api/admin",
  "/api/study-materials/download",
  "/api/profile",
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

function isProtected(pathname: string) {
  return (
    PROTECTED_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    PROTECTED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

/**
 * The proxy only decides whether a caller is signed in.
 *
 * Roles and approval states are never read from the token: they are read from
 * the database by the server layouts and the route guards, so an approval or a
 * rejection takes effect immediately and a stale token cannot grant access.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  const isApiRequest = pathname.startsWith("/api");
  const token = await readSessionToken(req);

  if (!token?.id) {
    if (isApiRequest) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/officer/:path*",
    "/dashboard/:path*",
    "/profile/:path*",
    "/api/admin/:path*",
    "/api/profile/:path*",
    "/api/study-materials/download/:path*",
  ],
};
