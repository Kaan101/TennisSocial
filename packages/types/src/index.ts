import type {
  ChallengeStatus,
  MatchFormat,
  MatchSide,
  MatchStatus,
  OverallLevel,
  PlayerStatus,
  PlayPreference,
  Role,
  SetFormat,
  AgeGroup,
  PersonProfile,
  SkillName,
  TennisType,
  Visibility,
  LadderContactVisibility,
} from "@club/shared";

export type { LadderContactVisibility } from "@club/shared";

export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
};

export type PlayerCard = {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  district: string | null;
  city: string | null;
  overallLevel: OverallLevel | null;
  overallLabel: string | null;
  playerStatus: PlayerStatus;
  statusLabel: string;
  statusMessage: string;
  tennisType: TennisType;
  ageGroup: AgeGroup;
  personProfile: PersonProfile;
  forehand: number | null;
  backhand: number | null;
  serve: number | null;
  primaryRacket: { brand: string; model: string } | null;
  canChallenge: boolean;
  canCall: boolean;
  canWhatsapp: boolean;
  phone: string | null;
  whatsapp: string | null;
  availableToday: boolean;
};

export type RadarPoint = { axis: string; value: number };

export type UserDetail = {
  id: string;
  role: Role | null;
  email: string | null;
  profile: {
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    birthYear: number | null;
    gender: string | null;
    phone: string | null;
    whatsapp: string | null;
    address: string | null;
    district: string | null;
    city: string | null;
    clubJoinDate: string;
    bio: string | null;
    playerStatus: PlayerStatus;
    tennisType: TennisType;
    ageGroup: AgeGroup;
    personProfile: PersonProfile;
    statusLabel: string;
    statusMessage: string;
    statusNote: string | null;
    statusStart: string | null;
    statusEnd: string | null;
    ladderContactVisibility: LadderContactVisibility;
  };
  permissions: {
    canEdit: boolean;
    canCall: boolean;
    canWhatsapp: boolean;
    canViewTennis: boolean;
    canViewAvailability: boolean;
    canViewMatches: boolean;
    canChallenge: boolean;
    isSelf: boolean;
    isFriend: boolean;
  };
  tennis: null | {
    overallLevel: OverallLevel;
    overallLabel: string;
    ntrp: number | null;
    dominantHand: string | null;
    backhandType: string | null;
    preferredCourt: string | null;
    playPreference: PlayPreference;
    playPreferenceLabel: string;
    preferredPlayTimes: string[];
    tennisStartYear: number | null;
    skills: { skill: SkillName; label: string; value: number }[];
    radar: RadarPoint[];
  };
  rackets: {
    id: string;
    brand: string;
    model: string;
    headSize: string | null;
    weight: string | null;
    stringName: string | null;
    tension: string | null;
    gripSize: string | null;
    isPrimary: boolean;
  }[];
  stats: null | {
    matches: number;
    wins: number;
    losses: number;
    winRate: number;
    setsWon: number;
    setsLost: number;
    gamesWon: number;
    gamesLost: number;
    headToHead: null | { played: number; wins: number; losses: number };
    lastFive: {
      id: string;
      scheduledAt: string;
      score: string | null;
      won: boolean;
      opponents: string[];
      format: MatchFormat;
    }[];
  };
  privacy?: Record<string, Visibility>;
};

export type MatchSummary = {
  id: string;
  format: MatchFormat;
  formatLabel: string;
  scheduledAt: string;
  court: string | null;
  setFormat: SetFormat;
  setFormatLabel: string;
  score: string | null;
  winnerSide: MatchSide | null;
  note: string | null;
  status: MatchStatus;
  players: { userId: string; name: string; side: MatchSide; photoUrl: string | null }[];
  canRecordResult: boolean;
};

export type ChallengeSummary = {
  id: string;
  format: MatchFormat;
  formatLabel: string;
  status: ChallengeStatus;
  proposedDate: string;
  proposedTime: string;
  counterDate: string | null;
  counterTime: string | null;
  counterNote: string | null;
  court: string | null;
  setFormat: SetFormat;
  setFormatLabel: string;
  note: string | null;
  challenger: { id: string; name: string };
  recipient: { id: string; name: string };
  awaitingUserId: string | null;
  matchId: string | null;
  canRespond: boolean;
  canCancel: boolean;
};

export type HomePayload = {
  greetingName: string;
  dateLabel: string;
  stats: {
    availableToday: number;
    upcomingMatches: number;
    openChallenges: number;
    activeTournaments: number;
  };
  availableToday: PlayerCard[];
  upcomingMatches: MatchSummary[];
  newChallenges: ChallengeSummary[];
  tournaments: { id: string; name: string; status: string; startDate: string; location: string | null }[];
  announcements: { id: string; title: string; body: string; publishedAt: string; authorName: string }[];
  suggested: Suggestion[];
  activity: { id: string; type: string; title: string; body: string; actorName: string; createdAt: string; link: string | null }[];
};

export type Suggestion = {
  user: PlayerCard;
  score: number;
  reasons: string[];
};
