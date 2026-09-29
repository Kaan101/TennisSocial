import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { accessCookie, apiBase, refreshCookie } from "@/lib/cookies";

async function refreshAccess(): Promise<string | null> {
  const jar = await cookies();
  const refreshToken = jar.get("tc_refresh")?.value;
  if (!refreshToken) return null;
  const res = await fetch(`${apiBase()}/api/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    jar.set("tc_access", "", { ...accessCookie, maxAge: 0 });
    jar.set("tc_refresh", "", { ...refreshCookie, maxAge: 0 });
    return null;
  }
  const json = await res.json();
  jar.set("tc_access", json.tokens.accessToken, accessCookie);
  jar.set("tc_refresh", json.tokens.refreshToken, refreshCookie);
  return json.tokens.accessToken as string;
}

async function proxy(req: Request, path: string[], token: string | undefined, retry: boolean): Promise<NextResponse> {
  if (path.some((part) => part === ".." || part.includes("\\"))) {
    return NextResponse.json({ error: { code: "BAD_PATH", message: "Geçersiz yol" } }, { status: 400 });
  }
  const incoming = new URL(req.url);
  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  if (token) headers.set("authorization", `Bearer ${token}`);
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  const res = await fetch(`${apiBase()}/api/${path.join("/")}${incoming.search}`, {
    method: req.method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
  });
  if (res.status === 401 && retry) {
    const next = await refreshAccess();
    if (next) {
      const again = await fetch(`${apiBase()}/api/${path.join("/")}${incoming.search}`, {
        method: req.method,
        headers: (() => {
          const h = new Headers(headers);
          h.set("authorization", `Bearer ${next}`);
          return h;
        })(),
        body: body && body.byteLength > 0 ? body : undefined,
      });
      return passthrough(again);
    }
  }
  return passthrough(res);
}

async function passthrough(res: Response): Promise<NextResponse> {
  const headers = new Headers();
  const type = res.headers.get("content-type");
  if (type) headers.set("content-type", type);
  const disposition = res.headers.get("content-disposition");
  if (disposition) headers.set("content-disposition", disposition);
  return new NextResponse(await res.arrayBuffer(), { status: res.status, headers });
}

async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const jar = await cookies();
  return proxy(req, path, jar.get("tc_access")?.value, true);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
