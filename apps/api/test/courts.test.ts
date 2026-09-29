import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { CLUB_COURTS, istanbulNowParts } from "@club/shared";
import { prisma } from "../src/lib/prisma";
import { ensureClubCourts } from "../src/services/courts/service";
import { addDays, checkInWindowError, hoursInRange, slotIsGreen, slotStartInstant, spansOverlap, weekdayOfDate, COURT_HOURS } from "../src/services/courts/rules";
import { auth, makeApp, registerUser } from "./helpers";

let app: FastifyInstance;

beforeAll(async () => {
  app = await makeApp();
});

afterAll(async () => {
  await app.close();
});

const MONDAY = "2026-10-05";

test("18:00–21:00 is the three slots 18, 19, and 20", () => {
  expect(hoursInRange("18:00", "21:00")).toEqual(["18:00", "19:00", "20:00"]);
  expect(hoursInRange("22:00", "23:00")).toEqual(["22:00"]);
  expect(hoursInRange("18:00", "18:00")).toEqual([]);
});

test("the migration inserts Kapalı 1–3 and Kort 1–9 and the seed does not recreate Kort 1–3", () => {
  const sql = readFileSync(fileURLToPath(new URL("../prisma/migrations/20260929160000_club_courts/migration.sql", import.meta.url)), "utf8");
  const seed = readFileSync(fileURLToPath(new URL("../prisma/seed.ts", import.meta.url)), "utf8");
  for (const court of CLUB_COURTS) expect(sql).toContain(`'${court.name}'`);
  expect(sql).toContain("'BALLOON'");
  expect(sql).not.toContain("açık");
  expect(seed).not.toContain('["Kort 1", "Kort 2", "Kort 3"]');
});

test("green rule counts only a visible pair within one level", () => {
  expect(slotIsGreen([0, 1])).toBe(true);
  expect(slotIsGreen([0, 2])).toBe(false);
  expect(slotIsGreen([0])).toBe(false);
  expect(slotIsGreen([0, 1, 4])).toBe(true);
});

test("check-in stays closed until the lead window and ends at the slot start", () => {
  const start = slotStartInstant("2026-10-05", "18:00");
  expect(checkInWindowError(new Date(start.getTime() - 4 * 60 * 60 * 1000), start, 3)).toMatch(/henüz açık değil/);
  expect(checkInWindowError(new Date(start.getTime() - 2 * 60 * 60 * 1000), start, 3)).toBeNull();
  expect(checkInWindowError(start, start, 3)).toMatch(/doldu/);
});

test("spans overlap only when a shared weekday exists in both ranges", () => {
  const mondayEvening = { startDate: MONDAY, endDate: MONDAY, weekdays: [1], startTime: "18:00", endTime: "19:00" };
  const mondayYear = { startDate: "2026-01-01", endDate: "2026-12-31", weekdays: [1], startTime: "18:00", endTime: "20:00" };
  const tuesday = { ...mondayEvening, weekdays: [2], startDate: "2026-10-06", endDate: "2026-10-06" };
  expect(spansOverlap(mondayEvening, mondayYear)).toBe(true);
  expect(spansOverlap(tuesday, mondayYear)).toBe(false);
});

async function setLevel(token: string, userId: string, overallLevel: string) {
  const res = await app.inject({
    method: "PUT",
    url: `/api/users/${userId}/tennis-profile`,
    headers: auth(token),
    payload: { overallLevel },
  });
  expect(res.statusCode).toBe(200);
}

async function setMondayHour(token: string, userId: string) {
  const res = await app.inject({
    method: "PUT",
    url: `/api/users/${userId}/availability`,
    headers: auth(token),
    payload: { weekly: [{ weekday: 1, startTime: "18:00", endTime: "19:00" }], oneOff: [] },
  });
  expect(res.statusCode).toBe(200);
}

async function player(firstName: string, level: string) {
  const user = await registerUser(app, { firstName, lastName: "Kort" });
  await setLevel(user.token, user.user.id, level);
  await setMondayHour(user.token, user.user.id);
  return user;
}

async function mondaySlot(token: string) {
  const res = await app.inject({
    method: "GET",
    url: `/api/courts/board?week=${MONDAY}`,
    headers: auth(token),
  });
  expect(res.statusCode).toBe(200);
  const slot = res.json().slots.find((item: { date: string; startTime: string }) => item.date === MONDAY && item.startTime === "18:00");
  expect(slot).toBeTruthy();
  return slot as {
    green: boolean;
    people: { id: string }[];
    courts: { name: string; state: string; reservation: { purposeLabel: string; checkedIn: boolean; players: { id: string }[] | null } | null }[];
  };
}

test("two visible players within one level turn the slot green", async () => {
  const viewer = await registerUser(app);
  const first = await player("Yakin", "BEGINNER");
  const second = await player("Es", "BEGINNER_PLUS");
  const slot = await mondaySlot(viewer.token);
  expect(slot.green).toBe(true);
  expect(slot.people.map((person) => person.id).sort()).toEqual([first.user.id, second.user.id].sort());
});

test("a pair two levels apart does not turn the slot green", async () => {
  const viewer = await registerUser(app);
  await player("Uzak", "BEGINNER");
  await player("Rakip", "INTERMEDIATE");
  const slot = await mondaySlot(viewer.token);
  expect(slot.green).toBe(false);
  expect(slot.people).toHaveLength(2);
});

test("a hidden player does not count toward the green rule", async () => {
  const viewer = await registerUser(app);
  const hidden = await player("Gizli", "BEGINNER");
  await player("Acik", "BEGINNER");
  const hide = await app.inject({
    method: "PATCH",
    url: "/api/me/board-visibility",
    headers: auth(hidden.token),
    payload: { visible: false },
  });
  expect(hide.statusCode).toBe(200);
  const slot = await mondaySlot(viewer.token);
  expect(slot.green).toBe(false);
  expect(slot.people.map((person) => person.id)).not.toContain(hidden.user.id);
});

test("three players are green when only one pair is within one level", async () => {
  const viewer = await registerUser(app);
  await player("Bir", "BEGINNER");
  await player("Iki", "BEGINNER_PLUS");
  await player("Uc", "ADVANCED");
  const slot = await mondaySlot(viewer.token);
  expect(slot.green).toBe(true);
  expect(slot.people).toHaveLength(3);
});

async function asAdmin() {
  const admin = await registerUser(app, { firstName: "Yonetici", lastName: "Kort" });
  await prisma.user.update({ where: { id: admin.user.id }, data: { role: "ADMIN" } });
  return admin;
}

async function addCourt(token: string, name: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/courts",
    headers: auth(token),
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; name: string };
}

test("a pending reservation is not a booking until admin approves, and overlap is rejected", async () => {
  const admin = await asAdmin();
  const member = await registerUser(app, { firstName: "Uye", lastName: "Talep" });
  const court = await addCourt(admin.token, "Kort 1");
  const body = {
    courtId: court.id,
    purpose: "TRAINING",
    startDate: MONDAY,
    endDate: MONDAY,
    weekdays: [1],
    startTime: "18:00",
    endTime: "19:00",
  };
  const pending = await app.inject({ method: "POST", url: "/api/reservations", headers: auth(member.token), payload: body });
  expect(pending.statusCode).toBe(201);
  expect(pending.json().status).toBe("PENDING");

  const before = await mondaySlot(member.token);
  expect(before.courts.find((item) => item.name === "Kort 1")?.state).toBe("free");

  const overlap = await app.inject({ method: "POST", url: "/api/reservations", headers: auth(admin.token), payload: { ...body, purpose: "MAINTENANCE" } });
  expect(overlap.statusCode).toBe(409);
  expect(overlap.json().error.message).toMatch(/çakışan/);

  const approved = await app.inject({
    method: "POST",
    url: `/api/reservations/${pending.json().id}/approve`,
    headers: auth(admin.token),
  });
  expect(approved.statusCode).toBe(200);
  expect(approved.json().status).toBe("APPROVED");

  const after = await mondaySlot(member.token);
  const reserved = after.courts.find((item) => item.name === "Kort 1");
  expect(reserved?.state).toBe("reserved");
  expect(reserved?.reservation?.purposeLabel).toBe("antrenman");
  expect(reserved?.reservation?.checkedIn).toBe(false);

  const again = await app.inject({ method: "POST", url: "/api/reservations", headers: auth(member.token), payload: body });
  expect(again.statusCode).toBe(409);

  const denied = await app.inject({
    method: "POST",
    url: `/api/reservations/${pending.json().id}/reject`,
    headers: auth(member.token),
  });
  expect(denied.statusCode).toBe(403);
});

test("check-in before the lead window is rejected and an open window succeeds", async () => {
  const admin = await asAdmin();
  const partner = await registerUser(app, { firstName: "Es", lastName: "Check" });
  const court = await addCourt(admin.token, "Kort 1");
  const early = await app.inject({
    method: "POST",
    url: "/api/reservations",
    headers: auth(admin.token),
    payload: {
      courtId: court.id,
      purpose: "MATCH",
      startDate: "2026-12-07",
      endDate: "2026-12-07",
      weekdays: [weekdayOfDate("2026-12-07")],
      startTime: "18:00",
      endTime: "19:00",
      partnerId: partner.user.id,
    },
  });
  expect(early.statusCode).toBe(201);
  expect(early.json().status).toBe("APPROVED");
  const tooSoon = await app.inject({
    method: "POST",
    url: `/api/reservations/${early.json().id}/check-in`,
    headers: auth(admin.token),
    payload: { date: "2026-12-07", startTime: "18:00" },
  });
  expect(tooSoon.statusCode).toBe(409);
  expect(tooSoon.json().error.message).toMatch(/henüz açık değil/);

  const { day } = istanbulNowParts();
  const yesterday = addDays(day, -1);
  const past = await app.inject({
    method: "POST",
    url: "/api/reservations",
    headers: auth(admin.token),
    payload: {
      courtId: court.id,
      purpose: "TRAINING",
      startDate: yesterday,
      endDate: yesterday,
      weekdays: [weekdayOfDate(yesterday)],
      startTime: "12:00",
      endTime: "13:00",
    },
  });
  expect(past.statusCode).toBe(201);
  const late = await app.inject({
    method: "POST",
    url: `/api/reservations/${past.json().id}/check-in`,
    headers: auth(admin.token),
    payload: { date: yesterday, startTime: "12:00" },
  });
  expect(late.statusCode).toBe(409);
  expect(late.json().error.message).toMatch(/doldu/);

  await prisma.systemParameter.upsert({
    where: { key: "checkInLeadHours" },
    create: { key: "checkInLeadHours", value: "72" },
    update: { value: "72" },
  });
  const open = findOpenSlot();
  const ready = await app.inject({
    method: "POST",
    url: "/api/reservations",
    headers: auth(admin.token),
    payload: {
      courtId: court.id,
      purpose: "MATCH",
      startDate: open.date,
      endDate: open.date,
      weekdays: [open.weekday],
      startTime: open.startTime,
      endTime: `${String(Number(open.startTime.slice(0, 2)) + 1).padStart(2, "0")}:00`,
      partnerId: partner.user.id,
    },
  });
  expect(ready.statusCode).toBe(201);
  const checked = await app.inject({
    method: "POST",
    url: `/api/reservations/${ready.json().id}/check-in`,
    headers: auth(partner.token),
    payload: { date: open.date, startTime: open.startTime },
  });
  expect(checked.statusCode).toBe(200);
  const stranger = await registerUser(app);
  const refused = await app.inject({
    method: "POST",
    url: `/api/reservations/${ready.json().id}/check-in`,
    headers: auth(stranger.token),
    payload: { date: open.date, startTime: open.startTime },
  });
  expect(refused.statusCode).toBe(403);
});

function findOpenSlot(): { date: string; startTime: string; weekday: number } {
  const now = Date.now();
  for (let offset = 1; offset < 72; offset += 1) {
    const instant = new Date(now + offset * 60 * 60 * 1000);
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
    const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
    const startTime = `${clock.slice(0, 2)}:00`;
    if (!COURT_HOURS.includes(startTime)) continue;
    const start = slotStartInstant(date, startTime);
    if (start.getTime() <= now) continue;
    if (start.getTime() - now >= 72 * 60 * 60 * 1000) continue;
    return { date, startTime, weekday: weekdayOfDate(date) };
  }
  throw new Error("açık check-in saati bulunamadı");
}

test("accepting a slot offer books one free court and leaves the hour open", async () => {
  const admin = await asAdmin();
  const first = await addCourt(admin.token, "Kort A");
  const second = await addCourt(admin.token, "Kort B");
  const alpha = await player("Alpha", "INTERMEDIATE");
  const beta = await player("Beta", "INTERMEDIATE");
  const gamma = await player("Gamma", "INTERMEDIATE_PLUS");
  const delta = await player("Delta", "INTERMEDIATE");
  const epsilon = await player("Epsilon", "INTERMEDIATE");
  const zeta = await player("Zeta", "INTERMEDIATE");

  const offer = await app.inject({
    method: "POST",
    url: "/api/slot-offers",
    headers: auth(alpha.token),
    payload: { toUserId: beta.user.id, date: MONDAY, startTime: "18:00" },
  });
  expect(offer.statusCode).toBe(201);
  const accepted = await app.inject({
    method: "POST",
    url: `/api/slot-offers/${offer.json().id}/accept`,
    headers: auth(beta.token),
  });
  expect(accepted.statusCode).toBe(200);
  expect(accepted.json().courtId).toBe(first.id);
  expect(accepted.json().courtName).toBe("Kort A");

  const midway = await mondaySlot(gamma.token);
  expect(midway.green).toBe(true);
  expect(midway.people.map((person) => person.id)).not.toContain(alpha.user.id);
  expect(midway.people.map((person) => person.id)).not.toContain(beta.user.id);
  expect(midway.people.map((person) => person.id)).toEqual(expect.arrayContaining([gamma.user.id, delta.user.id, epsilon.user.id, zeta.user.id]));
  const booked = midway.courts.find((court) => court.name === "Kort A");
  const free = midway.courts.find((court) => court.name === "Kort B");
  expect(booked?.state).toBe("reserved");
  expect(booked?.reservation?.purposeLabel).toBe("maç");
  expect(booked?.reservation?.players?.map((person) => person.id).sort()).toEqual([alpha.user.id, beta.user.id].sort());
  expect(free?.state).toBe("free");

  const secondOffer = await app.inject({
    method: "POST",
    url: "/api/slot-offers",
    headers: auth(gamma.token),
    payload: { toUserId: delta.user.id, date: MONDAY, startTime: "18:00" },
  });
  expect(secondOffer.statusCode).toBe(201);
  const secondAccept = await app.inject({
    method: "POST",
    url: `/api/slot-offers/${secondOffer.json().id}/accept`,
    headers: auth(delta.token),
  });
  expect(secondAccept.statusCode).toBe(200);
  expect(secondAccept.json().courtId).toBe(second.id);

  const lastOffer = await app.inject({
    method: "POST",
    url: "/api/slot-offers",
    headers: auth(epsilon.token),
    payload: { toUserId: zeta.user.id, date: MONDAY, startTime: "18:00" },
  });
  expect(lastOffer.statusCode).toBe(201);
  const failed = await app.inject({
    method: "POST",
    url: `/api/slot-offers/${lastOffer.json().id}/accept`,
    headers: auth(zeta.token),
  });
  expect(failed.statusCode).toBe(409);
  expect(failed.json().error.message).toMatch(/boş kort/);
  const stillOpen = await mondaySlot(epsilon.token);
  expect(stillOpen.people.map((person) => person.id)).toEqual(expect.arrayContaining([epsilon.user.id, zeta.user.id]));
  expect(stillOpen.green).toBe(true);
});

test("purpose rights follow role and admin maintenance is stored approved", async () => {
  const admin = await asAdmin();
  const member = await registerUser(app);
  const tournament = await registerUser(app, { firstName: "Turnuva", lastName: "Sorumlu" });
  await prisma.user.update({ where: { id: tournament.user.id }, data: { role: "TOURNAMENT_MANAGER" } });
  const court = await addCourt(admin.token, "Kort 1");
  const slot = {
    courtId: court.id,
    startDate: MONDAY,
    endDate: MONDAY,
    weekdays: [1],
    startTime: "09:00",
    endTime: "10:00",
  };
  const maintenance = await app.inject({
    method: "POST",
    url: "/api/reservations",
    headers: auth(member.token),
    payload: { ...slot, purpose: "MAINTENANCE" },
  });
  expect(maintenance.statusCode).toBe(403);
  const memberTournament = await app.inject({
    method: "POST",
    url: "/api/reservations",
    headers: auth(member.token),
    payload: { ...slot, purpose: "TOURNAMENT" },
  });
  expect(memberTournament.statusCode).toBe(403);
  const opened = await app.inject({
    method: "POST",
    url: "/api/reservations",
    headers: auth(tournament.token),
    payload: { ...slot, purpose: "TOURNAMENT" },
  });
  expect(opened.statusCode).toBe(201);
  expect(opened.json().status).toBe("PENDING");
  const kept = await app.inject({
    method: "POST",
    url: "/api/reservations",
    headers: auth(admin.token),
    payload: { ...slot, purpose: "MAINTENANCE", startTime: "11:00", endTime: "12:00" },
  });
  expect(kept.statusCode).toBe(201);
  expect(kept.json().status).toBe("APPROVED");
  expect(kept.json().purposeLabel).toBe("bakım");
});

test("lists Kapalı 1–3 then Kort 1–9, and the balloon courts are not açık", async () => {
  await ensureClubCourts();
  const viewer = await registerUser(app);
  const res = await app.inject({ method: "GET", url: "/api/courts", headers: auth(viewer.token) });
  expect(res.statusCode).toBe(200);
  const data = res.json().data as { name: string; kind: string; kindLabel: string }[];
  expect(data.map((court) => court.name)).toEqual(CLUB_COURTS.map((court) => court.name));
  const indoor = data.filter((court) => court.name.startsWith("Kapalı"));
  expect(indoor).toHaveLength(3);
  expect(indoor.every((court) => court.kind === "BALLOON" && court.kindLabel === "kapalı")).toBe(true);
  expect(indoor.some((court) => court.kindLabel === "açık")).toBe(false);
  expect(data.filter((court) => court.name.startsWith("Kort ")).every((court) => court.kind === "OUTDOOR")).toBe(true);
});

test("a court free at 18 and 19 but busy at 20 is not free for 18–21", async () => {
  await ensureClubCourts();
  const admin = await asAdmin();
  const listed = await app.inject({ method: "GET", url: "/api/courts", headers: auth(admin.token) });
  const kort1 = (listed.json().data as { id: string; name: string }[]).find((court) => court.name === "Kort 1");
  expect(kort1).toBeTruthy();
  const day = "2026-10-07";
  expect(weekdayOfDate(day)).toBe(3);
  const booked = await app.inject({
    method: "POST",
    url: "/api/reservations",
    headers: auth(admin.token),
    payload: {
      courtId: kort1!.id,
      purpose: "TRAINING",
      startDate: day,
      endDate: day,
      weekdays: [3],
      startTime: "20:00",
      endTime: "21:00",
    },
  });
  expect(booked.statusCode).toBe(201);
  expect(booked.json().status).toBe("APPROVED");

  const res = await app.inject({
    method: "GET",
    url: `/api/courts/range?date=${day}&start=18:00&end=21:00`,
    headers: auth(admin.token),
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as {
    hours: { startTime: string; courts: { name: string; state: string; reservation: { purposeLabel: string } | null }[] }[];
    freeForRange: { name: string }[];
  };
  expect(body.hours.map((hour) => hour.startTime)).toEqual(["18:00", "19:00", "20:00"]);
  const states = body.hours.map((hour) => hour.courts.find((court) => court.name === "Kort 1")?.state);
  expect(states).toEqual(["free", "free", "reserved"]);
  expect(body.hours[2]?.courts.find((court) => court.name === "Kort 1")?.reservation?.purposeLabel).toBe("antrenman");
  const freeNames = body.freeForRange.map((court) => court.name);
  expect(freeNames).not.toContain("Kort 1");
  expect(freeNames).toContain("Kapalı 1");
  expect(freeNames).toContain("Kort 2");
  expect(freeNames).toHaveLength(CLUB_COURTS.length - 1);
});

test("day grid marks pending and approved hours dolu without changing the Takvim board", async () => {
  await ensureClubCourts();
  const admin = await asAdmin();
  const member = await registerUser(app, { firstName: "Gun", lastName: "Izgara" });
  const partner = await registerUser(app, { firstName: "Rakip", lastName: "Gun" });
  const tournament = await registerUser(app, { firstName: "Turnuva", lastName: "Gun" });
  await prisma.user.update({ where: { id: tournament.user.id }, data: { role: "TOURNAMENT_MANAGER" } });
  const stranger = await registerUser(app, { firstName: "Baska", lastName: "Uye" });
  const listed = await app.inject({ method: "GET", url: "/api/courts", headers: auth(member.token) });
  const courts = listed.json().data as { id: string; name: string }[];
  const id = (name: string) => {
    const court = courts.find((item) => item.name === name);
    expect(court).toBeTruthy();
    return court!.id;
  };
  const day = "2026-11-02";
  expect(weekdayOfDate(day)).toBe(1);

  async function reserve(courtId: string, startTime: string, endTime: string, purpose: string, token: string, partnerId?: string) {
    return app.inject({
      method: "POST",
      url: "/api/reservations",
      headers: auth(token),
      payload: {
        courtId,
        purpose,
        startDate: day,
        endDate: day,
        weekdays: [1],
        startTime,
        endTime,
        ...(partnerId ? { partnerId } : {}),
      },
    });
  }

  const pendingTraining = await reserve(id("Kapalı 1"), "10:00", "11:00", "TRAINING", member.token);
  expect(pendingTraining.statusCode).toBe(201);
  expect(pendingTraining.json().status).toBe("PENDING");
  const pendingMatch = await reserve(id("Kapalı 3"), "09:00", "10:00", "MATCH", member.token, partner.user.id);
  expect(pendingMatch.statusCode).toBe(201);
  expect(pendingMatch.json().status).toBe("PENDING");
  const pendingTournament = await reserve(id("Kort 5"), "11:00", "12:00", "TOURNAMENT", tournament.token);
  expect(pendingTournament.statusCode).toBe(201);
  expect(pendingTournament.json().status).toBe("PENDING");
  const maintenance = await reserve(id("Kapalı 2"), "15:00", "16:00", "MAINTENANCE", admin.token);
  expect(maintenance.statusCode).toBe(201);
  expect(maintenance.json().status).toBe("APPROVED");
  const range = await reserve(id("Kort 2"), "18:00", "21:00", "TRAINING", admin.token);
  expect(range.statusCode).toBe(201);
  expect(range.json().status).toBe("APPROVED");
  const rejected = await reserve(id("Kort 9"), "12:00", "13:00", "TRAINING", member.token);
  expect(rejected.statusCode).toBe(201);
  const reject = await app.inject({
    method: "POST",
    url: `/api/reservations/${rejected.json().id}/reject`,
    headers: auth(admin.token),
  });
  expect(reject.statusCode).toBe(200);

  const res = await app.inject({ method: "GET", url: `/api/courts/day?date=${day}`, headers: auth(stranger.token) });
  expect(res.statusCode).toBe(200);
  const body = res.json() as {
    date: string;
    label: string;
    hours: string[];
    courts: { id: string; name: string; kind: string }[];
    cells: { courtId: string; startTime: string; state: string; reservation: { status: string; purposeLabel: string } | null }[];
  };
  expect(body.date).toBe(day);
  expect(body.label).toBe("Pazartesi");
  expect(body.hours).toEqual([...COURT_HOURS]);
  expect(body.hours[0]).toBe("08:00");
  expect(body.hours[body.hours.length - 1]).toBe("22:00");
  expect(body.courts.map((court) => court.name)).toEqual(CLUB_COURTS.map((court) => court.name));
  expect(body.courts.slice(0, 3).every((court) => court.kind === "BALLOON")).toBe(true);
  expect(body.courts.slice(3).every((court) => court.kind === "OUTDOOR")).toBe(true);
  expect(body.cells).toHaveLength(CLUB_COURTS.length * COURT_HOURS.length);

  const cell = (name: string, startTime: string) => {
    const courtId = body.courts.find((court) => court.name === name)?.id;
    return body.cells.find((item) => item.courtId === courtId && item.startTime === startTime);
  };
  expect(cell("Kapalı 1", "10:00")).toMatchObject({ state: "busy", reservation: { status: "PENDING", purposeLabel: "antrenman" } });
  expect(cell("Kapalı 1", "11:00")?.state).toBe("free");
  expect(cell("Kapalı 3", "09:00")?.reservation).toMatchObject({ status: "PENDING", purposeLabel: "maç" });
  expect(cell("Kort 5", "11:00")?.reservation).toMatchObject({ status: "PENDING", purposeLabel: "turnuva" });
  expect(cell("Kapalı 2", "15:00")?.reservation).toMatchObject({ status: "APPROVED", purposeLabel: "bakım" });
  expect(cell("Kort 2", "18:00")?.state).toBe("busy");
  expect(cell("Kort 2", "19:00")?.reservation?.purposeLabel).toBe("antrenman");
  expect(cell("Kort 2", "20:00")?.state).toBe("busy");
  expect(cell("Kort 2", "21:00")?.state).toBe("free");
  expect(cell("Kort 9", "12:00")?.state).toBe("free");
  expect(cell("Kort 1", "08:00")).toMatchObject({ state: "free", reservation: null });
  expect(cell("Kort 9", "22:00")?.state).toBe("free");

  const board = await app.inject({ method: "GET", url: `/api/courts/board?week=${day}`, headers: auth(stranger.token) });
  expect(board.statusCode).toBe(200);
  const slots = board.json().slots as { date: string; startTime: string; courts: { name: string; state: string }[] }[];
  const boardCell = (name: string, startTime: string) =>
    slots.find((item) => item.date === day && item.startTime === startTime)?.courts.find((court) => court.name === name);
  expect(boardCell("Kapalı 1", "10:00")?.state).toBe("free");
  expect(boardCell("Kapalı 3", "09:00")?.state).toBe("free");
  expect(boardCell("Kapalı 2", "15:00")?.state).toBe("reserved");
  expect(boardCell("Kort 2", "18:00")?.state).toBe("reserved");
  expect(boardCell("Kort 2", "21:00")?.state).toBe("free");
  expect(boardCell("Kort 9", "12:00")?.state).toBe("free");
});
