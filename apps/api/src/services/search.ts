import type { Prisma } from "@prisma/client";
import { istanbulNowParts, type PlayerSearchInput } from "@club/shared";
import type { PlayerCard } from "@club/types";
import type { Viewer } from "../lib/privacy";
import { prisma } from "../lib/prisma";
import { hasWeekendWindow, isAvailableOn, type WindowRow } from "./availability";
import { loadFriendIds } from "./friends";
import { toPlayerCard, userInclude, type UserWithRelations } from "./present";
import { parseSearchQuery } from "./search-query";
import { dateOnly } from "../lib/dates";

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

export async function searchPlayers(
  viewer: Viewer,
  query: PlayerSearchInput,
): Promise<{ data: PlayerCard[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> {
  const parsed = parseSearchQuery(query.q);
  const and: Prisma.UserWhereInput[] = [{ deletedAt: null }, { profile: { is: { deletedAt: null } } }];
  const profile: Prisma.ProfileWhereInput = { deletedAt: null };
  if (query.district) profile.district = { equals: query.district, mode: "insensitive" };
  if (query.activeOnly) profile.playerStatus = "ACTIVE";
  const year = new Date().getFullYear();
  if (query.ageMin || query.ageMax) {
    profile.birthYear = {
      ...(query.ageMax ? { gte: year - query.ageMax } : {}),
      ...(query.ageMin ? { lte: year - query.ageMin } : {}),
    };
  }
  and[1] = { profile: { is: profile } };

  const level = query.overallLevel ?? parsed.overallLevel;
  if (level) and.push({ tennisProfile: { is: { overallLevel: level } } });
  const backhand = query.backhandType ?? parsed.backhandType;
  if (backhand) and.push({ tennisProfile: { is: { backhandType: backhand } } });
  if (query.playPreference === "SINGLES") {
    and.push({ tennisProfile: { is: { playPreference: { in: ["SINGLES", "BOTH"] } } } });
  } else if (query.playPreference === "DOUBLES") {
    and.push({ tennisProfile: { is: { playPreference: { in: ["DOUBLES", "BOTH"] } } } });
  } else if (query.playPreference === "BOTH") {
    and.push({ tennisProfile: { is: { playPreference: "BOTH" } } });
  }
  const forehandMin = query.forehandMin ?? parsed.forehandMin;
  const backhandMin = query.backhandMin ?? parsed.backhandMin;
  const serveMin = query.serveMin ?? parsed.serveMin;
  if (forehandMin) and.push({ tennisProfile: { is: { skills: { some: { skill: "FOREHAND", value: { gte: forehandMin } } } } } });
  if (backhandMin) and.push({ tennisProfile: { is: { skills: { some: { skill: "BACKHAND", value: { gte: backhandMin } } } } } });
  if (serveMin) and.push({ tennisProfile: { is: { skills: { some: { skill: "SERVE", value: { gte: serveMin } } } } } });
  if (query.groupId) and.push({ groupMemberships: { some: { groupId: query.groupId } } });

  if (parsed.text) {
    const or: Prisma.UserWhereInput[] = [
      { profile: { is: { firstName: { contains: parsed.text, mode: "insensitive" } } } },
      { profile: { is: { lastName: { contains: parsed.text, mode: "insensitive" } } } },
      { rackets: { some: { deletedAt: null, brand: { contains: parsed.text, mode: "insensitive" } } } },
      { rackets: { some: { deletedAt: null, model: { contains: parsed.text, mode: "insensitive" } } } },
    ];
    if (parsed.text.includes(" ")) {
      const [first, ...rest] = parsed.text.split(" ");
      or.push({
        rackets: {
          some: {
            deletedAt: null,
            AND: [
              { brand: { contains: first, mode: "insensitive" } },
              { model: { contains: rest.join(" "), mode: "insensitive" } },
            ],
          },
        },
      });
    }
    and.push({ OR: or });
  }

  const users = await prisma.user.findMany({ where: { AND: and }, include: userInclude });
  const friendIds = await loadFriendIds(viewer.id);
  const today = istanbulNowParts();
  const wantToday = Boolean(query.availableToday || parsed.availableToday);
  const wantWeekend = Boolean(query.availableWeekend || parsed.availableWeekend);

  const filtered = users.filter((user) => {
    const windows = windowsOf(user);
    const absences = user.absences.map((absence) => ({
      startDate: dateOnly(absence.startDate) ?? "",
      endDate: dateOnly(absence.endDate) ?? "",
    }));
    const status = user.profile?.playerStatus ?? "PAUSED";
    if (wantToday && !isAvailableOn({ status, windows, absences }, today.day, today.weekday)) return false;
    if (wantWeekend && (!hasWeekendWindow(windows) || (status !== "ACTIVE" && status !== "LIMITED"))) return false;
    return true;
  });

  filtered.sort((a, b) => {
    const aToday = isAvailableOn(
      {
        status: a.profile?.playerStatus ?? "PAUSED",
        windows: windowsOf(a),
        absences: a.absences.map((absence) => ({ startDate: dateOnly(absence.startDate) ?? "", endDate: dateOnly(absence.endDate) ?? "" })),
      },
      today.day,
      today.weekday,
    );
    const bToday = isAvailableOn(
      {
        status: b.profile?.playerStatus ?? "PAUSED",
        windows: windowsOf(b),
        absences: b.absences.map((absence) => ({ startDate: dateOnly(absence.startDate) ?? "", endDate: dateOnly(absence.endDate) ?? "" })),
      },
      today.day,
      today.weekday,
    );
    if (aToday !== bToday) return aToday ? -1 : 1;
    const an = `${a.profile?.lastName ?? ""} ${a.profile?.firstName ?? ""}`;
    const bn = `${b.profile?.lastName ?? ""} ${b.profile?.firstName ?? ""}`;
    return an.localeCompare(bn, "tr");
  });

  const total = filtered.length;
  const start = (query.page - 1) * query.pageSize;
  const data = filtered.slice(start, start + query.pageSize).map((user) => toPlayerCard(user, viewer, friendIds.has(user.id)));
  return {
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}
