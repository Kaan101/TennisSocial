"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/session/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: form.get("firstName"),
        lastName: form.get("lastName"),
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(json?.error?.message ?? "Kayıt tamamlanamadı");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-3xl font-semibold">Kulübe katıl</h1>
      <p className="mt-1 text-sm text-muted">Profilini sonra tenis bilgilerinle tamamlayabilirsin.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <div>
          <Label htmlFor="firstName">Ad</Label>
          <Input id="firstName" name="firstName" required minLength={2} />
        </div>
        <div>
          <Label htmlFor="lastName">Soyad</Label>
          <Input id="lastName" name="lastName" required minLength={2} />
        </div>
        <div>
          <Label htmlFor="email">E-posta</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div>
          <Label htmlFor="password">Parola</Label>
          <Input id="password" name="password" type="password" required minLength={8} />
        </div>
        {error ? <p className="text-sm text-clay" role="alert">{error}</p> : null}
        <Button className="w-full" disabled={pending}>{pending ? "Kaydediliyor…" : "Hesap oluştur"}</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Hesabın var mı? <Link href="/login" className="font-semibold text-court">Giriş yap</Link>
      </p>
    </main>
  );
}
