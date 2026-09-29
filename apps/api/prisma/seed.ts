import "dotenv/config";
import {
  SKILLS,
  istanbulNowParts,
  type OverallLevel,
  type PlayerStatus,
  type SkillName,
} from "@club/shared";
import { hashPassword } from "../src/lib/password";
import { prisma } from "../src/lib/prisma";
import { generateDraw, recordTournamentResult } from "../src/services/tournaments/service";

const env = process.env.NODE_ENV ?? "development";
if (env === "production") {
  console.error("Production ortamında demo kullanıcı oluşturulmaz.");
  process.exit(1);
}
if (env !== "development" && process.env.SEED_DEMO !== "true") {
  console.error("Seed yalnızca NODE_ENV=development veya SEED_DEMO=true iken çalışır.");
  process.exit(1);
}

const FIRST = [
  "Deniz", "Selin", "Emre", "Elif", "Burak", "Mert", "Zeynep", "Can", "Ayşe", "Hakan",
  "Melis", "Oğuz", "Defne", "Cem", "İpek", "Baran", "Ece", "Kaan", "Nazlı", "Tolga",
  "Ceren", "Onur", "Pınar", "Serkan", "Yasemin", "Alp", "Derya", "Furkan", "Gizem", "Hande",
  "İlker", "Kerem", "Leyla", "Murat", "Nilay", "Okan", "Pelin", "Rıza", "Seda", "Tarık",
];
const LAST = [
  "Aksoy", "Koç", "Şahin", "Demir", "Aydın", "Yıldız", "Arslan", "Öztürk", "Kaya", "Çelik",
  "Acar", "Polat", "Kurt", "Aslan", "Erdem", "Uçar", "Tan", "Doğan", "Güneş", "Şimşek",
  "Yalçın", "Karaca", "Akın", "Bulut", "Ersoy", "Korkmaz", "Uysal", "Demirci", "Özkan", "Sezer",
  "Aydoğdu", "Sönmez", "Karahan", "Tekin", "Ergün", "Yavuz", "Akgün", "Ersoy", "Acar", "Yücel",
];
const LEVELS: OverallLevel[] = [
  "ADVANCED", "INTERMEDIATE_PLUS", "ADVANCED_PLUS", "INTERMEDIATE_PLUS", "INTERMEDIATE",
  "BEGINNER", "BEGINNER_PLUS", "INTERMEDIATE", "INTERMEDIATE_PLUS", "ADVANCED",
  "TOURNAMENT", "BEGINNER", "INTERMEDIATE", "ADVANCED", "BEGINNER_PLUS",
  "INTERMEDIATE_PLUS", "ADVANCED_PLUS", "INTERMEDIATE", "BEGINNER", "TOURNAMENT",
  "INTERMEDIATE", "ADVANCED", "BEGINNER_PLUS", "INTERMEDIATE_PLUS", "ADVANCED",
  "INTERMEDIATE", "BEGINNER", "ADVANCED_PLUS", "INTERMEDIATE_PLUS", "BEGINNER_PLUS",
  "INTERMEDIATE", "TOURNAMENT", "ADVANCED", "INTERMEDIATE", "BEGINNER",
  "INTERMEDIATE_PLUS", "ADVANCED", "INTERMEDIATE", "BEGINNER_PLUS", "ADVANCED_PLUS",
];
const DISTRICTS = ["Kadıköy", "Beşiktaş", "Üsküdar", "Bakırköy", "Ataşehir", "Maltepe", "Sarıyer", "Şişli"];
const RACKETS: [string, string][] = [
  ["Wilson", "Blade 98"],
  ["Babolat", "Pure Aero"],
  ["Head", "Speed MP"],
  ["Yonex", "Ezone 100"],
  ["Wilson", "Pro Staff 97"],
  ["Prince", "Phantom 100"],
  ["Tecnifibre", "TF40"],
  ["Wilson", "Clash 100"],
];
const LEVEL_BASE: Record<OverallLevel, number> = {
  BEGINNER: 2.4,
  BEGINNER_PLUS: 3.5,
  INTERMEDIATE: 5,
  INTERMEDIATE_PLUS: 6.3,
  ADVANCED: 7.4,
  ADVANCED_PLUS: 8.3,
  TOURNAMENT: 9,
};
const GROUPS: [string, string, "PUBLIC" | "PRIVATE"][] = [
  ["Sabah Tenisçileri", "Gün doğmadan kortta olanlar.", "PUBLIC"],
  ["Akşam Grubu", "İş çıkışı 19:00 sonrası maçlar.", "PUBLIC"],
  ["Hafta Sonu Grubu", "Cumartesi ve pazar buluşmaları.", "PUBLIC"],
  ["Veteranlar", "Tecrübenin keyfi, acele yok.", "PUBLIC"],
  ["İleri Seviye", "Tempo yüksek, top uzun.", "PRIVATE"],
  ["Başlangıç Grubu", "Kortla yeni tanışanlar.", "PUBLIC"],
  ["Turnuva Takımı", "Kulüp adına maç yapanlar.", "PRIVATE"],
  ["Çiftler Grubu", "Dört kişi, bir top.", "PUBLIC"],
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampSkill(value: number): number {
  return Math.round(Math.min(10, Math.max(1, value)) * 10) / 10;
}

const SPECIAL_EMAIL = [
  "admin@tennisclub.local",
  "manager@tennisclub.local",
  "tournament@tennisclub.local",
  "member@tennisclub.local",
  "burak.aydin@tennisclub.local",
];
const ROLES = ["ADMIN", "CLUB_MANAGER", "TOURNAMENT_MANAGER", "MEMBER", "GROUP_MANAGER"] as const;

function statusFor(index: number): { status: PlayerStatus; note?: string; end?: string } {
  if (index === 11) return { status: "INJURED", note: "Kısa bir ara, kortta görüşürüz.", end: daysFromNow(21) };
  if (index === 18) return { status: "PAUSED", note: "Bu sezon tenise ara verdim." };
  if (index === 22) return { status: "ON_HOLIDAY" };
  if (index === 27) return { status: "OUT_OF_TOWN" };
  if (index === 8) return { status: "LIMITED" };
  return { status: "ACTIVE" };
}

function daysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function slugEmail(first: string, last: string, index: number): string {
  if (SPECIAL_EMAIL[index]) return SPECIAL_EMAIL[index];
  const fold = (value: string) =>
    value
      .toLocaleLowerCase("tr-TR")
      .replaceAll("ı", "i")
      .replaceAll("ğ", "g")
      .replaceAll("ü", "u")
      .replaceAll("ş", "s")
      .replaceAll("ö", "o")
      .replaceAll("ç", "c")
      .replace(/[^a-z]/g, "");
  return `${fold(first)}.${fold(last)}${index}@tennisclub.local`;
}

async function reset(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ DECLARE r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations') LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);
}

async function main(): Promise<void> {
  const rand = mulberry32(20260929);
  const today = istanbulNowParts();
  await reset();
  const passwordHash = await hashPassword("Demo1234!");
  const userIds: string[] = [];

  for (let index = 0; index < 40; index += 1) {
    const firstName = FIRST[index] ?? "Oyuncu";
    const lastName = LAST[index] ?? "Deneme";
    const level = LEVELS[index] ?? "INTERMEDIATE";
    const state = statusFor(index);
    const birthYear = 1966 + ((index * 3) % 38);
    const district = DISTRICTS[index % DISTRICTS.length] ?? "Kadıköy";
    const phone = `+90 555 ${String(100 + index).padStart(3, "0")} ${String(10 + (index % 80)).padStart(2, "0")} ${String(index).padStart(2, "0")}`;
    const user = await prisma.user.create({
      data: {
        email: slugEmail(firstName, lastName, index),
        passwordHash,
        role: ROLES[index] ?? "MEMBER",
        profile: {
          create: {
            firstName,
            lastName,
            birthYear,
            gender: index % 3 === 0 ? "FEMALE" : index % 3 === 1 ? "MALE" : "UNSPECIFIED",
            phone,
            whatsapp: phone.replaceAll(" ", ""),
            address: index % 5 === 0 ? `Örnek Sokak No ${index}, Daire 2` : null,
            district,
            city: "İstanbul",
            clubJoinDate: new Date(`${2016 + (index % 9)}-0${(index % 8) + 1}-15T00:00:00.000Z`),
            bio: `${district} kortlarında oynuyorum. Seviye: ${level === "INTERMEDIATE_PLUS" ? "Orta+" : "kulüp maçı"}.`,
            playerStatus: state.status,
            statusNote: state.note,
            statusEnd: state.end ? new Date(`${state.end}T00:00:00.000Z`) : null,
          },
        },
        privacy: { create: {} },
        tennisProfile: {
          create: {
            tennisStartYear: birthYear + 12 + (index % 8),
            dominantHand: index % 7 === 0 ? "LEFT" : "RIGHT",
            backhandType: index % 4 === 0 ? "ONE_HANDED" : "TWO_HANDED",
            preferredCourt: index % 3 === 0 ? "HARD" : "CLAY",
            playPreference: index % 5 === 0 ? "SINGLES" : index % 5 === 1 ? "DOUBLES" : "BOTH",
            preferredPlayTimes: index % 2 === 0 ? ["EVENING", "WEEKEND"] : ["MORNING", "WEEKEND"],
            overallLevel: level,
            ntrp: Math.round((2 + (LEVEL_BASE[level] / 10) * 4) * 10) / 10,
            skills: {
              create: SKILLS.map((skill: SkillName, skillIndex) => ({
                skill,
                value: clampSkill(LEVEL_BASE[level] + ((index + skillIndex) % 5) * 0.3 - 0.6),
              })),
            },
          },
        },
      },
    });
    userIds.push(user.id);
    const racket = index === 3 || index === 7 || index === 12 ? (["Wilson", "Blade 98"] as [string, string]) : RACKETS[index % RACKETS.length]!;
    await prisma.racket.create({
      data: {
        userId: user.id,
        brand: racket[0],
        model: racket[1],
        headSize: index % 2 === 0 ? "98 in" : "100 in",
        weight: index % 2 === 0 ? "305 g" : "300 g",
        stringName: index % 2 === 0 ? "Luxilon ALU Power" : "Babolat RPM Blast",
        tension: "24 kg",
        gripSize: index % 3 === 0 ? "L2" : "L3",
        isPrimary: true,
      },
    });

    const weekly: { weekday: number; startTime: string; endTime: string }[] = [];
    if (index < 10 || index === 3) weekly.push({ weekday: today.weekday, startTime: "18:00", endTime: "21:30" });
    if (index % 2 === 0) weekly.push({ weekday: 6, startTime: "09:00", endTime: "12:00" });
    if (index % 3 === 0) weekly.push({ weekday: 0, startTime: "10:00", endTime: "13:00" });
    if (index % 4 === 1) weekly.push({ weekday: (today.weekday + 2) % 7, startTime: "07:30", endTime: "09:00" });
    if (weekly.length) {
      await prisma.availability.createMany({
        data: weekly.map((window) => ({
          userId: user.id,
          kind: "WEEKLY" as const,
          weekday: window.weekday,
          startTime: window.startTime,
          endTime: window.endTime,
        })),
      });
    }
    if (index === 6 || index === 9 || index === 14) {
      await prisma.availability.create({
        data: {
          userId: user.id,
          kind: "ONE_OFF",
          date: new Date(`${today.day}T00:00:00.000Z`),
          startTime: "19:00",
          endTime: "22:00",
          note: "bugün 19:00 sonrası",
        },
      });
    }
    if (state.status === "INJURED" || state.status === "ON_HOLIDAY" || state.status === "OUT_OF_TOWN") {
      await prisma.absence.create({
        data: {
          userId: user.id,
          startDate: new Date(`${daysFromNow(-2)}T00:00:00.000Z`),
          endDate: new Date(`${daysFromNow(14)}T00:00:00.000Z`),
          status: state.status,
          publicNote: state.note,
        },
      });
    }
  }

  const groups = [];
  for (const [name, description, visibility] of GROUPS) {
    const group = await prisma.group.create({
      data: { name, description, visibility, createdById: userIds[1] },
    });
    groups.push(group);
  }
  await prisma.groupMember.create({ data: { groupId: groups[0]!.id, userId: userIds[4]!, role: "MANAGER" } });
  await prisma.groupMember.create({ data: { groupId: groups[4]!.id, userId: userIds[1]!, role: "MANAGER" } });
  for (let index = 0; index < userIds.length; index += 1) {
    const group = groups[index % groups.length]!;
    if (!(index === 4 && group.id === groups[0]!.id) && !(index === 1 && group.id === groups[4]!.id)) {
      await prisma.groupMember.create({
        data: { groupId: group.id, userId: userIds[index]!, role: "MEMBER" },
      });
    }
    if (index % 6 === 3) {
      const extra = groups[(index + 3) % groups.length]!;
      await prisma.groupMember.upsert({
        where: { groupId_userId: { groupId: extra.id, userId: userIds[index]! } },
        create: { groupId: extra.id, userId: userIds[index]!, role: "MEMBER" },
        update: {},
      });
    }
  }
  for (const groupIndex of [1, 7]) {
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: groups[groupIndex]!.id, userId: userIds[3]! } },
      create: { groupId: groups[groupIndex]!.id, userId: userIds[3]!, role: "MEMBER" },
      update: {},
    });
  }

  await prisma.groupEvent.create({
    data: {
      groupId: groups[1]!.id,
      title: "Akşam kortu",
      description: "Işıklar altında iki kort.",
      startsAt: new Date(`${daysFromNow(2)}T19:00:00+03:00`),
      location: "Kulüp kort 2",
      createdById: userIds[1],
    },
  });

  const scores = ["6-4 6-3", "7-5 4-6 6-2", "6-2 6-4", "3-6 6-4 10-6", "6-3 6-4"];
  for (let index = 0; index < 16; index += 1) {
    const a = userIds[index]!;
    const b = userIds[(index + 7) % 40]!;
    const score = scores[index % scores.length]!;
    const sets = score.split(" ");
    let aSets = 0;
    let bSets = 0;
    for (const set of sets) {
      const [left, right] = set.split("-").map(Number);
      if ((left ?? 0) > (right ?? 0)) aSets += 1;
      else bSets += 1;
    }
    await prisma.match.create({
      data: {
        format: "SINGLE",
        scheduledAt: new Date(Date.now() - (index + 1) * 86400000 * 3),
        court: `Kort ${(index % 4) + 1}`,
        setFormat: "BEST_OF_3",
        score,
        winnerSide: aSets >= bSets ? "A" : "B",
        status: "COMPLETED",
        createdById: a,
        players: {
          create: [
            { userId: a, side: "A" },
            { userId: b, side: "B" },
          ],
        },
      },
    });
  }
  await prisma.match.create({
    data: {
      format: "SINGLE",
      scheduledAt: new Date(`${daysFromNow(1)}T19:00:00+03:00`),
      court: "Kort 1",
      setFormat: "BEST_OF_3",
      status: "SCHEDULED",
      note: "Işıklar açık olsun.",
      createdById: userIds[3],
      groupId: groups[1]!.id,
      players: {
        create: [
          { userId: userIds[3]!, side: "A" },
          { userId: userIds[5]!, side: "B" },
        ],
      },
    },
  });
  await prisma.match.create({
    data: {
      format: "DOUBLE",
      scheduledAt: new Date(`${daysFromNow(3)}T10:30:00+03:00`),
      court: "Kort 3",
      setFormat: "BEST_OF_3_SUPER_TIEBREAK",
      status: "SCHEDULED",
      createdById: userIds[3],
      groupId: groups[7]!.id,
      players: {
        create: [
          { userId: userIds[3]!, side: "A" },
          { userId: userIds[6]!, side: "A" },
          { userId: userIds[9]!, side: "B" },
          { userId: userIds[12]!, side: "B" },
        ],
      },
    },
  });

  await prisma.challenge.create({
    data: {
      format: "SINGLE",
      challengerId: userIds[5]!,
      recipientId: userIds[3]!,
      proposedDate: new Date(`${daysFromNow(4)}T00:00:00.000Z`),
      proposedTime: "20:00",
      court: "Kort 2",
      setFormat: "BEST_OF_3",
      note: "Akşam ışıkta oynayalım.",
      status: "PENDING",
      awaitingUserId: userIds[3],
    },
  });
  await prisma.challenge.create({
    data: {
      format: "SINGLE",
      challengerId: userIds[3]!,
      recipientId: userIds[6]!,
      proposedDate: new Date(`${daysFromNow(5)}T00:00:00.000Z`),
      proposedTime: "18:30",
      court: "Kort 1",
      status: "COUNTERED",
      counterDate: new Date(`${daysFromNow(6)}T00:00:00.000Z`),
      counterTime: "19:30",
      counterNote: "Bir gün sonra 19:30 uygunum.",
      counteredById: userIds[6],
      awaitingUserId: userIds[3],
    },
  });
  await prisma.challenge.create({
    data: {
      format: "SINGLE",
      challengerId: userIds[9]!,
      recipientId: userIds[10]!,
      proposedDate: new Date(`${daysFromNow(2)}T00:00:00.000Z`),
      proposedTime: "09:00",
      status: "DECLINED",
      awaitingUserId: null,
    },
  });

  const spring = await prisma.tournament.create({
    data: {
      name: "Bahar Kupası",
      description: "Tekler eleme. Kayıt açık, tablo kayıtlar kapanınca kurulur.",
      startDate: new Date(`${daysFromNow(14)}T00:00:00.000Z`),
      endDate: new Date(`${daysFromNow(16)}T00:00:00.000Z`),
      registrationDeadline: new Date(`${daysFromNow(10)}T23:59:59.000Z`),
      status: "REGISTRATION_OPEN",
      format: "SINGLE_ELIMINATION",
      division: "SINGLES",
      location: "Kulüp kortları",
      maxPlayers: 16,
      courts: ["Kort 1", "Kort 2"],
      rules: "Üç set. Üçüncü set 10 sayı tie-break. Kort kulüp panosundan alınır.",
      setFormat: "BEST_OF_3_SUPER_TIEBREAK",
      createdById: userIds[2],
    },
  });
  for (const id of [userIds[0], userIds[2], userIds[3], userIds[10], userIds[16], userIds[31]]) {
    await prisma.tournamentPlayer.create({ data: { tournamentId: spring.id, userId: id!, status: "REGISTERED" } });
  }

  const knockout = await prisma.tournament.create({
    data: {
      name: "Kış Eleme",
      description: "Sekiz kişilik tekler eleme tablosu.",
      startDate: new Date(`${daysFromNow(-2)}T00:00:00.000Z`),
      status: "IN_PROGRESS",
      format: "SINGLE_ELIMINATION",
      division: "SINGLES",
      location: "Kort 1",
      courts: ["Kort 1"],
      maxPlayers: 8,
      rules: "Çeyrek final, yarı final ve final. Skor girilince kazanan bir üst tura çıkar.",
      createdById: userIds[2],
    },
  });
  for (const id of userIds.slice(4, 12)) {
    await prisma.tournamentPlayer.create({ data: { tournamentId: knockout.id, userId: id!, status: "CONFIRMED" } });
  }
  const bracket = await generateDraw(knockout.id);
  const firstKnockout = bracket.find((match) => match.playerAId && match.playerBId && !match.winnerId);
  if (firstKnockout) {
    await recordTournamentResult({
      tournamentId: knockout.id,
      matchId: firstKnockout.id,
      score: "6-4 6-2",
      winnerSide: "A",
    });
  }

  const league = await prisma.tournament.create({
    data: {
      name: "Kulüp İçi Lig",
      description: "Dört kişilik lig. Galibiyet 3, mağlubiyet 0.",
      startDate: new Date(`${daysFromNow(-10)}T00:00:00.000Z`),
      status: "IN_PROGRESS",
      format: "ROUND_ROBIN",
      division: "SINGLES",
      location: "Kulüp",
      pointsWin: 3,
      pointsLoss: 0,
      createdById: userIds[2],
      groupId: groups[6]!.id,
    },
  });
  for (const id of [userIds[3], userIds[12], userIds[13], userIds[14]]) {
    await prisma.tournamentPlayer.create({ data: { tournamentId: league.id, userId: id!, status: "CONFIRMED" } });
  }
  const fixtures = await generateDraw(league.id);
  const played = fixtures.filter((match) => match.playerAId && match.playerBId).slice(0, 2);
  for (const match of played) {
    await recordTournamentResult({
      tournamentId: league.id,
      matchId: match.id,
      score: "6-3 6-4",
      winnerSide: "A",
    });
  }

  const ladder = await prisma.ladder.create({
    data: {
      name: "Kulüp Merdiveni",
      description: "Bir oyuncu en fazla 3 sıra yukarıdaki rakibe defi atabilir.",
      groupId: groups[4]!.id,
      maxRankSpan: 3,
    },
  });
  const ladderIds = userIds.slice(0, 12);
  for (let rank = 0; rank < ladderIds.length; rank += 1) {
    await prisma.ladderPlayer.create({
      data: { ladderId: ladder.id, userId: ladderIds[rank]!, rank: rank + 1, points: 120 - rank * 7 },
    });
    await prisma.ladderHistory.create({
      data: {
        ladderId: ladder.id,
        userId: ladderIds[rank]!,
        previousRank: null,
        newRank: rank + 1,
        previousPoints: null,
        newPoints: 120 - rank * 7,
        reason: "Sezon açılışı",
      },
    });
  }

  await prisma.announcement.createMany({
    data: [
      {
        title: "Kort 2 aydınlatması yenilendi",
        body: "Akşam maçları için Kort 2 ışıkları bu hafta açıldı. Rezervasyonu kulüp panosundan almayı unutmayın.",
        authorId: userIds[1]!,
      },
      {
        title: "Bahar Kupası kayıtları açık",
        body: "Tekler kupasına Turnuvalar sekmesinden katılabilirsin. Kontenjan dolunca yedek listesi açılır.",
        authorId: userIds[1]!,
      },
      {
        title: "Cumartesi sabah antrenmanı",
        body: "Hafta Sonu Grubu 09:00'da Kort 1 ve 3'te. Yeni gelenler ısınmaya katılabilir.",
        authorId: userIds[0]!,
      },
    ],
  });

  await prisma.notification.create({
    data: {
      userId: userIds[3]!,
      type: "CHALLENGE_RECEIVED",
      title: "Yeni defi",
      body: "Mert Yıldız sana maç teklif etti.",
      link: "/defiler",
    },
  });

  const recent = await prisma.match.findMany({
    where: { status: "COMPLETED" },
    orderBy: { scheduledAt: "desc" },
    take: 4,
    include: { players: { include: { user: { include: { profile: true } } } } },
  });
  for (const match of recent) {
    for (const player of match.players) {
      const opponents = match.players
        .filter((other) => other.side !== player.side)
        .map((other) => `${other.user.profile?.firstName ?? ""} ${other.user.profile?.lastName ?? ""}`.trim())
        .filter(Boolean);
      await prisma.activityEvent.create({
        data: {
          actorId: player.userId,
          type: "MATCH_RECORDED",
          title: "Maç sonucu işlendi",
          body: `${match.score ?? ""}${opponents.length ? ` · ${opponents.join(", ")}` : ""}`,
          link: `/maclar/${match.id}`,
          createdAt: match.scheduledAt,
        },
      });
    }
  }
  await prisma.activityEvent.create({
    data: {
      actorId: userIds[2]!,
      type: "TOURNAMENT_CREATED",
      title: "Yeni turnuva",
      body: spring.name,
      link: `/turnuvalar/${spring.id}`,
    },
  });
  await prisma.activityEvent.create({
    data: {
      actorId: userIds[3]!,
      type: "TOURNAMENT_JOIN",
      title: "Turnuvaya katıldı",
      body: spring.name,
      link: `/turnuvalar/${spring.id}`,
    },
  });
  await prisma.activityEvent.create({
    data: {
      actorId: userIds[4]!,
      type: "LADDER_RANK_CHANGE",
      title: "Merdiven sırası yükseldi",
      body: "Kulüp Merdiveni · 6 → 5",
      link: "/merdiven",
    },
  });

  for (const name of ["Kort 1", "Kort 2", "Kort 3"]) {
    const existing = await prisma.court.findFirst({ where: { name, deletedAt: null } });
    if (!existing) await prisma.court.create({ data: { name, active: true } });
  }

  console.log(`Seed tamam: ${userIds.length} üye, ${groups.length} grup. rand=${rand().toFixed(3)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
