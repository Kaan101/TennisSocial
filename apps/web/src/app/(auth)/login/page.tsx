"use client";

import { brand } from "@club/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/session/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    const json = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(json?.error?.message ?? "Giriş yapılamadı");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="court-hero grid min-h-dvh place-items-center px-4 py-10">
      <form method="post" action="/api/session/login" onSubmit={onSubmit} className="w-full max-w-sm rounded-[2rem] bg-paper p-6 shadow-xl">
        <p className="text-xs font-semibold tracking-[0.22em] text-court uppercase">{brand.name}</p>
        <h1 className="mt-2 text-3xl font-semibold">Korta dön</h1>
        <p className="mt-1 text-sm text-muted">{brand.tagline}</p>
        <div className="mt-6 space-y-3">
          <div>
            <Label htmlFor="email">E-posta</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <Label htmlFor="password">Parola</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-clay" role="alert">{error}</p> : null}
        <Button className="mt-5 w-full" disabled={pending}>
          {pending ? "Giriliyor…" : "Giriş yap"}
        </Button>
        <p className="mt-4 text-center text-sm text-muted">
          Üye değil misin?{" "}
          <Link href="/register" className="font-semibold text-court">
            Kayıt ol
          </Link>
        </p>
      </form>
    </main>
  );
}
