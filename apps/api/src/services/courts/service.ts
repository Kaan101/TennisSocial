import type { CourtKind, CourtPurpose, OverallLevel, Role } from "@club/shared";
import { CLUB_COURTS, COURT_KIND_LABELS, COURT_PURPOSE_LABELS, LEVEL_LABELS, WEEKDAYS, istanbulNowParts, levelIndex, purposesForRole } from "@club/shared";
import type { Prisma } from "@prisma/client";
import { combineIstanbul, dateOnly, parseDateOnly } from "../../lib/dates";
import { AppError, forbidden, notFound } from "../../lib/errors";
import { isPlayableStatus } from "../../lib/privacy";
import { prisma } from "../../lib/prisma";
import { notify } from "../notify";
import {
  CHECK_IN_LEAD_KEY,
  COURT_CLOSE,
  COURT_HOURS,
  COURT_OPEN,
  DEFAULT_CHECK_IN_LEAD_HOURS,
  MAX_RANGE_DAYS,
  type Span,
  checkInWindowError,
  hoursInRange,
  inclusiveDayCount,
  isHourRange,
  mondayOf,
  rangeHitsWeekdays,
  slotCoveredBySpan,
  slotEnd,
  slotIsGreen,
  slotStartInstant,
  spansOverlap,
  timesOverlap,
  weekDates,
  weekdayOfDate,
} from "./rules";

type Db = Prisma.TransactionClient | typeof prisma;

export type CourtViewer = { id: string; role: Role };

type Person = {
  id: string;
  boardVisible: boolean;
  firstName: string;
  lastName: string;
};

const courtOrder = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

function presentCourt(row: { id: string; name: string; active: boolean; kind: CourtKind; sortOrder: number }) {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    kind: row.kind,
    kindLabel: COURT_KIND_LABELS[row.kind],
    sortOrder: row.sortOrder,
  };
}

export async function ensureClubCourts(db: Db = prisma): Promise<void> {
  for (const court of CLUB_COURTS) {
    const existing = await db.court.findFirst({ where: { name: court.name, deletedAt: null } });
    if (!existing) {
      await db.court.create({
        data: { name: court.name, kind: court.kind, sortOrder: court.sortOrder, active: true },
      });
      continue;
    }
    if (existing.kind !== court.kind || existing.sortOrder !== court.sortOrder) {
      await db.court.update({
        where: { id: existing.id },
        data: { kind: court.kind, sortOrder: court.sortOrder },
      });
    }
  }
}

const personSelect = {
  id: true,
  boardVisible: true,
  profile: { select: { firstName: true, lastName: true } },
} satisfies Prisma.UserSelect;

function toPerson(user: {
  id: string;
  boardVisible: boolean;
  profile: { firstName: string; lastName: string } | null;
}): Person {
  return {
    id: user.id,
    boardVisible: user.boardVisible,
    firstName: user.profile?.firstName ?? "",
    lastName: user.profile?.lastName ?? "",
  };
}

function spanFromRow(row: {
  startDate: Date;
  endDate: Date;
  weekdays: number[];
  startTime: string;
  endTime: string;
}): Span {
  return {
    startDate: dateOnly(row.startDate) ?? "",
    endDate: dateOnly(row.endDate) ?? "",
    weekdays: row.weekdays,
    startTime: row.startTime,
    endTime: row.endTime,
  };
}

function assertSpan(span: Span): void {
  if (span.endDate < span.startDate) {
    throw new AppError(400, "VALIDATION_ERROR", "Bitiş tarihi başlangıçtan önce olamaz");
  }
  if (inclusiveDayCount(span.startDate, span.endDate) > MAX_RANGE_DAYS) {
    throw new AppError(400, "VALIDATION_ERROR", "Dönem en fazla bir yıl olabilir");
  }
  if (span.endTime <= span.startTime || span.startTime < COURT_OPEN || span.endTime > COURT_CLOSE) {
    throw new AppError(400, "VALIDATION_ERROR", "Saat aralığı 08:00 ile 23:00 arasında olmalı");
  }
  const weekdays = [...new Set(span.weekdays)];
  span.weekdays = weekdays;
  if (span.startDate === span.endDate) {
    const day = weekdayOfDate(span.startDate);
    if (weekdays.length !== 1 || weekdays[0] !== day) {
      throw new AppError(400, "VALIDATION_ERROR", "Tek gün için haftanın günü tarihle aynı olmalı");
    }
  }
  if (!rangeHitsWeekdays(span.startDate, span.endDate, weekdays)) {
    throw new AppError(400, "VALIDATION_ERROR", "Seçilen günler bu tarih aralığında yok");
  }
}

function assertPurpose(viewer: CourtViewer, purpose: CourtPurpose): void {
  if (!purposesForRole(viewer.role).includes(purpose)) {
    if (purpose === "MAINTENANCE") throw forbidden("Bakım rezervasyonunu yalnızca yönetici açar");
    if (purpose === "TOURNAMENT") throw forbidden("Turnuva rezervasyonunu turnuva sorumlusu açar");
    throw forbidden("Bu amaç için rezervasyon açamazsın");
  }
}

async function assertNoOverlap(db: Db, courtId: string, span: Span, exceptId?: string): Promise<void> {
  const rows = await db.courtReservation.findMany({
    where: {
      courtId,
      deletedAt: null,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: parseDateOnly(span.endDate) },
      endDate: { gte: parseDateOnly(span.startDate) },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
  if (rows.some((row) => spansOverlap(span, spanFromRow(row)))) {
    throw new AppError(409, "CONFLICT", "Bu kortta çakışan bir rezervasyon talebi var");
  }
}

export async function getCheckInLeadHours(db: Db = prisma): Promise<number> {
  const row = await db.systemParameter.findUnique({ where: { key: CHECK_IN_LEAD_KEY } });
  if (!row) return DEFAULT_CHECK_IN_LEAD_HOURS;
  const hours = Number(row.value);
  if (!Number.isInteger(hours) || hours < 0 || hours > 72) return DEFAULT_CHECK_IN_LEAD_HOURS;
  return hours;
}

export async function setCheckInLeadHours(viewer: CourtViewer, hours: number): Promise<number> {
  if (viewer.role !== "ADMIN") throw forbidden("Check-in süresini yalnızca yönetici değiştirir");
  await prisma.systemParameter.upsert({
    where: { key: CHECK_IN_LEAD_KEY },
    create: { key: CHECK_IN_LEAD_KEY, value: String(hours) },
    update: { value: String(hours) },
  });
  return hours;
}

export async function setBoardVisible(viewer: CourtViewer, visible: boolean): Promise<{ visible: boolean }> {
  await prisma.user.update({ where: { id: viewer.id }, data: { boardVisible: visible } });
  return { visible };
}

export async function listCourts(viewer: CourtViewer, includeInactive: boolean) {
  const showAll = includeInactive && viewer.role === "ADMIN";
  const rows = await prisma.court.findMany({
    where: { deletedAt: null, ...(showAll ? {} : { active: true }) },
    orderBy: courtOrder,
  });
  return { data: rows.map(presentCourt) };
}

export async function createCourt(viewer: CourtViewer, name: string) {
  if (viewer.role !== "ADMIN") throw forbidden("Kortu yalnızca yönetici ekler");
  const court = await prisma.court.create({ data: { name, active: true, kind: "OUTDOOR", sortOrder: 1000 } });
  return presentCourt(court);
}

export async function updateCourt(viewer: CourtViewer, id: string, input: { name?: string; active?: boolean }) {
  if (viewer.role !== "ADMIN") throw forbidden("Kortu yalnızca yönetici düzenler");
  const court = await prisma.court.findFirst({ where: { id, deletedAt: null } });
  if (!court) throw notFound("Kort bulunamadı");
  const updated = await prisma.court.update({
    where: { id },
    data: { name: input.name, active: input.active },
  });
  return presentCourt(updated);
}

const reservationInclude = {
  court: { select: { id: true, name: true } },
  holder: { select: personSelect },
  partner: { select: personSelect },
} satisfies Prisma.CourtReservationInclude;

function presentReservation(row: Prisma.CourtReservationGetPayload<{ include: typeof reservationInclude }>) {
  return {
    id: row.id,
    courtId: row.courtId,
    courtName: row.court.name,
    purpose: row.purpose,
    purposeLabel: COURT_PURPOSE_LABELS[row.purpose],
    status: row.status,
    startDate: dateOnly(row.startDate),
    endDate: dateOnly(row.endDate),
    weekdays: row.weekdays,
    startTime: row.startTime,
    endTime: row.endTime,
    note: row.note,
    matchId: row.matchId,
    holder: toPerson(row.holder),
    partner: row.partner ? toPerson(row.partner) : null,
  };
}

export async function createReservation(
  viewer: CourtViewer,
  input: {
    courtId: string;
    purpose: CourtPurpose;
    startDate: string;
    endDate: string;
    weekdays: number[];
    startTime: string;
    endTime: string;
    partnerId?: string | null;
    note?: string | null;
  },
) {
  assertPurpose(viewer, input.purpose);
  const span: Span = {
    startDate: input.startDate,
    endDate: input.endDate,
    weekdays: input.weekdays,
    startTime: input.startTime,
    endTime: input.endTime,
  };
  assertSpan(span);
  const partnerId = input.partnerId ?? null;
  if (input.purpose === "MATCH") {
    if (!partnerId) throw new AppError(400, "VALIDATION_ERROR", "Maç rezervasyonunda iki oyuncu olmalı");
    if (partnerId === viewer.id) throw new AppError(400, "VALIDATION_ERROR", "Kendinle maç rezervasyonu açamazsın");
  } else if (partnerId) {
    throw new AppError(400, "VALIDATION_ERROR", "Rakip yalnızca maç rezervasyonunda seçilir");
  }
  const court = await prisma.court.findFirst({ where: { id: input.courtId, deletedAt: null, active: true } });
  if (!court) throw notFound("Kort bulunamadı");
  if (partnerId) {
    const partner = await prisma.user.findFirst({ where: { id: partnerId, deletedAt: null } });
    if (!partner) throw notFound("Oyuncu bulunamadı");
  }
  const status = viewer.role === "ADMIN" ? "APPROVED" : "PENDING";
  const created = await prisma.$transaction(async (tx) => {
    await assertNoOverlap(tx, court.id, span);
    return tx.courtReservation.create({
      data: {
        courtId: court.id,
        purpose: input.purpose,
        status,
        startDate: parseDateOnly(span.startDate),
        endDate: parseDateOnly(span.endDate),
        weekdays: span.weekdays,
        startTime: span.startTime,
        endTime: span.endTime,
        holderId: viewer.id,
        partnerId,
        note: input.note ?? null,
        createdById: viewer.id,
        decidedById: status === "APPROVED" ? viewer.id : null,
        decidedAt: status === "APPROVED" ? new Date() : null,
      },
      include: reservationInclude,
    });
  });
  return presentReservation(created);
}

export async function listReservations(viewer: CourtViewer, query: { status?: "PENDING" | "APPROVED" | "REJECTED"; page: number; pageSize: number }) {
  const where: Prisma.CourtReservationWhereInput = {
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(viewer.role === "ADMIN"
      ? {}
      : { OR: [{ holderId: viewer.id }, { partnerId: viewer.id }] }),
  };
  const [total, rows] = await Promise.all([
    prisma.courtReservation.count({ where }),
    prisma.courtReservation.findMany({
      where,
      include: reservationInclude,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return {
    data: rows.map(presentReservation),
    meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
  };
}

async function loadPending(id: string) {
  const row = await prisma.courtReservation.findFirst({ where: { id, deletedAt: null } });
  if (!row) throw notFound("Rezervasyon bulunamadı");
  if (row.status !== "PENDING") throw new AppError(409, "CONFLICT", "Bu talep artık yanıtlanamaz");
  return row;
}

export async function approveReservation(viewer: CourtViewer, id: string) {
  if (viewer.role !== "ADMIN") throw forbidden("Rezervasyonu yalnızca yönetici onaylar");
  const current = await loadPending(id);
  const updated = await prisma.$transaction(async (tx) => {
    const fresh = await tx.courtReservation.findFirst({ where: { id, deletedAt: null } });
    if (!fresh || fresh.status !== "PENDING") throw new AppError(409, "CONFLICT", "Bu talep artık yanıtlanamaz");
    await assertNoOverlap(tx, fresh.courtId, spanFromRow(fresh), fresh.id);
    return tx.courtReservation.update({
      where: { id },
      data: { status: "APPROVED", decidedById: viewer.id, decidedAt: new Date() },
      include: reservationInclude,
    });
  });
  const targets = [current.holderId, current.partnerId].filter((userId): userId is string => Boolean(userId) && userId !== viewer.id);
  await Promise.all(
    targets.map((userId) =>
      notify({
        userId,
        type: "SYSTEM",
        title: "Kort talebi onaylandı",
        body: `${updated.court.name} · ${COURT_PURPOSE_LABELS[updated.purpose]} · ${updated.startTime}`,
        link: `/kortlar/${updated.courtId}`,
      }),
    ),
  );
  return presentReservation(updated);
}

export async function rejectReservation(viewer: CourtViewer, id: string) {
  if (viewer.role !== "ADMIN") throw forbidden("Rezervasyonu yalnızca yönetici reddeder");
  await loadPending(id);
  const updated = await prisma.courtReservation.update({
    where: { id },
    data: { status: "REJECTED", decidedById: viewer.id, decidedAt: new Date() },
    include: reservationInclude,
  });
  if (updated.holderId !== viewer.id) {
    await notify({
      userId: updated.holderId,
      type: "SYSTEM",
      title: "Kort talebi reddedildi",
      body: `${updated.court.name} için talep reddedildi.`,
      link: `/kortlar/${updated.courtId}`,
    });
  }
  return presentReservation(updated);
}

function canCheckInUser(viewerId: string, reservation: { holderId: string; partnerId: string | null; purpose: CourtPurpose }): boolean {
  if (viewerId === reservation.holderId) return true;
  return reservation.purpose === "MATCH" && viewerId === reservation.partnerId;
}

export async function checkInReservation(viewer: CourtViewer, id: string, input: { date: string; startTime: string }) {
  const reservation = await prisma.courtReservation.findFirst({ where: { id, deletedAt: null } });
  if (!reservation) throw notFound("Rezervasyon bulunamadı");
  if (reservation.status !== "APPROVED") throw new AppError(409, "CONFLICT", "Check-in yalnızca onaylı rezervasyonda açılır");
  if (!canCheckInUser(viewer.id, reservation)) throw forbidden("Bu rezervasyon için check-in yapamazsın");
  if (!COURT_HOURS.includes(input.startTime)) {
    throw new AppError(400, "VALIDATION_ERROR", "Check-in saati kort aralığında olmalı");
  }
  if (!slotCoveredBySpan(input.date, input.startTime, spanFromRow(reservation))) {
    throw new AppError(400, "VALIDATION_ERROR", "Bu saat rezervasyonun içinde değil");
  }
  const lead = await getCheckInLeadHours();
  const windowError = checkInWindowError(new Date(), slotStartInstant(input.date, input.startTime), lead);
  if (windowError) throw new AppError(409, "CONFLICT", windowError);
  const existing = await prisma.reservationCheckIn.findUnique({
    where: {
      reservationId_date_startTime_userId: {
        reservationId: id,
        date: parseDateOnly(input.date),
        startTime: input.startTime,
        userId: viewer.id,
      },
    },
  });
  if (!existing) {
    await prisma.reservationCheckIn.create({
      data: {
        reservationId: id,
        date: parseDateOnly(input.date),
        startTime: input.startTime,
        userId: viewer.id,
      },
    });
  }
  return { ok: true, reservationId: id, date: input.date, startTime: input.startTime };
}

type BoardUser = {
  id: string;
  boardVisible: boolean;
  profile: { firstName: string; lastName: string; playerStatus: string } | null;
  tennisProfile: { overallLevel: OverallLevel } | null;
  availability: { kind: "WEEKLY" | "ONE_OFF"; weekday: number | null; date: Date | null; startTime: string; endTime: string }[];
  absences: { startDate: Date; endDate: Date }[];
};

function userAvailable(user: BoardUser, date: string, weekday: number, startTime: string): boolean {
  if (!user.profile || !isPlayableStatus(user.profile.playerStatus)) return false;
  const away = user.absences.some((absence) => {
    const start = dateOnly(absence.startDate);
    const end = dateOnly(absence.endDate);
    return Boolean(start && end && date >= start && date <= end);
  });
  if (away) return false;
  const endTime = slotEnd(startTime);
  return user.availability.some((window) => {
    if (!timesOverlap(window.startTime, window.endTime, startTime, endTime)) return false;
    if (window.kind === "ONE_OFF") return dateOnly(window.date) === date;
    return window.weekday === weekday;
  });
}

type ApprovedRow = Prisma.CourtReservationGetPayload<{
  include: {
    holder: { select: typeof personSelect };
    partner: { select: typeof personSelect };
    checkIns: true;
  };
}>;

function playingIds(row: { purpose: CourtPurpose; holderId: string; partnerId: string | null }): string[] {
  if (row.purpose === "MAINTENANCE") return [];
  return [row.holderId, row.partnerId].filter((id): id is string => Boolean(id));
}

function namesFor(
  viewer: CourtViewer,
  row: ApprovedRow,
): { id: string; firstName: string; lastName: string }[] | null {
  const people = [toPerson(row.holder), row.partner ? toPerson(row.partner) : null].filter((person): person is Person => Boolean(person));
  if (row.purpose === "MAINTENANCE") return [];
  const participantIds = people.map((person) => person.id);
  const privileged = viewer.role === "ADMIN" || viewer.role === "CLUB_MANAGER" || participantIds.includes(viewer.id);
  const visible = people.filter((person) => privileged || person.boardVisible);
  return visible.map(({ id, firstName, lastName }) => ({ id, firstName, lastName }));
}

export async function boardFor(viewer: CourtViewer, weekInput?: string, extraCourtIds: string[] = []) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const weekStart = mondayOf(weekInput ?? today);
  const dates = weekDates(weekStart);
  const weekEnd = dates[6]!;
  const [courts, users, reservations, lead, me] = await Promise.all([
    prisma.court.findMany({
      where: {
        deletedAt: null,
        OR: [{ active: true }, ...(extraCourtIds.length > 0 ? [{ id: { in: extraCourtIds } }] : [])],
      },
      orderBy: courtOrder,
    }),
    prisma.user.findMany({
      where: { deletedAt: null, boardVisible: true, profile: { is: { deletedAt: null } } },
      select: {
        id: true,
        boardVisible: true,
        profile: { select: { firstName: true, lastName: true, playerStatus: true } },
        tennisProfile: { select: { overallLevel: true } },
        availability: { where: { deletedAt: null }, select: { kind: true, weekday: true, date: true, startTime: true, endTime: true } },
        absences: { where: { deletedAt: null }, select: { startDate: true, endDate: true } },
      },
    }),
    prisma.courtReservation.findMany({
      where: {
        deletedAt: null,
        status: "APPROVED",
        startDate: { lte: parseDateOnly(weekEnd) },
        endDate: { gte: parseDateOnly(weekStart) },
      },
      include: {
        holder: { select: personSelect },
        partner: { select: personSelect },
        checkIns: true,
      },
    }),
    getCheckInLeadHours(),
    prisma.user.findUnique({ where: { id: viewer.id }, select: { boardVisible: true } }),
  ]);

  const now = new Date();
  const slots = dates.flatMap((date) => {
    const weekday = weekdayOfDate(date);
    return COURT_HOURS.map((startTime) => {
      const covering = reservations.filter((row) => slotCoveredBySpan(date, startTime, spanFromRow(row)));
      const busy = new Set(covering.flatMap((row) => playingIds(row)));
      const people = (users as BoardUser[])
        .filter((user) => userAvailable(user, date, weekday, startTime) && !busy.has(user.id))
        .map((user) => {
          const level = user.tennisProfile?.overallLevel ?? "INTERMEDIATE";
          return {
            id: user.id,
            firstName: user.profile?.firstName ?? "",
            lastName: user.profile?.lastName ?? "",
            overallLevel: level,
            levelLabel: LEVEL_LABELS[level],
            levelIndex: levelIndex(level),
          };
        })
        .sort((a, b) => a.lastName.localeCompare(b.lastName, "tr"));
      const slotStart = slotStartInstant(date, startTime);
      return {
        date,
        weekday,
        startTime,
        endTime: slotEnd(startTime),
        green: slotIsGreen(people.map((person) => person.levelIndex)),
        people: people.map(({ levelIndex: _levelIndex, ...person }) => person),
        courts: courts.map((court) => {
          const identity = { id: court.id, name: court.name, kind: court.kind, kindLabel: COURT_KIND_LABELS[court.kind] };
          const row = covering.find((item) => item.courtId === court.id);
          if (!row) return { ...identity, state: "free" as const, reservation: null };
          const checkedIn = row.checkIns.some((item) => dateOnly(item.date) === date && item.startTime === startTime);
          const windowError = checkInWindowError(now, slotStart, lead);
          const allowed = canCheckInUser(viewer.id, row);
          const already = row.checkIns.some((item) => dateOnly(item.date) === date && item.startTime === startTime && item.userId === viewer.id);
          return {
            ...identity,
            state: "reserved" as const,
            reservation: {
              id: row.id,
              purpose: row.purpose,
              purposeLabel: COURT_PURPOSE_LABELS[row.purpose],
              checkedIn,
              canCheckIn: allowed && !already && !windowError,
              checkInHint: allowed && !already ? windowError : null,
              players: namesFor(viewer, row),
            },
          };
        }),
      };
    });
  });

  return {
    weekStart,
    weekEnd,
    hours: COURT_HOURS,
    checkInLeadHours: lead,
    viewer: {
      boardVisible: me?.boardVisible ?? true,
      canApprove: viewer.role === "ADMIN",
      purposes: purposesForRole(viewer.role),
    },
    days: dates.map((date) => {
      const weekday = weekdayOfDate(date);
      const known = WEEKDAYS.find((day) => day.value === weekday);
      return { date, weekday, label: known?.label ?? "", short: known?.short ?? "" };
    }),
    slots,
  };
}

export async function rangeFor(viewer: CourtViewer, input: { date: string; start: string; end: string }) {
  if (!isHourRange(input.start, input.end)) {
    throw new AppError(400, "VALIDATION_ERROR", "Saat aralığı aynı gün içinde 08:00 ile 23:00 arasında olmalı");
  }
  const board = await boardFor(viewer, input.date);
  const wanted = hoursInRange(input.start, input.end);
  const hours = wanted.map((startTime) => board.slots.find((slot) => slot.date === input.date && slot.startTime === startTime));
  if (hours.some((slot) => !slot)) {
    throw new AppError(400, "VALIDATION_ERROR", "Seçilen saatler takvimde yok");
  }
  const slots = hours.filter((slot): slot is NonNullable<typeof slot> => Boolean(slot));
  const template = slots[0]?.courts ?? [];
  const freeForRange = template
    .filter((court) => slots.every((slot) => slot.courts.find((item) => item.id === court.id)?.state === "free"))
    .map((court) => ({ id: court.id, name: court.name, kind: court.kind, kindLabel: court.kindLabel }));
  return {
    date: input.date,
    startTime: input.start,
    endTime: input.end,
    hours: slots,
    freeForRange,
  };
}

export async function courtWeekFor(viewer: CourtViewer, courtId: string, weekInput?: string) {
  const court = await prisma.court.findFirst({ where: { id: courtId, deletedAt: null } });
  if (!court) throw notFound("Kort bulunamadı");
  if (!court.active && viewer.role !== "ADMIN") throw notFound("Kort bulunamadı");
  const board = await boardFor(viewer, weekInput, [court.id]);
  return {
    court: presentCourt(court),
    weekStart: board.weekStart,
    weekEnd: board.weekEnd,
    hours: board.hours,
    days: board.days,
    checkInLeadHours: board.checkInLeadHours,
    viewer: board.viewer,
    slots: board.slots.map((slot) => {
      const cell = slot.courts.find((item) => item.id === court.id);
      return {
        date: slot.date,
        weekday: slot.weekday,
        startTime: slot.startTime,
        endTime: slot.endTime,
        state: cell?.state ?? "free",
        reservation: cell?.state === "reserved" ? cell.reservation : null,
      };
    }),
  };
}

export async function dayGridFor(viewer: CourtViewer, dateInput?: string) {
  const date = dateInput ?? istanbulNowParts().day;
  const weekday = weekdayOfDate(date);
  const known = WEEKDAYS.find((day) => day.value === weekday);
  const showAll = viewer.role === "ADMIN";
  const [courts, reservations, lead] = await Promise.all([
    prisma.court.findMany({
      where: { deletedAt: null, ...(showAll ? {} : { active: true }) },
      orderBy: courtOrder,
    }),
    prisma.courtReservation.findMany({
      where: {
        deletedAt: null,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: parseDateOnly(date) },
        endDate: { gte: parseDateOnly(date) },
      },
      include: {
        holder: { select: personSelect },
        partner: { select: personSelect },
        checkIns: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    getCheckInLeadHours(),
  ]);

  const now = new Date();
  const cells = courts.flatMap((court) =>
    COURT_HOURS.map((startTime) => {
      const covering = reservations.filter((row) => row.courtId === court.id && slotCoveredBySpan(date, startTime, spanFromRow(row)));
      const row = covering.find((item) => item.status === "APPROVED") ?? covering[0];
      if (!row) {
        return {
          courtId: court.id,
          startTime,
          endTime: slotEnd(startTime),
          state: "free" as const,
          reservation: null,
        };
      }
      const approved = row.status === "APPROVED";
      const slotStart = slotStartInstant(date, startTime);
      const checkedIn = approved && row.checkIns.some((item) => dateOnly(item.date) === date && item.startTime === startTime);
      const windowError = checkInWindowError(now, slotStart, lead);
      const allowed = approved && canCheckInUser(viewer.id, row);
      const already = row.checkIns.some((item) => dateOnly(item.date) === date && item.startTime === startTime && item.userId === viewer.id);
      return {
        courtId: court.id,
        startTime,
        endTime: slotEnd(startTime),
        state: "busy" as const,
        reservation: {
          id: row.id,
          status: row.status,
          statusLabel: approved ? "onaylı" : "beklemede",
          purpose: row.purpose,
          purposeLabel: COURT_PURPOSE_LABELS[row.purpose],
          checkedIn,
          canCheckIn: allowed && !already && !windowError,
          checkInHint: allowed && !already ? windowError : null,
          players: namesFor(viewer, row),
        },
      };
    }),
  );

  return {
    date,
    weekday,
    label: known?.label ?? "",
    short: known?.short ?? "",
    hours: COURT_HOURS,
    courts: courts.map(presentCourt),
    viewer: {
      canApprove: viewer.role === "ADMIN",
      purposes: purposesForRole(viewer.role),
    },
    cells,
  };
}

async function peopleIdsAt(date: string, startTime: string): Promise<Set<string>> {
  const board = await boardFor({ id: "system", role: "ADMIN" }, date);
  const slot = board.slots.find((item) => item.date === date && item.startTime === startTime);
  return new Set(slot?.people.map((person) => person.id) ?? []);
}

const offerInclude = {
  fromUser: { select: personSelect },
  toUser: { select: personSelect },
} satisfies Prisma.SlotOfferInclude;

function presentOffer(row: Prisma.SlotOfferGetPayload<{ include: typeof offerInclude }>, viewerId: string) {
  return {
    id: row.id,
    date: dateOnly(row.date),
    startTime: row.startTime,
    status: row.status,
    from: toPerson(row.fromUser),
    to: toPerson(row.toUser),
    canRespond: row.status === "PENDING" && row.toUserId === viewerId,
  };
}

export async function createSlotOffer(viewer: CourtViewer, input: { toUserId: string; date: string; startTime: string }) {
  if (input.toUserId === viewer.id) throw new AppError(400, "VALIDATION_ERROR", "Kendine maç teklif edemezsin");
  if (!COURT_HOURS.includes(input.startTime)) throw new AppError(400, "VALIDATION_ERROR", "Saat kort aralığında olmalı");
  const people = await peopleIdsAt(input.date, input.startTime);
  if (!people.has(viewer.id) || !people.has(input.toUserId)) {
    throw new AppError(409, "CONFLICT", "Bu saatte ikiniz de müsait listesinde değilsiniz");
  }
  const existing = await prisma.slotOffer.findFirst({
    where: {
      fromUserId: viewer.id,
      toUserId: input.toUserId,
      date: parseDateOnly(input.date),
      startTime: input.startTime,
      status: "PENDING",
    },
  });
  if (existing) throw new AppError(409, "CONFLICT", "Bu saate zaten teklif gönderdin");
  const offer = await prisma.slotOffer.create({
    data: {
      fromUserId: viewer.id,
      toUserId: input.toUserId,
      date: parseDateOnly(input.date),
      startTime: input.startTime,
      status: "PENDING",
    },
    include: offerInclude,
  });
  await notify({
    userId: input.toUserId,
    type: "SYSTEM",
    title: "Kort için maç teklifi",
    body: `${offer.fromUser.profile?.firstName ?? ""} ${input.date} ${input.startTime} için maç teklif etti.`.trim(),
    link: `/takvim?date=${input.date}&start=${input.startTime}`,
  });
  return presentOffer(offer, viewer.id);
}

export async function listSlotOffers(viewer: CourtViewer, scope: "incoming" | "outgoing") {
  const rows = await prisma.slotOffer.findMany({
    where: scope === "incoming" ? { toUserId: viewer.id, status: "PENDING" } : { fromUserId: viewer.id },
    include: offerInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return { data: rows.map((row) => presentOffer(row, viewer.id)) };
}

export async function declineSlotOffer(viewer: CourtViewer, id: string) {
  const offer = await prisma.slotOffer.findUnique({ where: { id }, include: offerInclude });
  if (!offer) throw notFound("Teklif bulunamadı");
  if (offer.toUserId !== viewer.id) throw forbidden("Bu teklifi yalnızca alıcısı reddeder");
  if (offer.status !== "PENDING") throw new AppError(409, "CONFLICT", "Bu teklif artık yanıtlanamaz");
  const updated = await prisma.slotOffer.update({ where: { id }, data: { status: "DECLINED" }, include: offerInclude });
  return presentOffer(updated, viewer.id);
}

export async function acceptSlotOffer(viewer: CourtViewer, id: string) {
  const offer = await prisma.slotOffer.findUnique({ where: { id } });
  if (!offer) throw notFound("Teklif bulunamadı");
  if (offer.toUserId !== viewer.id) throw forbidden("Bu teklifi yalnızca alıcısı kabul eder");
  if (offer.status !== "PENDING") throw new AppError(409, "CONFLICT", "Bu teklif artık yanıtlanamaz");
  const date = dateOnly(offer.date);
  if (!date) throw new AppError(400, "VALIDATION_ERROR", "Tarih eksik");
  const people = await peopleIdsAt(date, offer.startTime);
  if (!people.has(offer.fromUserId) || !people.has(offer.toUserId)) {
    throw new AppError(409, "CONFLICT", "Bu saatte ikiniz de müsait listesinde değilsiniz");
  }
  const endTime = slotEnd(offer.startTime);
  const weekday = weekdayOfDate(date);
  const span: Span = { startDate: date, endDate: date, weekdays: [weekday], startTime: offer.startTime, endTime };

  const booked = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SlotOffer" WHERE id = ${id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Court" WHERE active = true AND "deletedAt" IS NULL FOR UPDATE`;
    const fresh = await tx.slotOffer.findUnique({ where: { id } });
    if (!fresh || fresh.status !== "PENDING") throw new AppError(409, "CONFLICT", "Bu teklif artık yanıtlanamaz");
    const courts = await tx.court.findMany({ where: { active: true, deletedAt: null }, orderBy: courtOrder });
    let free: { id: string; name: string } | null = null;
    for (const court of courts) {
      const rows = await tx.courtReservation.findMany({
        where: {
          courtId: court.id,
          deletedAt: null,
          status: { in: ["PENDING", "APPROVED"] },
          startDate: { lte: parseDateOnly(date) },
          endDate: { gte: parseDateOnly(date) },
        },
      });
      const blocked = rows.some((row) => spansOverlap(span, spanFromRow(row)));
      if (!blocked) {
        free = court;
        break;
      }
    }
    if (!free) throw new AppError(409, "CONFLICT", "Bu saatte boş kort yok");
    const match = await tx.match.create({
      data: {
        format: "SINGLE",
        scheduledAt: combineIstanbul(date, offer.startTime),
        court: free.name,
        status: "SCHEDULED",
        createdById: viewer.id,
        players: {
          create: [
            { userId: offer.fromUserId, side: "A" },
            { userId: offer.toUserId, side: "B" },
          ],
        },
      },
    });
    const reservation = await tx.courtReservation.create({
      data: {
        courtId: free.id,
        purpose: "MATCH",
        status: "APPROVED",
        startDate: parseDateOnly(date),
        endDate: parseDateOnly(date),
        weekdays: [weekday],
        startTime: offer.startTime,
        endTime,
        holderId: offer.fromUserId,
        partnerId: offer.toUserId,
        createdById: viewer.id,
        decidedById: viewer.id,
        decidedAt: new Date(),
        matchId: match.id,
      },
    });
    await tx.slotOffer.update({ where: { id }, data: { status: "ACCEPTED", reservationId: reservation.id } });
    return { reservationId: reservation.id, courtId: free.id, courtName: free.name, matchId: match.id };
  });

  await notify({
    userId: offer.fromUserId,
    type: "SYSTEM",
    title: "Maç teklifi kabul edildi",
    body: `${date} ${offer.startTime} için ${booked.courtName} ayrıldı.`,
    link: `/takvim?date=${date}&start=${offer.startTime}`,
  });
  return { offerId: id, ...booked };
}
