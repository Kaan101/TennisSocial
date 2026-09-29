import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { accessCookie, apiBase, refreshCookie } from "@/lib/cookies";

export async function POST() {
  const jar = await cookies();
  const refreshToken = jar.get("tc_refresh")?.value;
  if (refreshToken) {
    await fetch(`${apiBase()}/api/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  jar.set("tc_access", "", { ...accessCookie, maxAge: 0 });
  jar.set("tc_refresh", "", { ...refreshCookie, maxAge: 0 });
  return NextResponse.json({ ok: true });
}
