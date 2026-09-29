/* Profile photos are served by the API or Cloudinary, so they are not passed through the Next image optimizer. */
import { telLink, waLink } from "@club/shared";
import type { PlayerCard as Card } from "@club/types";
import { MessageCircle, Phone, Swords } from "lucide-react";
import Link from "next/link";
import { initials } from "@/lib/utils";

export function Avatar({
  first,
  last,
  photo,
  className = "h-12 w-12",
}: {
  first?: string | null;
  last?: string | null;
  photo?: string | null;
  className?: string;
}) {
  if (photo) {
    return <img src={photo} alt="" className={`${className} rounded-full object-cover`} />; // eslint-disable-line @next/next/no-img-element
  }
  return (
    <span className={`${className} inline-flex items-center justify-center rounded-full bg-court-deep text-sm font-semibold text-white`}>
      {initials(first, last)}
    </span>
  );
}

function whatsappMessageNumber(player: Card): string | null {
  const phone = player.canCall && player.phone ? player.phone : null;
  const whatsapp = player.canWhatsapp && player.whatsapp ? player.whatsapp : null;
  if (phone) return whatsapp ?? phone;
  return whatsapp;
}

export function PlayerCard({ player }: { player: Card }) {
  const name = `${player.firstName} ${player.lastName}`.trim();
  const messageNumber = whatsappMessageNumber(player);
const callNumber = player.canCall && player.phone ? player.phone : null;
  return (
    <article className="rounded-3xl border border-line bg-surface p-4">
      <Link href={`/oyuncular/${player.id}`} className="flex gap-3">
        <Avatar first={player.firstName} last={player.lastName} photo={player.photoUrl} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{name}</p>
          <p className="text-sm text-muted">
            {player.overallLabel ?? "Seviye gizli"} · {player.statusLabel}
            {player.district ? ` · ${player.district}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted">
            FH {player.forehand ?? "–"} · BH {player.backhand ?? "–"} · Servis {player.serve ?? "–"}
          </p>
          {player.primaryRacket ? (
            <p className="text-xs text-muted">
              {player.primaryRacket.brand} {player.primaryRacket.model}
            </p>
          ) : null}
        </div>
      </Link>
      <div className="mt-3 flex gap-2">
        {player.canChallenge ? (
          <Link href={`/defiler/yeni?recipientId=${player.id}`} className="inline-flex h-9 items-center gap-1 rounded-full bg-court px-3 text-xs font-semibold text-white">
            <Swords className="h-3.5 w-3.5" aria-hidden /> Defi
          </Link>
        ) : null}
  {callNumber ? (
  <a href={telLink(callNumber)} className="inline-flex h-9 items-center gap-1 rounded-full border border-line px-3 text-xs font-semibold">
    <Phone className="h-3.5 w-3.5" aria-hidden /> Ara
  </a>
) : null}
{messageNumber ? (
  <a href={waLink(messageNumber, player.firstName)} className="inline-flex h-9 items-center gap-1 rounded-full border border-line px-3 text-xs font-semibold">
    <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Mesaj
  </a>
) : null}
      </div>
    </article>
  );
}
