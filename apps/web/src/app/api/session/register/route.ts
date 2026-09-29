import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { accessCookie, apiBase, refreshCookie } from "@/lib/cookies";

export async function POST(req: Request) {
  const body = await req.json();
  const res = await fetch(`${apiBase()}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json(json, { status: res.status });
  const jar = await cookies();
  jar.set("tc_access", json.tokens.accessToken, accessCookie);
  jar.set("tc_refresh", json.tokens.refreshToken, refreshCookie);
  return NextResponse.json({ user: json.user });
}
