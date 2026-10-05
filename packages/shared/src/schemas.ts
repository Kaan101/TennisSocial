import { z } from "zod";
import {
  BACKHAND_TYPES,
  COURT_TYPES,
  DOMINANT_HANDS,
  GENDERS,
  MATCH_FORMATS,
  MATCH_SIDES,
  OVERALL_LEVELS,
  PLAY_PREFERENCES,
  PLAYER_STATUSES,
  PREFERRED_TIMES,
  ROLES,
  SET_FORMATS,
  SKILLS,
  TOURNAMENT_DIVISIONS,
  TOURNAMENT_FORMATS,
  TOURNAMENT_STATUSES,
  VISIBILITIES,
  GROUP_VISIBILITIES,
  TENNIS_TYPES,
  AGE_GROUPS,
  PERSON_PROFILES,
  COURT_KINDS,
  COURT_PURPOSES,
  RESERVATION_STATUSES,
  AVAILABILITY_STATES,
} from "./constants";

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Saat HH:mm olmalı");
export const hourSchema = z.string().regex(/^(?:[01]\d|2[0-3]):00$/, "Saat tam saat olmalı");
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-MM-DD olmalı");

export const passwordSchema = z
  .string()
  .min(8, "Parola en az 8 karakter olmalı")
  .max(100)
  .regex(/[A-Za-z]/, "Parola en az bir harf içermeli")
  .regex(/[0-9]/, "Parola en az bir rakam içermeli");

export const registerSchema = z.object({
  email: z.string().trim().email("Geçerli bir e-posta yaz").max(200),
  password: passwordSchema,
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(100),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});

export const forgotSchema = z.object({
  email: z.string().trim().email(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const queryBool = z.preprocess((value) => {
  if (value === undefined || value === "") return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return value;
}, z.boolean().optional());

export const profileUpdateSchema = z.object({
  firstName: z.string().trim().min(2).max(60).optional(),
  lastName: z.string().trim().min(2).max(60).optional(),
  birthYear: z.number().int().min(1930).max(new Date().getFullYear() - 8).nullable().optional(),
  gender: z.enum(GENDERS).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  whatsapp: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  district: z.string().trim().max(80).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  playerStatus: z.enum(PLAYER_STATUSES).optional(),
  tennisType: z.enum(TENNIS_TYPES).optional(),
  ageGroup: z.enum(AGE_GROUPS).optional(),
  personProfile: z.enum(PERSON_PROFILES).optional(),
  statusNote: z.string().trim().max(200).nullable().optional(),
  statusStart: dateSchema.nullable().optional(),
  statusEnd: dateSchema.nullable().optional(),
  clubJoinDate: dateSchema.optional(),
});

export const roleChangeSchema = z.object({
  role: z.enum(ROLES),
});

export const skillValueSchema = z.object({
  skill: z.enum(SKILLS),
  value: z.number().min(1).max(10),
});

export const tennisProfileSchema = z.object({
  tennisStartYear: z.number().int().min(1950).max(new Date().getFullYear()).nullable().optional(),
  dominantHand: z.enum(DOMINANT_HANDS).nullable().optional(),
  backhandType: z.enum(BACKHAND_TYPES).nullable().optional(),
  preferredCourt: z.enum(COURT_TYPES).nullable().optional(),
  playPreference: z.enum(PLAY_PREFERENCES).optional(),
  preferredPlayTimes: z.array(z.enum(PREFERRED_TIMES)).max(4).optional(),
  overallLevel: z.enum(OVERALL_LEVELS).optional(),
  ntrp: z.number().min(1).max(7).nullable().optional(),
  skills: z.array(skillValueSchema).max(SKILLS.length).optional(),
});

export const racketSchema = z.object({
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(80),
  headSize: z.string().trim().max(20).nullable().optional(),
  weight: z.string().trim().max(20).nullable().optional(),
  stringName: z.string().trim().max(60).nullable().optional(),
  tension: z.string().trim().max(20).nullable().optional(),
  gripSize: z.string().trim().max(20).nullable().optional(),
  isPrimary: z.boolean().optional(),
});

export const weeklyWindowSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
  note: z.string().trim().max(120).nullable().optional(),
});

export const oneOffWindowSchema = z.object({
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  note: z.string().trim().max(120).nullable().optional(),
});

export const availabilityPutSchema = z.object({
  weekly: z.array(weeklyWindowSchema).max(21),
  oneOff: z.array(oneOffWindowSchema).max(30).default([]),
});

export const availabilityCellSchema = z.object({
  date: dateSchema,
  startTime: hourSchema,
  state: z.enum(AVAILABILITY_STATES).nullable(),
});

export const availabilityMonthCopySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Ay YYYY-MM olmalı"),
});

export const privacySchema = z.object({
  phoneVisibility: z.enum(VISIBILITIES).optional(),
  whatsappVisibility: z.enum(VISIBILITIES).optional(),
  emailVisibility: z.enum(VISIBILITIES).optional(),
  addressVisibility: z.enum(VISIBILITIES).optional(),
  birthYearVisibility: z.enum(VISIBILITIES).optional(),
  availabilityVisibility: z.enum(VISIBILITIES).optional(),
  matchHistoryVisibility: z.enum(VISIBILITIES).optional(),
  tennisProfileVisibility: z.enum(VISIBILITIES).optional(),
  activityVisibility: z.enum(VISIBILITIES).optional(),
});

export const playerSearchSchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  overallLevel: z.enum(OVERALL_LEVELS).optional(),
  forehandMin: z.coerce.number().min(1).max(10).optional(),
  backhandMin: z.coerce.number().min(1).max(10).optional(),
  serveMin: z.coerce.number().min(1).max(10).optional(),
  ageMin: z.coerce.number().int().min(8).max(100).optional(),
  ageMax: z.coerce.number().int().min(8).max(100).optional(),
  district: z.string().trim().max(80).optional(),
  groupId: z.string().min(1).optional(),
  availableToday: queryBool,
  availableWeekend: queryBool,
  activeOnly: queryBool,
  playPreference: z.enum(PLAY_PREFERENCES).optional(),
  backhandType: z.enum(BACKHAND_TYPES).optional(),
});

export const groupCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  imageUrl: z.string().trim().url().max(400).nullable().optional(),
  visibility: z.enum(GROUP_VISIBILITIES).default("PUBLIC"),
  tennisType: z.enum(TENNIS_TYPES),
  ageGroup: z.enum(AGE_GROUPS).default("AGE_18_35"),
});

export const groupUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  imageUrl: z.string().trim().url().max(400).nullable().optional(),
  visibility: z.enum(GROUP_VISIBILITIES).optional(),
  tennisType: z.enum(TENNIS_TYPES).optional(),
  ageGroup: z.enum(AGE_GROUPS).optional(),
});

export const groupMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["MANAGER", "MEMBER"]).default("MEMBER"),
});

export const groupEventSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  startsAt: z.string().datetime(),
  location: z.string().trim().max(120).nullable().optional(),
});

export const challengeCreateSchema = z.object({
  format: z.enum(MATCH_FORMATS),
  recipientId: z.string().min(1),
  challengerPartnerId: z.string().min(1).nullable().optional(),
  recipientPartnerId: z.string().min(1).nullable().optional(),
  proposedDate: dateSchema,
  proposedTime: timeSchema,
  court: z.string().trim().max(80).nullable().optional(),
  setFormat: z.enum(SET_FORMATS).default("BEST_OF_3"),
  note: z.string().trim().max(300).nullable().optional(),
  groupId: z.string().min(1).nullable().optional(),
  ladderId: z.string().min(1).nullable().optional(),
});

export const challengeCounterSchema = z.object({
  proposedDate: dateSchema,
  proposedTime: timeSchema,
  note: z.string().trim().max(300).nullable().optional(),
});

export const matchPlayerSchema = z.object({
  userId: z.string().min(1),
  side: z.enum(MATCH_SIDES),
});

export const matchCreateSchema = z.object({
  format: z.enum(MATCH_FORMATS),
  scheduledDate: dateSchema,
  scheduledTime: timeSchema,
  court: z.string().trim().max(80).nullable().optional(),
  setFormat: z.enum(SET_FORMATS).default("BEST_OF_3"),
  note: z.string().trim().max(300).nullable().optional(),
  groupId: z.string().min(1).nullable().optional(),
  players: z.array(matchPlayerSchema).min(2).max(4),
});

export const matchResultSchema = z.object({
  score: z
    .string()
    .trim()
    .regex(/^(\d{1,2}-\d{1,2})(\s+\d{1,2}-\d{1,2}){0,4}$/, "Skor örneği: 6-4 7-5"),
  winnerSide: z.enum(MATCH_SIDES),
  note: z.string().trim().max(300).nullable().optional(),
});

export const tournamentCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  startDate: dateSchema,
  endDate: dateSchema.nullable().optional(),
  registrationDeadline: dateSchema.nullable().optional(),
  status: z.enum(TOURNAMENT_STATUSES).default("REGISTRATION_OPEN"),
  format: z.enum(TOURNAMENT_FORMATS).default("SINGLE_ELIMINATION"),
  division: z.enum(TOURNAMENT_DIVISIONS).default("SINGLES"),
  location: z.string().trim().max(120).nullable().optional(),
  maxPlayers: z.number().int().min(2).max(128).nullable().optional(),
  minLevel: z.enum(OVERALL_LEVELS).nullable().optional(),
  maxLevel: z.enum(OVERALL_LEVELS).nullable().optional(),
  courts: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  setFormat: z.enum(SET_FORMATS).default("BEST_OF_3"),
  rules: z.string().trim().max(4000).nullable().optional(),
  pointsWin: z.number().int().min(0).max(20).optional(),
  pointsLoss: z.number().int().min(0).max(20).optional(),
  groupSize: z.number().int().min(2).max(16).optional(),
  qualifiersPerGroup: z.number().int().min(1).max(8).optional(),
  groupId: z.string().min(1).nullable().optional(),
});

export const tournamentUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.nullable().optional(),
  registrationDeadline: dateSchema.nullable().optional(),
  status: z.enum(TOURNAMENT_STATUSES).optional(),
  format: z.enum(TOURNAMENT_FORMATS).optional(),
  division: z.enum(TOURNAMENT_DIVISIONS).optional(),
  location: z.string().trim().max(120).nullable().optional(),
  maxPlayers: z.number().int().min(2).max(128).nullable().optional(),
  minLevel: z.enum(OVERALL_LEVELS).nullable().optional(),
  maxLevel: z.enum(OVERALL_LEVELS).nullable().optional(),
  courts: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  setFormat: z.enum(SET_FORMATS).optional(),
  rules: z.string().trim().max(4000).nullable().optional(),
  pointsWin: z.number().int().min(0).max(20).optional(),
  pointsLoss: z.number().int().min(0).max(20).optional(),
  groupSize: z.number().int().min(2).max(16).optional(),
  qualifiersPerGroup: z.number().int().min(1).max(8).optional(),
  groupId: z.string().min(1).nullable().optional(),
});

export const tournamentRegisterSchema = z.object({
  userId: z.string().min(1).optional(),
});

export const tournamentResultSchema = z.object({
  score: z
    .string()
    .trim()
    .regex(/^(\d{1,2}-\d{1,2})(\s+\d{1,2}-\d{1,2}){0,4}$/, "Skor örneği: 6-4 7-5"),
  winnerSide: z.enum(MATCH_SIDES),
});

export const tournamentPointsSchema = z.object({
  pointsWin: z.number().int().min(0).max(20),
  pointsLoss: z.number().int().min(0).max(20),
});

export const announcementSchema = z.object({
  title: z.string().trim().min(2).max(140),
  body: z.string().trim().min(2).max(2000),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const friendRequestSchema = z.object({
  userId: z.string().min(1),
});

export const clubCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  hasRestaurant: z.boolean().optional(),
  hasFitness: z.boolean().optional(),
});

export const clubUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  hasRestaurant: z.boolean().optional(),
  hasFitness: z.boolean().optional(),
});

export const courtCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  clubId: z.string().min(1),
  kind: z.enum(COURT_KINDS).optional(),
});

export const courtUpdateSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  active: z.boolean().optional(),
  kind: z.enum(COURT_KINDS).optional(),
});

export const courtReservationSchema = z.object({
  courtId: z.string().min(1),
  purpose: z.enum(COURT_PURPOSES),
  startDate: dateSchema,
  endDate: dateSchema,
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startTime: hourSchema,
  endTime: hourSchema,
  partnerId: z.string().min(1).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

export const reservationListSchema = paginationSchema.extend({
  status: z.enum(RESERVATION_STATUSES).optional(),
});

export const reservationCheckInSchema = z.object({
  date: dateSchema,
  startTime: hourSchema,
});

export const boardWeekSchema = z.object({
  week: dateSchema.optional(),
  club: z.string().min(1).optional(),
});

export const courtRangeSchema = z.object({
  date: dateSchema,
  start: hourSchema,
  end: hourSchema,
  club: z.string().min(1).optional(),
});

export const courtDaySchema = z.object({
  date: dateSchema.optional(),
  club: z.string().min(1).optional(),
});

export const courtSlotSchema = z.object({
  date: dateSchema,
  courtId: z.string().min(1),
  hour: hourSchema,
});

export const slotParticipantsSchema = z.object({
  courtId: z.string().min(1),
  date: dateSchema,
  startTime: hourSchema,
  userIds: z.array(z.string().min(1)).max(500),
  groupIds: z.array(z.string().min(1)).max(500),
});

export const boardVisibilitySchema = z.object({
  visible: z.boolean(),
});

export const checkInLeadSchema = z.object({
  hours: z.number().int().min(0).max(72),
});

export const slotOfferSchema = z.object({
  toUserId: z.string().min(1),
  date: dateSchema,
  startTime: hourSchema,
});

export const slotOfferListSchema = z.object({
  scope: z.enum(["incoming", "outgoing"]).default("incoming"),
});

export const ladderCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  clubId: z.string().min(1),
});

export const ladderEnsureSchema = z.object({
  clubId: z.string().min(1),
});

export const ladderPlayerSchema = z.object({
  userId: z.string().min(1),
});

export const ladderListSchema = z.object({
  clubId: z.string().min(1).optional(),
});

export const matchOfferCreateSchema = z.object({
  toUserId: z.string().min(1),
  clubId: z.string().min(1),
  ladderId: z.string().min(1).optional(),
});

export const matchOfferResultSchema = z.object({
  winnerId: z.string().min(1),
});

export const matchOfferScheduleSchema = z.object({
  date: dateSchema,
});

export const matchOfferListSchema = z.object({
  clubId: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type TennisProfileInput = z.infer<typeof tennisProfileSchema>;
export type PlayerSearchInput = z.infer<typeof playerSearchSchema>;
export type ChallengeCreateInput = z.infer<typeof challengeCreateSchema>;
export type MatchCreateInput = z.infer<typeof matchCreateSchema>;
export type MatchResultInput = z.infer<typeof matchResultSchema>;
