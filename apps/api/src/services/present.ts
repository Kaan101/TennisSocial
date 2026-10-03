import type { Prisma } from "@prisma/client";
import {
  BACKHAND_LABELS,
  COURT_LABELS,
  FORMAT_LABELS,
  HAND_LABELS,
  LEVEL_LABELS,
  PLAY_LABELS,
  SET_FORMAT_LABELS,
  SKILL_LABELS,
  STATUS_LABELS,
  TIME_LABELS,
  istanbulNowParts,
  statusMessage,
  type SkillName,
} from "@club/shared";
import type { MatchSummary, PlayerCard, RadarPoint, UserDetail } from "@club/types";
import { dateOnly } from "../lib/dates";
import { canViewField, type Viewer } from "../lib/privacy";
import { prisma } from "../lib/prisma";
import { parseScore } from "./tournaments/standings";
import { isAvailableOn, type WindowRow } from "./availability";

export const userInclude = {
  profile: true,
  privacy: true,
  tennisProfile: { include: { skills: true } },
  rackets: { where: { deletedAt: null }, orderBy: { isPrimary: "desc" as const } },
  availability: { where: { deletedAt: null } },
  absences: { where: { deletedAt: null } },
} satisfies Prisma.UserInclude;

export type UserWithRelations = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function num(value: { toNumber?: () => number } | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function skillOf(user: UserWithRelations, skill: SkillName): number | null {
  const row = user.tennisProfile?.skills.find((item) => item.skill === skill);
  return row ? Number(row.value) : null;
}

function windowsOf(user: UserWithRelations): WindowRow[] {
  return user.availability.map((item) => ({
    kind: item.kind,
    weekday: item.weekday,
    date: dateOnly(item.date),
    startTime: item.startTime,
    endTime: item.endTime,
    note: item.note,
    state: item.state,
  }));
}

export function availableToday(user: UserWithRelations, day?: string, weekday?: number): boolean {
  if (!user.profile) return false;
  const today = day && weekday !== undefined ? { day, weekday } : istanbulNowParts();
  return isAvailableOn(
    {
      status: user.profile.playerStatus,
      windows: windowsOf(user),
      absences: user.absences.map((absence) => ({
        startDate: dateOnly(absence.startDate) ?? "",
        endDate: dateOnly(absence.endDate) ?? "",
      })),
    },
    today.day,
    today.weekday,
  );
}

function radarOf(user: UserWithRelations): RadarPoint[] {
  const pick = (skill: SkillName) => skillOf(user, skill) ?? 0;
  const movementValues = [pick("FOOTWORK"), pick("SPEED"), pick("STAMINA")].filter((value) => value > 0);
  const movement = movementValues.length
    ? Math.round((movementValues.reduce((sum, value) => sum + value, 0) / movementValues.length) * 10) / 10
    : 0;
  return [
    { axis: "Forehand", value: pick("FOREHAND") },
    { axis: "Backhand", value: pick("BACKHAND") },
    { axis: "Servis", value: pick("SERVE") },
    { axis: "Vole", value: pick("VOLLEY") },
    { axis: "Hareket", value: movement },
    { axis: "Tutarlılık", value: pick("CONSISTENCY") },
  ];
}

export function toPlayerCard(user: UserWithRelations, viewer: Viewer, isFriend: boolean): PlayerCard {
  const profile = user.profile;
  const privacy = user.privacy;
  const tennisAllowed = canViewField(privacy?.tennisProfileVisibility ?? "PUBLIC", viewer, user.id, isFriend).allowed;
  const phone = canViewField(privacy?.phoneVisibility ?? "MEMBERS", viewer, user.id, isFriend);
  const whatsapp = canViewField(privacy?.whatsappVisibility ?? "MEMBERS", viewer, user.id, isFriend);
  const primary = user.rackets.find((racket) => racket.isPrimary) ?? user.rackets[0] ?? null;
  const status = profile?.playerStatus ?? "ACTIVE";
  return {
    id: user.id,
    firstName: profile?.firstName ?? "",
    lastName: profile?.lastName ?? "",
    photoUrl: profile?.photoUrl ?? null,
    district: profile?.district ?? null,
    city: profile?.city ?? null,
    overallLevel: tennisAllowed ? (user.tennisProfile?.overallLevel ?? null) : null,
    overallLabel: tennisAllowed && user.tennisProfile ? LEVEL_LABELS[user.tennisProfile.overallLevel] : null,
    playerStatus: status,
    statusLabel: STATUS_LABELS[status],
    statusMessage: statusMessage(status, dateOnly(profile?.statusEnd)),
    tennisType: profile?.tennisType ?? "DIGER",
    ageGroup: profile?.ageGroup ?? "AGE_18_35",
    personProfile: profile?.personProfile ?? "OYUNCU",
    forehand: tennisAllowed ? skillOf(user, "FOREHAND") : null,
    backhand: tennisAllowed ? skillOf(user, "BACKHAND") : null,
    serve: tennisAllowed ? skillOf(user, "SERVE") : null,
    primaryRacket: primary && tennisAllowed ? { brand: primary.brand, model: primary.model } : null,
    canChallenge: viewer.id !== user.id && status !== "PAUSED",
    canCall: phone.allowed && Boolean(profile?.phone),
    canWhatsapp: whatsapp.allowed && Boolean(profile?.whatsapp),
    phone: phone.allowed ? (profile?.phone ?? null) : null,
    whatsapp: whatsapp.allowed ? (profile?.whatsapp ?? null) : null,
    availableToday: availableToday(user),
  };
}

export async function loadMatchStats(userId: string, viewerId?: string): Promise<NonNullable<UserDetail["stats"]>> {
  const matches = await prisma.match.findMany({
    where: { deletedAt: null, status: "COMPLETED", players: { some: { userId } } },
    include: { players: { include: { user: { include: { profile: true } } } } },
    orderBy: { scheduledAt: "desc" },
  });
  let wins = 0;
  let losses = 0;
  let setsWon = 0;
  let setsLost = 0;
  let gamesWon = 0;
  let gamesLost = 0;
  let h2hPlayed = 0;
  let h2hWins = 0;
  let h2hLosses = 0;
  const lastFive: NonNullable<UserDetail["stats"]>["lastFive"] = [];
  for (const match of matches) {
    const me = match.players.find((player) => player.userId === userId);
    if (!me || !match.winnerSide) continue;
    const won = me.side === match.winnerSide;
    if (won) wins += 1;
    else losses += 1;
    const parts = parseScore(match.score);
    const mineIsA = me.side === "A";
    setsWon += mineIsA ? parts.setsA : parts.setsB;
    setsLost += mineIsA ? parts.setsB : parts.setsA;
    gamesWon += mineIsA ? parts.gamesA : parts.gamesB;
    gamesLost += mineIsA ? parts.gamesB : parts.gamesA;
    if (viewerId && viewerId !== userId && match.players.some((player) => player.userId === viewerId)) {
      h2hPlayed += 1;
      if (won) h2hWins += 1;
      else h2hLosses += 1;
    }
    if (lastFive.length < 5) {
      lastFive.push({
        id: match.id,
        scheduledAt: match.scheduledAt.toISOString(),
        score: match.score,
        won,
        opponents: match.players
          .filter((player) => player.side !== me.side)
          .map((player) => `${player.user.profile?.firstName ?? ""} ${player.user.profile?.lastName ?? ""}`.trim()),
        format: match.format,
      });
    }
  }
  const total = wins + losses;
  return {
    matches: total,
    wins,
    losses,
    winRate: total === 0 ? 0 : Math.round((wins / total) * 1000) / 10,
    setsWon,
    setsLost,
    gamesWon,
    gamesLost,
    headToHead: viewerId && viewerId !== userId ? { played: h2hPlayed, wins: h2hWins, losses: h2hLosses } : null,
    lastFive,
  };
}

export async function toUserDetail(
  user: UserWithRelations,
  viewer: Viewer,
  isFriend: boolean,
): Promise<{ detail: UserDetail; overrideFields: string[] }> {
  const profile = user.profile;
  if (!profile) {
    throw new Error("Profil eksik");
  }
  const privacy = user.privacy;
  const overrideFields: string[] = [];
  const gate = (field: string, level: "PUBLIC" | "MEMBERS" | "FRIENDS" | "HIDDEN" | undefined, fallback: "PUBLIC" | "MEMBERS" | "FRIENDS" | "HIDDEN") => {
    const decision = canViewField(level ?? fallback, viewer, user.id, isFriend);
    if (decision.override) overrideFields.push(field);
    return decision.allowed;
  };
  const showPhone = gate("phone", privacy?.phoneVisibility, "MEMBERS");
  const showWhatsapp = gate("whatsapp", privacy?.whatsappVisibility, "MEMBERS");
  const showEmail = gate("email", privacy?.emailVisibility, "MEMBERS");
  const showAddress = gate("address", privacy?.addressVisibility, "HIDDEN");
  const showBirth = gate("birthYear", privacy?.birthYearVisibility, "MEMBERS");
  const showTennis = gate("tennisProfile", privacy?.tennisProfileVisibility, "PUBLIC");
  const showAvailability = gate("availability", privacy?.availabilityVisibility, "MEMBERS");
  const showMatches = gate("matchHistory", privacy?.matchHistoryVisibility, "MEMBERS");
  const isSelf = viewer.id === user.id;
  const canEdit = isSelf || viewer.role === "ADMIN" || viewer.role === "CLUB_MANAGER";
  const status = profile.playerStatus;

  const detail: UserDetail = {
    id: user.id,
    role: canEdit ? user.role : null,
    email: showEmail ? user.email : null,
    profile: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      photoUrl: profile.photoUrl,
      birthYear: showBirth ? profile.birthYear : null,
      gender: profile.gender,
      phone: showPhone ? profile.phone : null,
      whatsapp: showWhatsapp ? profile.whatsapp : null,
      address: showAddress ? profile.address : null,
      district: profile.district,
      city: profile.city,
      clubJoinDate: dateOnly(profile.clubJoinDate) ?? profile.createdAt.toISOString().slice(0, 10),
      bio: profile.bio,
      playerStatus: status,
      tennisType: profile.tennisType,
      ageGroup: profile.ageGroup,
      personProfile: profile.personProfile,
      statusLabel: STATUS_LABELS[status],
      statusMessage: statusMessage(status, dateOnly(profile.statusEnd)),
      statusNote: profile.statusNote,
      statusStart: dateOnly(profile.statusStart),
      statusEnd: dateOnly(profile.statusEnd),
    },
    permissions: {
      canEdit,
      canCall: showPhone && Boolean(profile.phone),
      canWhatsapp: showWhatsapp && Boolean(profile.whatsapp),
      canViewTennis: showTennis,
      canViewAvailability: showAvailability,
      canViewMatches: showMatches,
      canChallenge: !isSelf && status !== "PAUSED",
      isSelf,
      isFriend,
    },
    tennis:
      showTennis && user.tennisProfile
        ? {
            overallLevel: user.tennisProfile.overallLevel,
            overallLabel: LEVEL_LABELS[user.tennisProfile.overallLevel],
            ntrp: num(user.tennisProfile.ntrp),
            dominantHand: user.tennisProfile.dominantHand ? HAND_LABELS[user.tennisProfile.dominantHand] : null,
            backhandType: user.tennisProfile.backhandType ? BACKHAND_LABELS[user.tennisProfile.backhandType] : null,
            preferredCourt: user.tennisProfile.preferredCourt ? COURT_LABELS[user.tennisProfile.preferredCourt] : null,
            playPreference: user.tennisProfile.playPreference,
            playPreferenceLabel: PLAY_LABELS[user.tennisProfile.playPreference],
            preferredPlayTimes: user.tennisProfile.preferredPlayTimes.map((time) => TIME_LABELS[time]),
            tennisStartYear: user.tennisProfile.tennisStartYear,
            skills: user.tennisProfile.skills
              .map((skill) => ({
                skill: skill.skill,
                label: SKILL_LABELS[skill.skill],
                value: Number(skill.value),
              }))
              .sort((a, b) => a.label.localeCompare(b.label, "tr")),
            radar: radarOf(user),
          }
        : null,
    rackets: showTennis
      ? user.rackets.map((racket) => ({
          id: racket.id,
          brand: racket.brand,
          model: racket.model,
          headSize: racket.headSize,
          weight: racket.weight,
          stringName: racket.stringName,
          tension: racket.tension,
          gripSize: racket.gripSize,
          isPrimary: racket.isPrimary,
        }))
      : [],
    stats: showMatches ? await loadMatchStats(user.id, viewer.id) : null,
    privacy: isSelf && privacy
      ? {
          phoneVisibility: privacy.phoneVisibility,
          whatsappVisibility: privacy.whatsappVisibility,
          emailVisibility: privacy.emailVisibility,
          addressVisibility: privacy.addressVisibility,
          birthYearVisibility: privacy.birthYearVisibility,
          availabilityVisibility: privacy.availabilityVisibility,
          matchHistoryVisibility: privacy.matchHistoryVisibility,
          tennisProfileVisibility: privacy.tennisProfileVisibility,
          activityVisibility: privacy.activityVisibility,
        }
      : undefined,
  };
  return { detail, overrideFields };
}

type MatchWithPlayers = Prisma.MatchGetPayload<{
  include: { players: { include: { user: { include: { profile: true } } } } };
}>;

export function toMatchSummary(match: MatchWithPlayers, viewerId: string, viewerRole: string): MatchSummary {
  const participant = match.players.some((player) => player.userId === viewerId);
  const staff = viewerRole === "ADMIN" || viewerRole === "CLUB_MANAGER";
  return {
    id: match.id,
    format: match.format,
    formatLabel: FORMAT_LABELS[match.format],
    scheduledAt: match.scheduledAt.toISOString(),
    court: match.court,
    setFormat: match.setFormat,
    setFormatLabel: SET_FORMAT_LABELS[match.setFormat],
    score: match.score,
    winnerSide: match.winnerSide,
    note: match.note,
    status: match.status,
    players: match.players.map((player) => ({
      userId: player.userId,
      name: `${player.user.profile?.firstName ?? ""} ${player.user.profile?.lastName ?? ""}`.trim(),
      side: player.side,
      photoUrl: player.user.profile?.photoUrl ?? null,
    })),
    canRecordResult: match.status === "SCHEDULED" && (participant || staff),
  };
}

export const matchInclude = {
  players: { include: { user: { include: { profile: true } } } },
} satisfies Prisma.MatchInclude;
