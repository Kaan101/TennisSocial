"use client";

import { canManageTournaments } from "@club/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";

type Match = {
  id: string;
  stage: string;
  groupKey: string;
  round: number;
  roundLabel: string;
  sideA: string;
  sideB: string;
  winnerId: string | null;
  score: string | null;
  canScore: boolean;
};

type Detail = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  statusLabel: string;
  format: string;
  formatLabel: string;
  divisionLabel: string;
  startDate: string;
  location: string | null;
  registrationDeadline: string | null;
  maxPlayers: number | null;
  minLevelLabel: string | null;
  maxLevelLabel: string | null;
  courts: string[];
  rules: string | null;
  pointsWin: number;
  pointsLoss: number;
  canManage: boolean;
  myStatus: string | null;
  champion: string | null;
  players: { userId: string; name: string; status: string; statusLabel: string }[];
  matches: Match[];
  standings: {
    userId: string;
    partnerId: string | null;
    groupKey: string;
    name: string;
    played: number;
    won: number;
    lost: number;
    setsWon: number;
    setsLost: number;
    gamesWon: number;
    gamesLost: number;
    points: number;
  }[];
};

function MatchCard({ tournamentId, match, onScored }: { tournamentId: string; match: Match; onScored: () => Promise<void> }) {
  const [score, setScore] = useState("6-4 6-3");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <article className="rounded-3xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{match.roundLabel}{match.groupKey ? ` · Grup ${match.groupKey}` : ""}</p>
      <p className="mt-2 font-semibold">{match.sideA}</p>
      <p className="text-sm text-muted">karşı</p>
      <p className="font-semibold">{match.sideB}</p>
      {match.score ? <p className="mt-2 text-sm">{match.score}{match.winnerId ? " · bitti" : ""}</p> : null}
      {match.canScore ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              await api(`/tournaments/${tournamentId}/matches/${match.id}/result`, {
                method: "POST",
                body: JSON.stringify({ score, winnerSide: form.get("winnerSide") }),
              });
              setMessage(null);
              await onScored();
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Skor kaydedilemedi");
            }
          }}
        >
          <Label htmlFor={`score-${match.id}`}>Skor</Label>
          <Input id={`score-${match.id}`} value={score} onChange={(event) => setScore(event.target.value)} />
          <Label htmlFor={`winner-${match.id}`}>Kazanan</Label>
          <select id={`winner-${match.id}`} name="winnerSide" className="h-11 w-full rounded-2xl border border-line bg-paper px-3 text-sm">
            <option value="A">{match.sideA}</option>
            <option value="B">{match.sideB}</option>
          </select>
          <Button type="submit" className="w-full">Skoru işle</Button>
          {message ? <p className="text-sm text-clay">{message}</p> : null}
        </form>
      ) : null}
    </article>
  );
}

export default function TournamentPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data, error, loading, reload } = useResource<Detail>(`/tournaments/${params.id}`);
  const [message, setMessage] = useState<string | null>(null);
  if (loading) return <LoadingBlock label="Turnuva yükleniyor" />;
  if (error || !data) return <ErrorState message={error ?? "Turnuva açılmadı"} onRetry={reload} />;
  const canManage = Boolean(user && canManageTournaments(user.role) && data.canManage);
  const active = data.myStatus === "REGISTERED" || data.myStatus === "CONFIRMED" || data.myStatus === "WAITING_LIST";
  const knockout = data.matches.filter((match) => match.stage === "KNOCKOUT");
  const groups = data.matches.filter((match) => match.stage === "GROUP");
  const americano = data.matches.filter((match) => match.stage === "AMERICANO");
  const rounds = [...new Set(knockout.map((match) => match.roundLabel))];
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-wide text-court uppercase">{data.formatLabel} · {data.divisionLabel}</p>
        <h1 className="mt-1 text-2xl font-semibold">{data.name}</h1>
        <p className="text-sm text-muted">{data.statusLabel} · {data.startDate}{data.location ? ` · ${data.location}` : ""}</p>
      </div>
      {data.description ? <p className="text-sm">{data.description}</p> : null}
      <div className="flex flex-wrap gap-2 text-xs text-muted">
        {data.maxPlayers ? <span className="rounded-full bg-surface px-3 py-1">En fazla {data.maxPlayers}</span> : null}
        {data.registrationDeadline ? <span className="rounded-full bg-surface px-3 py-1">Kayıt {data.registrationDeadline}</span> : null}
        {data.minLevelLabel || data.maxLevelLabel ? <span className="rounded-full bg-surface px-3 py-1">{data.minLevelLabel ?? "…"} – {data.maxLevelLabel ?? "…"}</span> : null}
        {data.courts.map((court) => <span key={court} className="rounded-full bg-surface px-3 py-1">{court}</span>)}
      </div>
      {data.rules ? <p className="rounded-3xl bg-surface p-4 text-sm">{data.rules}</p> : null}
      <div className="flex flex-wrap gap-2">
        {data.status === "REGISTRATION_OPEN" && !active ? (
          <Button onClick={async () => {
            try {
              const result = await api<{ status: string }>(`/tournaments/${data.id}/players`, { method: "POST", body: JSON.stringify({}) });
              setMessage(result.status === "WAITING_LIST" ? "Yedek listesine alındın." : "Kaydın alındı.");
              await reload();
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Kayıt olmadı");
            }
          }}>Katıl</Button>
        ) : null}
        {active ? (
          <Button variant="outline" onClick={async () => {
            try {
              await api(`/tournaments/${data.id}/withdraw`, { method: "POST", body: JSON.stringify({}) });
              setMessage("Kaydın çekildi.");
              await reload();
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Çıkılamadı");
            }
          }}>Çekil</Button>
        ) : null}
        {canManage ? <Link href={`/turnuvalar/${data.id}/duzenle`} className="inline-flex h-11 items-center rounded-full border border-line px-4 text-sm font-semibold">Düzenle</Link> : null}
        {canManage && data.matches.every((match) => !match.score) ? (
          <Button variant="outline" onClick={async () => {
            try {
              await api(`/tournaments/${data.id}/draw`, { method: "POST" });
              setMessage("Eşleşmeler kuruldu.");
              await reload();
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Eşleşme kurulamadı");
            }
          }}>Eşleşmeleri oluştur</Button>
        ) : null}
      </div>
      {message ? <p className="text-sm">{message}</p> : null}
      {data.champion ? <p className="rounded-3xl bg-court px-4 py-3 font-semibold text-white">Şampiyon: {data.champion}</p> : null}
      {knockout.length > 0 ? (
        <section>
          <h2 className="font-semibold">Eşleşme tablosu</h2>
          <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-2">
            {rounds.map((label) => (
              <div key={label} className="w-[78vw] max-w-sm shrink-0 snap-start space-y-3">
                <h3 className="text-sm font-semibold">{label}</h3>
                {knockout.filter((match) => match.roundLabel === label).map((match) => (
                  <MatchCard key={match.id} tournamentId={data.id} match={match} onScored={reload} />
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {groups.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold">{data.format === "ROUND_ROBIN" ? "Fikstür" : "Grup maçları"}</h2>
          {groups.map((match) => <MatchCard key={match.id} tournamentId={data.id} match={match} onScored={reload} />)}
        </section>
      ) : null}
      {americano.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold">Americano</h2>
          {americano.map((match) => <MatchCard key={match.id} tournamentId={data.id} match={match} onScored={reload} />)}
        </section>
      ) : null}
      {data.standings.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-semibold">{data.format === "AMERICANO" ? "Puan tablosu" : "Puan durumu"}</h2>
          <p className="text-xs text-muted">Galibiyet {data.pointsWin}, mağlubiyet {data.pointsLoss}</p>
          {data.standings.map((row) => (
            <article key={`${row.groupKey}-${row.userId}-${row.partnerId ?? ""}`} className="rounded-3xl border border-line bg-surface p-4 text-sm">
              <p className="font-semibold">{row.groupKey ? `Grup ${row.groupKey} · ` : ""}{row.name}</p>
              <p className="mt-1 text-muted">{row.played} maç · {row.won} galibiyet · {row.lost} mağlubiyet · set {row.setsWon}-{row.setsLost} · oyun {row.gamesWon}-{row.gamesLost} · {row.points} puan</p>
            </article>
          ))}
        </section>
      ) : null}
      <section>
        <h2 className="font-semibold">Oyuncular</h2>
        {data.players.length === 0 ? <EmptyState title="Henüz katılan yok" body="Kayıt açıkken Katıl ile listeye girebilirsin." /> : (
          <ul className="mt-2 space-y-2">
            {data.players.map((player) => (
              <li key={player.userId} className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3 text-sm">
                <span>{player.name}</span>
                <span className="text-muted">{player.statusLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
