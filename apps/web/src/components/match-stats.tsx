import type { UserDetail } from "@club/types";

export function MatchStats({ stats }: { stats: NonNullable<UserDetail["stats"]> }) {
  const head = stats.headToHead;
  return (
    <section className="rounded-3xl border border-line bg-surface p-4">
      <h2 className="font-semibold">Maçlar</h2>
      <p className="mt-1 text-sm">
        {stats.matches} maç · {stats.wins} galibiyet · {stats.losses} mağlubiyet · %{stats.winRate}
      </p>
      <p className="mt-1 text-sm text-muted">
        Set {stats.setsWon}-{stats.setsLost} · Oyun {stats.gamesWon}-{stats.gamesLost}
      </p>
      {head && head.played > 0 ? (
        <p className="mt-2 text-sm">
          Seninle {head.played} maç · {head.wins} galibiyet · {head.losses} mağlubiyet
        </p>
      ) : null}
      {stats.lastFive.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm">
          {stats.lastFive.map((match) => (
            <li key={match.id} className="flex justify-between gap-3">
              <span>{match.won ? "Galibiyet" : "Mağlubiyet"} · {match.opponents.join(", ") || "Rakip"}</span>
              <span className="text-muted">{match.score}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
