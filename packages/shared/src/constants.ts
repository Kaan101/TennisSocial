export const ROLES = [
  "ADMIN",
  "CLUB_MANAGER",
  "TOURNAMENT_MANAGER",
  "GROUP_MANAGER",
  "MEMBER",
] as const;
export type Role = (typeof ROLES)[number];

export const GENDERS = ["FEMALE", "MALE", "UNSPECIFIED"] as const;
export type Gender = (typeof GENDERS)[number];

export const PLAYER_STATUSES = [
  "ACTIVE",
  "LIMITED",
  "ON_HOLIDAY",
  "OUT_OF_TOWN",
  "INJURED",
  "PAUSED",
] as const;
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

export const VISIBILITIES = ["PUBLIC", "MEMBERS", "FRIENDS", "HIDDEN"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const DOMINANT_HANDS = ["RIGHT", "LEFT"] as const;
export type DominantHand = (typeof DOMINANT_HANDS)[number];

export const BACKHAND_TYPES = ["ONE_HANDED", "TWO_HANDED"] as const;
export type BackhandType = (typeof BACKHAND_TYPES)[number];

export const COURT_TYPES = ["CLAY", "HARD", "GRASS", "CARPET", "ANY"] as const;
export type CourtType = (typeof COURT_TYPES)[number];

export const PLAY_PREFERENCES = ["SINGLES", "DOUBLES", "BOTH"] as const;
export type PlayPreference = (typeof PLAY_PREFERENCES)[number];

export const AVAILABILITY_STATES = ["FULL", "MAYBE", "BUSY"] as const;
export type AvailabilityState = (typeof AVAILABILITY_STATES)[number];

export const PREFERRED_TIMES = ["MORNING", "AFTERNOON", "EVENING", "WEEKEND"] as const;
export type PreferredTime = (typeof PREFERRED_TIMES)[number];

export const OVERALL_LEVELS = [
  "BEGINNER",
  "BEGINNER_PLUS",
  "INTERMEDIATE",
  "INTERMEDIATE_PLUS",
  "ADVANCED",
  "ADVANCED_PLUS",
  "TOURNAMENT",
] as const;
export type OverallLevel = (typeof OVERALL_LEVELS)[number];

export const SKILLS = [
  "FOREHAND",
  "BACKHAND",
  "SERVE",
  "RETURN",
  "VOLLEY",
  "SLICE",
  "TOPSPIN",
  "DROP_SHOT",
  "LOB",
  "SMASH",
  "FOOTWORK",
  "SPEED",
  "STAMINA",
  "CONSISTENCY",
  "POWER",
  "CONTROL",
  "NET_PLAY",
  "BASELINE_PLAY",
  "MATCH_STRATEGY",
  "MENTAL_STRENGTH",
] as const;
export type SkillName = (typeof SKILLS)[number];

export const RADAR_AXES = [
  "Forehand",
  "Backhand",
  "Servis",
  "Vole",
  "Hareket",
  "Tutarlılık",
] as const;

export const MATCH_FORMATS = ["SINGLE", "DOUBLE"] as const;
export type MatchFormat = (typeof MATCH_FORMATS)[number];

export const MATCH_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const SET_FORMATS = [
  "BEST_OF_3",
  "BEST_OF_3_SUPER_TIEBREAK",
  "PRO_SET",
  "ONE_SET",
] as const;
export type SetFormat = (typeof SET_FORMATS)[number];

export const MATCH_SIDES = ["A", "B"] as const;
export type MatchSide = (typeof MATCH_SIDES)[number];

export const CHALLENGE_STATUSES = [
  "PENDING",
  "COUNTERED",
  "ACCEPTED",
  "DECLINED",
  "CANCELLED",
] as const;
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

export const GROUP_VISIBILITIES = ["PUBLIC", "PRIVATE"] as const;
export type GroupVisibility = (typeof GROUP_VISIBILITIES)[number];

export const GROUP_MEMBER_ROLES = ["MANAGER", "MEMBER"] as const;
export type GroupMemberRole = (typeof GROUP_MEMBER_ROLES)[number];

export const TOURNAMENT_STATUSES = [
  "DRAFT",
  "REGISTRATION_OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export const TOURNAMENT_FORMATS = [
  "SINGLE_ELIMINATION",
  "ROUND_ROBIN",
  "GROUPS_AND_KNOCKOUT",
  "AMERICANO",
] as const;
export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];

export const TOURNAMENT_DIVISIONS = ["SINGLES", "DOUBLES", "MIXED"] as const;
export type TournamentDivision = (typeof TOURNAMENT_DIVISIONS)[number];

export const TOURNAMENT_PLAYER_STATUSES = ["REGISTERED", "WAITING_LIST", "CONFIRMED", "WITHDRAWN"] as const;
export type TournamentPlayerStatus = (typeof TOURNAMENT_PLAYER_STATUSES)[number];

export const TOURNAMENT_FORMAT_LABELS: Record<TournamentFormat, string> = {
  SINGLE_ELIMINATION: "Eleme",
  ROUND_ROBIN: "Lig usulü",
  GROUPS_AND_KNOCKOUT: "Grup + eleme",
  AMERICANO: "Americano",
};

export const TOURNAMENT_DIVISION_LABELS: Record<TournamentDivision, string> = {
  SINGLES: "Tekler",
  DOUBLES: "Çiftler",
  MIXED: "Karışık çiftler",
};

export const TOURNAMENT_PLAYER_STATUS_LABELS: Record<TournamentPlayerStatus, string> = {
  REGISTERED: "Kayıtlı",
  WAITING_LIST: "Yedek listesi",
  CONFIRMED: "Onaylı",
  WITHDRAWN: "Çekildi",
};

export const TOURNAMENT_STATUS_LABELS: Record<(typeof TOURNAMENT_STATUSES)[number], string> = {
  DRAFT: "Taslak",
  REGISTRATION_OPEN: "Kayıt açık",
  IN_PROGRESS: "Devam ediyor",
  COMPLETED: "Bitti",
  CANCELLED: "İptal",
};

export const LEVEL_LABELS: Record<OverallLevel, string> = {
  BEGINNER: "Başlangıç",
  BEGINNER_PLUS: "Başlangıç+",
  INTERMEDIATE: "Orta",
  INTERMEDIATE_PLUS: "Orta+",
  ADVANCED: "İleri",
  ADVANCED_PLUS: "İleri+",
  TOURNAMENT: "Turnuva Oyuncusu",
};

export const STATUS_LABELS: Record<PlayerStatus, string> = {
  ACTIVE: "Aktif",
  LIMITED: "Kısıtlı",
  ON_HOLIDAY: "Tatilde",
  OUT_OF_TOWN: "Şehir dışında",
  INJURED: "Sakat",
  PAUSED: "Ara verdi",
};

export const SKILL_LABELS: Record<SkillName, string> = {
  FOREHAND: "Forehand",
  BACKHAND: "Backhand",
  SERVE: "Servis",
  RETURN: "Return",
  VOLLEY: "Vole",
  SLICE: "Slice",
  TOPSPIN: "Topspin",
  DROP_SHOT: "Drop shot",
  LOB: "Lob",
  SMASH: "Smaç",
  FOOTWORK: "Ayak işi",
  SPEED: "Hız",
  STAMINA: "Dayanıklılık",
  CONSISTENCY: "Tutarlılık",
  POWER: "Güç",
  CONTROL: "Kontrol",
  NET_PLAY: "File oyunu",
  BASELINE_PLAY: "Dip çizgi",
  MATCH_STRATEGY: "Maç stratejisi",
  MENTAL_STRENGTH: "Mental güç",
};

export const SKILL_GROUPS: { title: string; skills: SkillName[] }[] = [
  {
    title: "Vuruşlar",
    skills: ["FOREHAND", "BACKHAND", "SERVE", "RETURN", "VOLLEY", "SLICE", "TOPSPIN", "DROP_SHOT", "LOB", "SMASH"],
  },
  {
    title: "Oyun",
    skills: ["NET_PLAY", "BASELINE_PLAY", "MATCH_STRATEGY", "CONSISTENCY", "POWER", "CONTROL"],
  },
  {
    title: "Fiziksel ve mental",
    skills: ["FOOTWORK", "SPEED", "STAMINA", "MENTAL_STRENGTH"],
  },
];

export const HAND_LABELS: Record<DominantHand, string> = {
  RIGHT: "Sağ",
  LEFT: "Sol",
};

export const BACKHAND_LABELS: Record<BackhandType, string> = {
  ONE_HANDED: "Tek el",
  TWO_HANDED: "Çift el",
};

export const COURT_LABELS: Record<CourtType, string> = {
  CLAY: "Toprak",
  HARD: "Sert",
  GRASS: "Çim",
  CARPET: "Halı",
  ANY: "Fark etmez",
};

export const PLAY_LABELS: Record<PlayPreference, string> = {
  SINGLES: "Tekler",
  DOUBLES: "Çiftler",
  BOTH: "İkisi de",
};

export const TIME_LABELS: Record<PreferredTime, string> = {
  MORNING: "Sabah",
  AFTERNOON: "Öğleden sonra",
  EVENING: "Akşam",
  WEEKEND: "Hafta sonu",
};

export const SET_FORMAT_LABELS: Record<SetFormat, string> = {
  BEST_OF_3: "2/3 set",
  BEST_OF_3_SUPER_TIEBREAK: "2/3 set + süper tie-break",
  PRO_SET: "Pro set",
  ONE_SET: "Tek set",
};

export const FORMAT_LABELS: Record<MatchFormat, string> = {
  SINGLE: "Tekler",
  DOUBLE: "Çiftler",
};

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  PUBLIC: "Herkes",
  MEMBERS: "Üyeler",
  FRIENDS: "Arkadaşlar",
  HIDDEN: "Yalnızca ben",
};

export const WEEKDAYS: { value: number; label: string; short: string }[] = [
  { value: 1, label: "Pazartesi", short: "Pzt" },
  { value: 2, label: "Salı", short: "Sal" },
  { value: 3, label: "Çarşamba", short: "Çar" },
  { value: 4, label: "Perşembe", short: "Per" },
  { value: 5, label: "Cuma", short: "Cum" },
  { value: 6, label: "Cumartesi", short: "Cmt" },
  { value: 0, label: "Pazar", short: "Paz" },
];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Yönetici",
  CLUB_MANAGER: "Kulüp sorumlusu",
  TOURNAMENT_MANAGER: "Turnuva sorumlusu",
  GROUP_MANAGER: "Grup sorumlusu",
  MEMBER: "Üye",
};

export const COURT_PURPOSES = ["MATCH", "TRAINING", "TOURNAMENT", "MAINTENANCE"] as const;
export type CourtPurpose = (typeof COURT_PURPOSES)[number];

export const COURT_PURPOSE_LABELS: Record<CourtPurpose, string> = {
  MATCH: "maç",
  TRAINING: "antrenman",
  TOURNAMENT: "turnuva",
  MAINTENANCE: "bakım",
};

export const COURT_KINDS = ["BALLOON", "OUTDOOR"] as const;
export type CourtKind = (typeof COURT_KINDS)[number];

/** Kapalı 1–3 are balloon courts. Their label is kapalı, never açık. */
export const COURT_KIND_LABELS: Record<CourtKind, string> = {
  BALLOON: "kapalı",
  OUTDOOR: "açık",
};

export const CLUB_COURTS: { name: string; kind: CourtKind; sortOrder: number }[] = [
  { name: "Kapalı 1", kind: "BALLOON", sortOrder: 1 },
  { name: "Kapalı 2", kind: "BALLOON", sortOrder: 2 },
  { name: "Kapalı 3", kind: "BALLOON", sortOrder: 3 },
  { name: "Kort 1", kind: "OUTDOOR", sortOrder: 4 },
  { name: "Kort 2", kind: "OUTDOOR", sortOrder: 5 },
  { name: "Kort 3", kind: "OUTDOOR", sortOrder: 6 },
  { name: "Kort 4", kind: "OUTDOOR", sortOrder: 7 },
  { name: "Kort 5", kind: "OUTDOOR", sortOrder: 8 },
  { name: "Kort 6", kind: "OUTDOOR", sortOrder: 9 },
  { name: "Kort 7", kind: "OUTDOOR", sortOrder: 10 },
  { name: "Kort 8", kind: "OUTDOOR", sortOrder: 11 },
  { name: "Kort 9", kind: "OUTDOOR", sortOrder: 12 },
];

export const RESERVATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const SLOT_OFFER_STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED"] as const;
export type SlotOfferStatus = (typeof SLOT_OFFER_STATUSES)[number];

export function levelIndex(level: OverallLevel): number {
  return OVERALL_LEVELS.indexOf(level);
}

export function formatTrDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(date);
}

export function formatTrDay(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Istanbul",
  }).format(date);
}

export function statusMessage(status: PlayerStatus, statusEnd?: string | null): string {
  if (status === "INJURED") {
    return statusEnd
      ? `Sakat – ${formatTrDate(statusEnd)} tarihine kadar aktif değil`
      : "Sakat – şu an aktif değil";
  }
  if (status === "PAUSED") return "Tenise ara verdi";
  if (status === "ON_HOLIDAY") return "Tatilde";
  if (status === "OUT_OF_TOWN") return "Şehir dışında";
  if (status === "LIMITED") return "Kısıtlı oynuyor";
  return "Maç yapabilir";
}

export function canManageClub(role: Role): boolean {
  return role === "ADMIN" || role === "CLUB_MANAGER";
}

export function canManageTournaments(role: Role): boolean {
  return role === "ADMIN" || role === "CLUB_MANAGER" || role === "TOURNAMENT_MANAGER";
}

export function purposesForRole(role: Role): CourtPurpose[] {
  if (role === "ADMIN") return ["MATCH", "TRAINING", "TOURNAMENT", "MAINTENANCE"];
  if (role === "TOURNAMENT_MANAGER") return ["MATCH", "TRAINING", "TOURNAMENT"];
  return ["MATCH", "TRAINING"];
}

export function istanbulNowParts(now = new Date()): { day: string; weekday: number } {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    weekday: "short",
  }).format(now);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day, weekday: map[weekdayName] ?? 0 };
}

export function canonicalTrPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `90${digits.slice(-10)}`;
}

export function waLink(number: string, name: string): string | null {
  const digits = canonicalTrPhone(number);
  if (!digits) return null;
  const text = encodeURIComponent(
    `Merhaba ${name}, Kort uygulamasından yazıyorum. Maç için uygun musun?`,
  );
  return `https://wa.me/${digits}?text=${text}`;
}

export function telLink(number: string): string | null {
  const digits = canonicalTrPhone(number);
  if (!digits) return null;
  return `tel:+${digits}`;
}
