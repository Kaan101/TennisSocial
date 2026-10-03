import type { CourtKind, CourtPurpose, OverallLevel, PersonProfile, Role, Visibility } from "@club/shared";
import { COURT_KIND_LABELS, COURT_PURPOSE_LABELS, LEVEL_LABELS, PERSON_PROFILE_LABELS, WEEKDAYS, istanbulNowParts, levelIndex, purposesForRole } from "@club/shared";
import type { Prisma } from "@prisma/client";
import { combineIstanbul, dateOnly, parseDateOnly } from "../../lib/dates";
import { AppError, forbidden, notFound } from "../../lib/errors";
import { canViewField, isPlayableStatus } from "../../lib/privacy";
import { prisma } from "../../lib/prisma";
import { CLOSED_HOUR_NOTE } from "../availability-calendar";
import { notify } from "../notify";
import {
  CHECK_IN_LEAD_KEY,
  COURT_CLOSE,
  COURT_HOURS,
  COURT_OPEN,
  DEFAULT_CHECK_IN_LEAD_HOURS,
  MAX_RANGE_DAYS,
  type Span,
  hoursInRange,
  inclusiveDayCount,
  isHourRange,
  mondayOf,
  rangeHitsWeekdays,
  slotCoveredBySpan,
  clockHour,
  slotEnd,
  slotIsGreen,
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

function presentCourt(row: { id: string; clubId: string; name: string; active: boolean; kind: CourtKind; sortOrder: number }) {
  return {
    id: row.id,
    clubId: row.clubId,
    name: row.name,
    active: row.active,
    kind: row.kind,
    kindLabel: COURT_KIND_LABELS[row.kind],
    sortOrder: row.sortOrder,
  };
}

function presentClub(row: { id: string; name: string; hasRestaurant: boolean; hasFitness: boolean }) {
  return {
    id: row.id,
    name: row.name,
    hasRestaurant: row.hasRestaurant,
    hasFitness: row.hasFitness,
  };
}

function courtsOf(clubId?: string, options?: { includeInactive?: boolean; extraCourtIds?: string[] }) {
  if (!clubId) return { id: { in: [] as string[] } };
  const extraCourtIds = options?.extraCourtIds ?? [];
  return {
    deletedAt: null,
    clubId,
    ...(options?.includeInactive
      ? {}
      : { OR: [{ active: true }, ...(extraCourtIds.length > 0 ? [{ id: { in: extraCourtIds } }] : [])] }),
  };
}

export async function ensureClubCourts(_db: Db = prisma): Promise<void> {
  return;
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

function hourCheckedIn(row: { checkIns: { date: Date; startTime: string }[] }, date: string, startTime: string): boolean {
  return row.checkIns.some((item) => dateOnly(item.date) === date && item.startTime === startTime);
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

export async function listClubs() {
  const rows = await prisma.club.findMany({ orderBy: { createdAt: "asc" } });
  return { data: rows.map(presentClub) };
}

export async function createClub(input: { name: string; hasRestaurant?: boolean; hasFitness?: boolean }) {
  const club = await prisma.club.create({
    data: {
      name: input.name,
      hasRestaurant: input.hasRestaurant ?? false,
      hasFitness: input.hasFitness ?? false,
    },
  });
  return presentClub(club);
}

export async function updateClub(id: string, input: { name?: string; hasRestaurant?: boolean; hasFitness?: boolean }) {
  const club = await prisma.club.findUnique({ where: { id } });
  if (!club) throw notFound("Kulüp bulunamadı");
  const updated = await prisma.club.update({
    where: { id },
    data: {
      name: input.name,
      hasRestaurant: input.hasRestaurant,
      hasFitness: input.hasFitness,
    },
  });
  return presentClub(updated);
}

export async function listCourts(viewer: CourtViewer, includeInactive: boolean, clubId?: string) {
  const showAll = includeInactive && viewer.role === "ADMIN";
  const rows = await prisma.court.findMany({
    where: courtsOf(clubId, { includeInactive: showAll }),
    orderBy: courtOrder,
  });
  return { data: rows.map(presentCourt) };
}

export async function createCourt(viewer: CourtViewer, input: { name: string; clubId: string; kind?: CourtKind }) {
  void viewer;
  const club = await prisma.club.findUnique({ where: { id: input.clubId } });
  if (!club) throw notFound("Kulüp bulunamadı");
  const court = await prisma.court.create({
    data: { name: input.name, clubId: club.id, active: true, kind: input.kind ?? "OUTDOOR", sortOrder: 1000 },
  });
  return presentCourt(court);
}

export async function updateCourt(viewer: CourtViewer, id: string, input: { name?: string; active?: boolean; kind?: CourtKind }) {
  void viewer;
  const court = await prisma.court.findFirst({ where: { id, deletedAt: null } });
  if (!court) throw notFound("Kort bulunamadı");
  const updated = await prisma.court.update({
    where: { id },
    data: { name: input.name, active: input.active, kind: input.kind },
  });
  return presentCourt(updated);
}

export async function deleteCourt(viewer: CourtViewer, id: string) {
  void viewer;
  const court = await prisma.court.findFirst({ where: { id, deletedAt: null } });
  if (!court) throw notFound("Kort bulunamadı");
  await prisma.court.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
  return { ok: true };
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
  if (partnerId && input.purpose === "MATCH" && partnerId === viewer.id) {
    throw new AppError(400, "VALIDATION_ERROR", "Kendinle maç rezervasyonu açamazsın");
  }
  if (partnerId && input.purpose !== "MATCH") {
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

export async function cancelReservation(viewer: CourtViewer, id: string) {
  const row = await prisma.courtReservation.findFirst({ where: { id, deletedAt: null } });
  if (!row) throw notFound("Rezervasyon bulunamadı");
  if (row.status === "REJECTED") throw new AppError(409, "CONFLICT", "Bu rezervasyon zaten iptal");
  const allowed = viewer.role === "ADMIN" || viewer.id === row.holderId || viewer.id === row.partnerId;
  if (!allowed) throw forbidden("Bu rezervasyonu iptal edemezsin");
  const updated = await prisma.courtReservation.update({
    where: { id },
    data: { status: "REJECTED", decidedById: viewer.id, decidedAt: new Date() },
    include: reservationInclude,
  });
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
  profile: { firstName: string; lastName: string; playerStatus: string; photoUrl: string | null; phone: string | null; whatsapp: string | null } | null;
  privacy: { phoneVisibility: Visibility; whatsappVisibility: Visibility } | null;
  tennisProfile: { overallLevel: OverallLevel } | null;
  availability: {
    kind: "WEEKLY" | "ONE_OFF";
    weekday: number | null;
    date: Date | null;
    startTime: string;
    endTime: string;
    state: "FULL" | "MAYBE" | "BUSY";
    note: string | null;
    deletedAt: Date | null;
    updatedAt: Date;
  }[];
  absences: { startDate: Date; endDate: Date }[];
};

function markedOpen(state: "FULL" | "MAYBE" | "BUSY"): boolean {
  return state === "FULL" || state === "MAYBE";
}


function messageNumberFor(viewer: CourtViewer, user: BoardUser, friendIds: Set<string>): string | null {
  const profile = user.profile;
  if (!profile) return null;
  const gate = { id: viewer.id, role: viewer.role, email: "" };
  const friend = friendIds.has(user.id);
  const phoneAllowed = canViewField(user.privacy?.phoneVisibility ?? "MEMBERS", gate, user.id, friend).allowed;
  const whatsappAllowed = canViewField(user.privacy?.whatsappVisibility ?? "MEMBERS", gate, user.id, friend).allowed;
  const phone = phoneAllowed && profile.phone ? profile.phone : null;
  const whatsapp = whatsappAllowed && profile.whatsapp ? profile.whatsapp : null;
  if (phone) return whatsapp ?? phone;
  return whatsapp;
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

function courtPurposeTakesCourt(purpose: CourtPurpose): boolean {
  return purpose === "MATCH" || purpose === "TRAINING" || purpose === "TOURNAMENT" || purpose === "MAINTENANCE";
}

const courtHourSet = new Set(COURT_HOURS);

function coveredHours(span: Span, date: string): string[] {
  if (date < span.startDate || date > span.endDate) return [];
  if (!span.weekdays.includes(weekdayOfDate(date))) return [];
  return hoursInRange(span.startTime, span.endTime).filter((hour) => courtHourSet.has(hour));
}

function indexSpans<T extends { startDate: Date; endDate: Date; weekdays: number[]; startTime: string; endTime: string }>(
  rows: T[],
  dates: string[],
  keyFor: (row: T, date: string, hour: string) => string,
): Map<string, T[]> {
  const bucket = new Map<string, T[]>();
  for (const row of rows) {
    const span = spanFromRow(row);
    for (const date of dates) {
      for (const hour of coveredHours(span, date)) {
        const key = keyFor(row, date, hour);
        const list = bucket.get(key);
        if (list) list.push(row);
        else bucket.set(key, [row]);
      }
    }
  }
  return bucket;
}

function slotOpen(oneOffs: BoardUser["availability"], weekly: BoardUser["availability"], startTime: string): boolean {
  const endTime = slotEnd(startTime);
  const overlaps = (window: BoardUser["availability"][number]) => timesOverlap(clockHour(window.startTime), clockHour(window.endTime), startTime, endTime);
  const exactHour = (window: BoardUser["availability"][number]) => clockHour(window.startTime) === startTime && clockHour(window.endTime) === endTime;
  const live = oneOffs.filter((window) => window.deletedAt == null);
  const covering = live.filter(overlaps);
  const exact = covering.filter(exactHour);
  if (exact.length > 0) {
    if (exact.some((window) => window.note !== CLOSED_HOUR_NOTE && markedOpen(window.state))) return true;
    if (exact.some((window) => window.note === CLOSED_HOUR_NOTE)) return false;
    return exact.some((window) => markedOpen(window.state));
  }
  if (covering.length > 0) return covering.some((window) => markedOpen(window.state));
  const cleared = oneOffs.filter((window) => window.deletedAt != null && exactHour(window));
  if (cleared.length > 0) {
    const clearedAt = Math.max(...cleared.map((window) => window.updatedAt.getTime()));
    const weeklyAt = weekly.filter(overlaps).reduce((latest, window) => Math.max(latest, window.updatedAt.getTime()), 0);
    if (clearedAt > weeklyAt) return false;
  }
  return weekly.some((window) => overlaps(window) && markedOpen(window.state));
}

function openUsersBySlot(users: BoardUser[], days: { date: string; weekday: number }[]): Map<string, BoardUser[]> {
  const ranked = users
    .filter((user) => user.profile && isPlayableStatus(user.profile.playerStatus))
    .sort((left, right) => (left.profile?.lastName ?? "").localeCompare(right.profile?.lastName ?? "", "tr"));
  const bucket = new Map<string, BoardUser[]>();
  for (const user of ranked) {
    const absences = user.absences.flatMap((absence) => {
      const start = dateOnly(absence.startDate);
      const end = dateOnly(absence.endDate);
      return start && end ? [{ start, end }] : [];
    });
    const oneOffByDate = new Map<string, BoardUser["availability"]>();
    const weeklyByDay = new Map<number, BoardUser["availability"]>();
    for (const window of user.availability) {
      if (window.kind === "ONE_OFF") {
        const markDate = dateOnly(window.date);
        if (!markDate) continue;
        const list = oneOffByDate.get(markDate);
        if (list) list.push(window);
        else oneOffByDate.set(markDate, [window]);
      } else if (window.deletedAt == null && window.weekday !== null) {
        const list = weeklyByDay.get(window.weekday);
        if (list) list.push(window);
        else weeklyByDay.set(window.weekday, [window]);
      }
    }
    for (const { date, weekday } of days) {
      if (absences.some((absence) => date >= absence.start && date <= absence.end)) continue;
      const oneOffs = oneOffByDate.get(date) ?? [];
      const weekly = weeklyByDay.get(weekday) ?? [];
      for (const startTime of COURT_HOURS) {
        if (!slotOpen(oneOffs, weekly, startTime)) continue;
        const key = `${date}|${startTime}`;
        const list = bucket.get(key);
        if (list) list.push(user);
        else bucket.set(key, [user]);
      }
    }
  }
  return bucket;
}

export async function boardFor(viewer: CourtViewer, weekInput?: string, extraCourtIds: string[] = [], clubId?: string, dropBooked = false) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const weekStart = mondayOf(weekInput ?? today);
  const dates = weekDates(weekStart);
  const weekEnd = dates[6]!;
  const weekDate = { gte: parseDateOnly(weekStart), lte: parseDateOnly(weekEnd) };
  const courts = await prisma.court.findMany({
    where: courtsOf(clubId, { extraCourtIds }),
    orderBy: courtOrder,
  });
  const [users, reservations, lead, me, friendRows] = await Promise.all([
    prisma.user.findMany({
      where: {
        deletedAt: null,
        profile: { is: { deletedAt: null } },
        OR: [{ boardVisible: true }, { id: viewer.id }],
      },
      select: {
        id: true,
        boardVisible: true,
        profile: { select: { firstName: true, lastName: true, playerStatus: true, photoUrl: true, phone: true, whatsapp: true } },
        privacy: { select: { phoneVisibility: true, whatsappVisibility: true } },
        tennisProfile: { select: { overallLevel: true } },
        availability: {
          where: {
            OR: [
              { deletedAt: null, kind: "WEEKLY" },
              { kind: "ONE_OFF", date: weekDate },
            ],
          },
          select: { kind: true, weekday: true, date: true, startTime: true, endTime: true, state: true, note: true, deletedAt: true, updatedAt: true },
        },
        absences: { where: { deletedAt: null }, select: { startDate: true, endDate: true } },
      },
    }),
    prisma.courtReservation.findMany({
      where: {
        ...(clubId ? { courtId: { in: courts.map((court) => court.id) } } : {}),
        deletedAt: null,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: weekDate.lte },
        endDate: { gte: weekDate.gte },
      },
      include: {
        holder: { select: personSelect },
        partner: { select: personSelect },
        checkIns: { where: { date: weekDate } },
      },
    }),
    getCheckInLeadHours(),
    prisma.user.findUnique({ where: { id: viewer.id }, select: { boardVisible: true } }),
    prisma.friendship.findMany({
      where: { status: "ACCEPTED", OR: [{ requesterId: viewer.id }, { addresseeId: viewer.id }] },
      select: { requesterId: true, addresseeId: true },
    }),
  ]);
  const friendIds = new Set(friendRows.map((row) => (row.requesterId === viewer.id ? row.addresseeId : row.requesterId)));

  const dayMeta = dates.map((date) => ({ date, weekday: weekdayOfDate(date) }));
  const coveringBySlot = indexSpans(reservations, dates, (_row, date, hour) => `${date}|${hour}`);
  const openBySlot = openUsersBySlot(users as BoardUser[], dayMeta);
  const slots = dayMeta.flatMap(({ date, weekday }) =>
    COURT_HOURS.map((startTime) => {
      const key = `${date}|${startTime}`;
      const covering = coveringBySlot.get(key) ?? [];
      const approvedCovering = covering.filter((row) => row.status === "APPROVED");
      const busy = new Set(approvedCovering.flatMap((row) => playingIds(row)));
      const people = (openBySlot.get(key) ?? [])
        .filter((user) => !dropBooked || !busy.has(user.id))
        .map((user) => {
          const level = user.tennisProfile?.overallLevel ?? "INTERMEDIATE";
          return {
            id: user.id,
            firstName: user.profile?.firstName ?? "",
            lastName: user.profile?.lastName ?? "",
            photoUrl: user.profile?.photoUrl ?? null,
            messageNumber: messageNumberFor(viewer, user, friendIds),
            overallLevel: level,
            levelLabel: LEVEL_LABELS[level],
            levelIndex: levelIndex(level),
          };
        });
      return {
        date,
        weekday,
        startTime,
        endTime: slotEnd(startTime),
        green: slotIsGreen(people.map((person) => person.levelIndex)),
        people: people.map(({ levelIndex: _levelIndex, ...person }) => person),
        courts: courts.map((court) => {
          const identity = { id: court.id, name: court.name, kind: court.kind, kindLabel: COURT_KIND_LABELS[court.kind] };
          const rows = covering.filter((item) => item.courtId === court.id && courtPurposeTakesCourt(item.purpose));
          const row = rows.find((item) => item.status === "APPROVED") ?? rows[0];
          if (!row) return { ...identity, state: "free" as const, reservation: null };
          const approved = row.status === "APPROVED";
          const checkedIn = approved && hourCheckedIn(row, date, startTime);
          const allowed = approved && canCheckInUser(viewer.id, row);
          const already = approved && row.checkIns.some((item) => dateOnly(item.date) === date && item.startTime === startTime && item.userId === viewer.id);
          return {
            ...identity,
            state: "reserved" as const,
            reservation: {
              id: row.id,
              purpose: row.purpose,
              purposeLabel: COURT_PURPOSE_LABELS[row.purpose],
              checkedIn,
              canCheckIn: allowed && !already,
              checkInHint: null,
              players: namesFor(viewer, row),
            },
          };
        }),
      };
    }),
  );

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

export async function rangeFor(viewer: CourtViewer, input: { date: string; start: string; end: string; club?: string }) {
  if (!isHourRange(input.start, input.end)) {
    throw new AppError(400, "VALIDATION_ERROR", "Saat aralığı aynı gün içinde 08:00 ile 23:00 arasında olmalı");
  }
  const board = await boardFor(viewer, input.date, [], input.club);
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
  const board = await boardFor(viewer, weekInput, [court.id], court.clubId);
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

export type SlotParticipantView = {
  kind: "PERSON" | "GROUP";
  id: string;
  name: string;
  typeLabel: string;
  photoUrl: string | null;
};

type NamedPerson = {
  id: string;
  profile: { firstName: string; lastName: string; personProfile: PersonProfile; photoUrl: string | null } | null;
};

function personTypeLabel(profile: NamedPerson["profile"]): string {
  if (!profile) return "Oyuncu";
  return PERSON_PROFILE_LABELS[profile.personProfile];
}

function personName(profile: NamedPerson["profile"]): string {
  return `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim();
}

function byTurkishName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, "tr", { sensitivity: "base" }));
}

export function presentSlotParticipants(people: NamedPerson[], groups: { id: string; name: string }[]): SlotParticipantView[] {
  const groupRows = byTurkishName(
    groups.map((group) => ({ kind: "GROUP" as const, id: group.id, name: group.name, typeLabel: "Grup", photoUrl: null })),
  );
  const personRows = byTurkishName(
    people.map((person) => ({
      kind: "PERSON" as const,
      id: person.id,
      name: personName(person.profile),
      typeLabel: personTypeLabel(person.profile),
      photoUrl: person.profile?.photoUrl ?? null,
    })),
  );
  return [...groupRows, ...personRows];
}

export async function participantOptions(_viewer: CourtViewer) {
  const [users, groups] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, profile: { isNot: null } },
      select: { id: true, profile: { select: { firstName: true, lastName: true, personProfile: true, photoUrl: true } } },
    }),
    prisma.group.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    }),
  ]);
  const people = byTurkishName(
    users.flatMap((user) => {
      if (!user.profile) return [];
      return [{ id: user.id, name: personName(user.profile), typeLabel: personTypeLabel(user.profile), photoUrl: user.profile.photoUrl }];
    }),
  );
  return {
    groups: byTurkishName(groups.map((group) => ({ id: group.id, name: group.name, typeLabel: "Grup" }))),
    people,
  };
}

export async function saveSlotParticipants(
  _viewer: CourtViewer,
  input: { courtId: string; date: string; startTime: string; userIds: string[]; groupIds: string[] },
) {
  if (!courtHourSet.has(input.startTime)) throw new AppError(400, "VALIDATION_ERROR", "Saat kort aralığında olmalı");
  const court = await prisma.court.findFirst({ where: { id: input.courtId, deletedAt: null } });
  if (!court) throw notFound("Kort bulunamadı");
  const userIds = [...new Set(input.userIds)];
  const groupIds = [...new Set(input.groupIds)];
  const [users, groups] = await Promise.all([
    userIds.length === 0
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: { id: { in: userIds }, deletedAt: null },
          select: { id: true, profile: { select: { firstName: true, lastName: true, personProfile: true, photoUrl: true } } },
        }),
    groupIds.length === 0
      ? Promise.resolve([])
      : prisma.group.findMany({
          where: { id: { in: groupIds }, deletedAt: null },
          select: { id: true, name: true },
        }),
  ]);
  if (users.length !== userIds.length) throw new AppError(400, "VALIDATION_ERROR", "Katılımcı bulunamadı");
  if (groups.length !== groupIds.length) throw new AppError(400, "VALIDATION_ERROR", "Grup bulunamadı");
  const date = parseDateOnly(input.date);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Court" WHERE id = ${court.id} FOR UPDATE`;
    await tx.courtSlotPerson.deleteMany({ where: { courtId: court.id, date, startTime: input.startTime } });
    await tx.courtSlotGroup.deleteMany({ where: { courtId: court.id, date, startTime: input.startTime } });
    if (userIds.length > 0) {
      await tx.courtSlotPerson.createMany({
        data: userIds.map((userId) => ({ courtId: court.id, date, startTime: input.startTime, userId })),
      });
    }
    if (groupIds.length > 0) {
      await tx.courtSlotGroup.createMany({
        data: groupIds.map((groupId) => ({ courtId: court.id, date, startTime: input.startTime, groupId })),
      });
    }
  });
  return {
    courtId: court.id,
    date: input.date,
    startTime: input.startTime,
    participants: presentSlotParticipants(users, groups),
  };
}

export async function dayGridFor(viewer: CourtViewer, dateInput?: string, clubId?: string) {
  const date = dateInput ?? istanbulNowParts().day;
  const weekday = weekdayOfDate(date);
  const known = WEEKDAYS.find((day) => day.value === weekday);
  const showAll = viewer.role === "ADMIN";
  const dayDate = parseDateOnly(date);
  const courts = await prisma.court.findMany({
    where: courtsOf(clubId, { includeInactive: showAll }),
    orderBy: courtOrder,
  });
  const reservations = await prisma.courtReservation.findMany({
    where: {
      courtId: { in: courts.map((court) => court.id) },
      deletedAt: null,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: dayDate },
      endDate: { gte: dayDate },
    },
    include: {
      holder: { select: personSelect },
      partner: { select: personSelect },
      checkIns: { where: { date: dayDate } },
    },
    orderBy: { createdAt: "asc" },
  });

  const bySlot = indexSpans(reservations, [date], (row, _day, hour) => `${row.courtId}|${hour}`);
  const courtIds = courts.map((court) => court.id);
  const [slotPeople, slotGroups] = await Promise.all([
    prisma.courtSlotPerson.findMany({
      where: { courtId: { in: courtIds }, date: dayDate },
      select: {
        courtId: true,
        startTime: true,
        user: { select: { id: true, deletedAt: true, profile: { select: { firstName: true, lastName: true, personProfile: true, photoUrl: true } } } },
      },
    }),
    prisma.courtSlotGroup.findMany({
      where: { courtId: { in: courtIds }, date: dayDate },
      select: {
        courtId: true,
        startTime: true,
        group: { select: { id: true, name: true, deletedAt: true } },
      },
    }),
  ]);
  const participantsBySlot = new Map<string, { people: NamedPerson[]; groups: { id: string; name: string }[] }>();
  const slotBucket = (key: string) => {
    const found = participantsBySlot.get(key);
    if (found) return found;
    const next = { people: [] as NamedPerson[], groups: [] as { id: string; name: string }[] };
    participantsBySlot.set(key, next);
    return next;
  };
  for (const row of slotPeople) {
    if (row.user.deletedAt) continue;
    slotBucket(`${row.courtId}|${row.startTime}`).people.push(row.user);
  }
  for (const row of slotGroups) {
    if (row.group.deletedAt) continue;
    slotBucket(`${row.courtId}|${row.startTime}`).groups.push(row.group);
  }
  const cells = courts.flatMap((court) =>
    COURT_HOURS.map((startTime) => {
      const saved = participantsBySlot.get(`${court.id}|${startTime}`);
      const participants = saved ? presentSlotParticipants(saved.people, saved.groups) : [];
      const covering = bySlot.get(`${court.id}|${startTime}`) ?? [];
      const row = covering.find((item) => item.status === "APPROVED") ?? covering[0];
      if (!row) {
        return {
          courtId: court.id,
          startTime,
          endTime: slotEnd(startTime),
          state: "free" as const,
          reservation: null,
          participants,
        };
      }
      const approved = row.status === "APPROVED";
      const checkedIn = approved && hourCheckedIn(row, date, startTime);
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
          canCheckIn: allowed && !already,
          checkInHint: null,
          players: namesFor(viewer, row),
        },
        participants,
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

export async function slotAt(_viewer: CourtViewer, date: string, courtId: string, hour: string) {
  if (!courtHourSet.has(hour)) throw new AppError(400, "VALIDATION_ERROR", "Saat kort aralığında olmalı");
  const rows = await prisma.courtReservation.findMany({
    where: {
      courtId,
      deletedAt: null,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: parseDateOnly(date) },
      endDate: { gte: parseDateOnly(date) },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      purpose: true,
      status: true,
      startDate: true,
      endDate: true,
      weekdays: true,
      startTime: true,
      endTime: true,
      checkIns: { where: { date: parseDateOnly(date), startTime: hour }, select: { startTime: true } },
    },
  });
  const covering = rows.filter((row) => slotCoveredBySpan(date, hour, spanFromRow(row)));
  const row = covering.find((item) => item.status === "APPROVED") ?? covering[0];
  if (!row) return { reservation: null };
  return {
    reservation: {
      id: row.id,
      purpose: row.purpose,
      checkedIn: row.status === "APPROVED" && row.checkIns.length > 0,
    },
  };
}

async function peopleIdsAt(date: string, startTime: string): Promise<Set<string>> {
  const board = await boardFor({ id: "system", role: "ADMIN" }, date, [], undefined, true);
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
