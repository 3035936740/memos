import { type Space, SpaceMember_Role } from "@/types/proto/api/v1/space_service_pb";

/**
 * Helpers for sites with many Spaces. Up to SWITCHER_LIST_LIMIT the switcher lists them all; past that it lists the
 * current and recently opened ones and leaves the rest to the searchable Space directory.
 */
export const SWITCHER_LIST_LIMIT = 10;
/** Spaces the crowded switcher lists: the current one and the most recently opened. */
export const SWITCHER_RECENT_LIMIT = 6;

const RECENT_KEY_PREFIX = "memos-recent-spaces:";

const recentKey = (viewer: string) => `${RECENT_KEY_PREFIX}${viewer || "guest"}`;

/** Space names this viewer opened, newest first. */
export const readRecentSpaces = (viewer: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(recentKey(viewer)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === "string") : [];
  } catch {
    return [];
  }
};

export const recordRecentSpace = (viewer: string, spaceName: string) => {
  const names = [spaceName, ...readRecentSpaces(viewer).filter((name) => name !== spaceName)].slice(0, SWITCHER_RECENT_LIMIT);
  try {
    localStorage.setItem(recentKey(viewer), JSON.stringify(names));
  } catch {
    // Without storage the crowded switcher only lists the current Space.
  }
};

/** The current Space first, then recent ones, without repeats or Spaces no longer listed. */
export const pickSwitcherSpaces = (spaceByName: ReadonlyMap<string, Space>, recent: string[], current?: string): Space[] => {
  const names = current ? [current, ...recent] : recent;
  const picked: Space[] = [];
  for (const name of names) {
    const space = spaceByName.get(name);
    if (space && !picked.includes(space)) picked.push(space);
    if (picked.length === SWITCHER_RECENT_LIMIT) break;
  }
  return picked;
};

export const isJoinedSpace = (space: Space) => space.currentUserRole !== SpaceMember_Role.ROLE_UNSPECIFIED;

/** Whether `space` matches a search, by title, description or ID, ignoring case. */
export const matchesSpace = (space: Space, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [space.title, space.description, space.name, space.urlSlug].some((text) => text.toLowerCase().includes(needle));
};

/** `count` Spaces picked at random, without repeats. */
export const sampleSpaces = (spaces: readonly Space[], count: number, random = Math.random): Space[] => {
  const pool = [...spaces];
  const picked: Space[] = [];
  while (pool.length > 0 && picked.length < count) {
    picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return picked;
};
