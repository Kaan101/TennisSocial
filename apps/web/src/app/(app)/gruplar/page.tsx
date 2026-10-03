"use client";

import { AGE_GROUP_LABELS, TENNIS_TYPE_LABELS, canManageClub, type AgeGroup, type TennisType } from "@club/shared";
import type { PageMeta } from "@club/types";
import Link from "next/link";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";

type Group = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  tennisType: TennisType;
  ageGroup: AgeGroup;
  memberCount: number;
  joined: boolean;
};

export default function GroupsPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useResource<{ data: Group[]; meta: PageMeta }>("/groups");
  const canCreate = user && (canManageClub(user.role) || user.role === "GROUP_MANAGER");
  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "Gruplar açılmadı"} onRetry={reload} />;
  return (
    <div className="space-y-4">
      <PageHeader title="Gruplar" action={canCreate ? <Link href="/gruplar/yeni" className="text-sm font-semibold text-court">Yeni</Link> : null} />
      {data.data.length === 0 ? <EmptyState title="Grup yok" body="Kulüp grupları burada listelenir." /> : null}
      {data.data.map((group) => (
        <Link key={group.id} href={`/gruplar/${group.id}`} className="block rounded-3xl border border-line bg-surface p-4">
          <p className="font-semibold">{group.name}</p>
          <p className="text-sm text-muted">{TENNIS_TYPE_LABELS[group.tennisType]} · {AGE_GROUP_LABELS[group.ageGroup]}</p>
          <p className="text-sm text-muted">{group.description}</p>
          <p className="mt-1 text-xs text-muted">{group.memberCount} üye · {group.visibility === "PUBLIC" ? "Açık" : "Kapalı"}{group.joined ? " · Üyesin" : ""}</p>
        </Link>
      ))}
    </div>
  );
}
