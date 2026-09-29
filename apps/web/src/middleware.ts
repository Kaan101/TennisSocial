import { NextResponse, type NextRequest } from "next/server";

const open = new Set(["/login", "/register"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/offline.html"
  ) {
    return NextResponse.next();
  }
  const hasSession = req.cookies.has("tc_access") || req.cookies.has("tc_refresh");
  if (!hasSession && !open.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (hasSession && open.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|sw.js|offline.html|manifest.webmanifest).*)"],
};
