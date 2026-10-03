"use client";

import { AGE_GROUPS, AGE_GROUP_LABELS, TENNIS_TYPES, TENNIS_TYPE_LABELS } from "@club/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/states";

export default function NewGroupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          const group = await api<{ id: string }>("/groups", {
            method: "POST",
            body: JSON.stringify({
              name: form.get("name"),
              description: form.get("description"),
              visibility: form.get("visibility"),
              tennisType: form.get("tennisType"),
              ageGroup: form.get("ageGroup"),
            }),
          });
          router.push(`/gruplar/${group.id}`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Grup açılamadı");
        }
      }}
    >
      <PageHeader title="Yeni grup" />
      <div><Label htmlFor="name">Ad</Label><Input id="name" name="name" required /></div>
      <div>
        <Label htmlFor="tennisType">Tür</Label>
        <Select id="tennisType" name="tennisType" required defaultValue="">
          <option value="" disabled>Seç</option>
          {TENNIS_TYPES.map((type) => <option key={type} value={type}>{TENNIS_TYPE_LABELS[type]}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="ageGroup">Yaş grubu</Label>
        <Select id="ageGroup" name="ageGroup" required defaultValue="AGE_18_35">
          {AGE_GROUPS.map((band) => <option key={band} value={band}>{AGE_GROUP_LABELS[band]}</option>)}
        </Select>
      </div>
      <div><Label htmlFor="description">Açıklama</Label><Textarea id="description" name="description" /></div>
      <div>
        <Label htmlFor="visibility">Görünürlük</Label>
        <Select id="visibility" name="visibility" defaultValue="PUBLIC">
          <option value="PUBLIC">Açık</option>
          <option value="PRIVATE">Kapalı</option>
        </Select>
      </div>
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      <Button type="submit" className="w-full">Oluştur</Button>
    </form>
  );
}
