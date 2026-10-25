import { NextResponse } from "next/server";
import { getUser } from "@/lib/guard";

export async function middleware(req: Request) {
  const { pathname } = new URL(req.url);
  const user = await getUser();
  const isLoggedIn = !!user;
  const userRole = user?.role as "ADMIN" | "OFFICER" | "CADET" | undefined;

  // Admin routes - allow ADMIN and OFFICER
  if (pathname.startsWith("/admin")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (userRole !== "ADMIN" && userRole !== "OFFICER") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // Cadet dashboard routes
  if (pathname.startsWith("/dashboard")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Officer dashboard routes
  if (pathname.startsWith("/officer")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (userRole !== "ADMIN" && userRole !== "OFFICER") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // Study materials download requires login
  if (pathname.startsWith("/api/study-materials/download")) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/officer/:path*", "/dashboard/:path*", "/api/study-materials/download/:path*"],
};
