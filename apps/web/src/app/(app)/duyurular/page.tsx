"use client";

import { canManageClub } from "@club/shared";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";

type Row = { id: string; title: string; body: string; publishedAt: string; authorName: string };

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useResource<{ data: Row[] }>("/announcements");
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "Duyurular açılmadı"} onRetry={reload} />;
  return (
    <div className="space-y-4">
      <PageHeader title="Duyurular" />
      {user && canManageClub(user.role) ? (
        <form
          className="space-y-2 rounded-3xl bg-surface p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              await api("/announcements", { method: "POST", body: JSON.stringify({ title: form.get("title"), body: form.get("body") }) });
              setMessage("Duyuru yayınlandı.");
              event.currentTarget.reset();
              await reload();
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Yayınlanamadı");
            }
          }}
        >
          <Label htmlFor="title">Başlık</Label>
          <Input id="title" name="title" required />
          <Label htmlFor="body">Metin</Label>
          <Textarea id="body" name="body" required />
          <Button type="submit">Yayınla</Button>
        </form>
      ) : null}
      {message ? <p className="text-sm">{message}</p> : null}
      {data.data.length === 0 ? <EmptyState title="Duyuru yok" body="Kulüp bir not bıraktığında burada durur." /> : null}
      {data.data.map((item) => (
        <article key={item.id} className="rounded-3xl border border-line bg-surface p-4">
          {editing === item.id ? (
            <form
              className="space-y-2"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                try {
                  await api(`/announcements/${item.id}`, { method: "PATCH", body: JSON.stringify({ title: form.get("title"), body: form.get("body") }) });
                  setEditing(null);
                  setMessage("Duyuru güncellendi.");
                  await reload();
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : "Güncellenemedi");
                }
              }}
            >
              <Label htmlFor={`title-${item.id}`}>Başlık</Label>
              <Input id={`title-${item.id}`} name="title" defaultValue={item.title} required />
              <Label htmlFor={`body-${item.id}`}>Metin</Label>
              <Textarea id={`body-${item.id}`} name="body" defaultValue={item.body} required />
              <Button type="submit">Kaydet</Button>
            </form>
          ) : (
            <>
              <h2 className="font-semibold">{item.title}</h2>
              <p className="mt-1 text-sm">{item.body}</p>
              <p className="mt-2 text-xs text-muted">{item.authorName}</p>
              {user && canManageClub(user.role) ? (
                <div className="mt-3 flex gap-3 text-sm font-semibold">
                  <button type="button" className="text-court" onClick={() => setEditing(item.id)}>Düzenle</button>
                  <button type="button" className="text-clay" onClick={async () => {
                    await api(`/announcements/${item.id}`, { method: "DELETE" });
                    setMessage("Duyuru kaldırıldı.");
                    await reload();
                  }}>Sil</button>
                </div>
              ) : null}
            </>
          )}
        </article>
      ))}
    </div>
  );
}
