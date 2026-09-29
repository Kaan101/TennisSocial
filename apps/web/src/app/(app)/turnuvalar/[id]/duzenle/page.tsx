"use client";

import { useParams, useRouter } from "next/navigation";
import { ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { TournamentForm, type TournamentFormValues } from "@/components/tournament-form";
import { useResource } from "@/lib/use-resource";

type Detail = {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  registrationDeadline: string | null;
  status: string;
  format: string;
  division: string;
  location: string | null;
  maxPlayers: number | null;
  minLevel: string | null;
  maxLevel: string | null;
  courts: string[];
  setFormat: string;
  rules: string | null;
  pointsWin: number;
  pointsLoss: number;
  groupSize: number;
  qualifiersPerGroup: number;
};

export default function EditTournamentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useResource<Detail>(`/tournaments/${params.id}`);
  if (loading) return <LoadingBlock label="Turnuva yükleniyor" />;
  if (error || !data) return <ErrorState message={error ?? "Turnuva açılmadı"} onRetry={reload} />;
  const initial: TournamentFormValues = {
    name: data.name,
    description: data.description ?? "",
    startDate: data.startDate,
    endDate: data.endDate ?? "",
    registrationDeadline: data.registrationDeadline ?? "",
    status: data.status,
    format: data.format,
    division: data.division,
    location: data.location ?? "",
    maxPlayers: data.maxPlayers ? String(data.maxPlayers) : "",
    minLevel: data.minLevel ?? "",
    maxLevel: data.maxLevel ?? "",
    courts: data.courts.join(", "),
    setFormat: data.setFormat,
    rules: data.rules ?? "",
    pointsWin: String(data.pointsWin),
    pointsLoss: String(data.pointsLoss),
    groupSize: String(data.groupSize),
    qualifiersPerGroup: String(data.qualifiersPerGroup),
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Turnuvayı düzenle" />
      <TournamentForm
        initial={initial}
        endpoint={`/tournaments/${data.id}`}
        method="PATCH"
        submitLabel="Kaydet"
        onDone={() => router.push(`/turnuvalar/${data.id}`)}
      />
    </div>
  );
}
