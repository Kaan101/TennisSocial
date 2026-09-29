import type { Role, Visibility } from "@club/shared";

export type Viewer = { id: string; role: Role; email: string };

export function canViewField(
  level: Visibility,
  viewer: Viewer | null,
  ownerId: string,
  isFriend: boolean,
): { allowed: boolean; override: boolean } {
  if (viewer && viewer.id === ownerId) return { allowed: true, override: false };
  const allowedByRule =
    level === "PUBLIC" ? true : level === "MEMBERS" ? viewer !== null : level === "FRIENDS" ? isFriend : false;
  if (allowedByRule) return { allowed: true, override: false };
  if (viewer && (viewer.role === "ADMIN" || viewer.role === "CLUB_MANAGER")) {
    return { allowed: true, override: true };
  }
  return { allowed: false, override: false };
}

export function isPlayableStatus(status: string): boolean {
  return status === "ACTIVE" || status === "LIMITED";
}
