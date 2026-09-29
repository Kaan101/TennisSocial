import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { accessCookie, apiBase, refreshCookie } from "@/lib/cookies";

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  const formPost = contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");
  const body = formPost
    ? Object.fromEntries(await req.formData())
    : await req.json();
  const res = await fetch(`${apiBase()}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: body.email, password: body.password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (formPost) {
      return new NextResponse(
        `<!doctype html><html lang="tr"><meta charset="utf-8"><title>Giriş</title><p>Giriş yapılamadı.</p><p><a href="/login">Geri dön</a></p></html>`,
        { status: 401, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    return NextResponse.json(json, { status: res.status });
  }
  const jar = await cookies();
  jar.set("tc_access", json.tokens.accessToken, accessCookie);
  jar.set("tc_refresh", json.tokens.refreshToken, refreshCookie);
  if (formPost) return NextResponse.redirect(new URL("/", req.url), 303);
  return NextResponse.json({ user: json.user });
}
