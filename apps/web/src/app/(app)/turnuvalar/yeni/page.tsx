"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/states";
import { TournamentForm, emptyTournamentForm } from "@/components/tournament-form";

export default function NewTournamentPage() {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <PageHeader title="Yeni turnuva" />
      <TournamentForm
        initial={emptyTournamentForm}
        endpoint="/tournaments"
        method="POST"
        submitLabel="Turnuvayı aç"
        onDone={(id) => router.push(id ? `/turnuvalar/${id}` : "/turnuvalar")}
      />
    </div>
  );
}
