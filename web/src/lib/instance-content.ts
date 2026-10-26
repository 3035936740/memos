export interface InstanceNavigationItem {
  id: string;
  label: string;
  path: string;
  icon?: string;
  iconUrl?: string;
  access?: InstanceContentAccess;
}

export interface InstanceMarkdownPage {
  slug: string;
  title: string;
  markdown: string;
  access?: InstanceContentAccess;
  icon?: string;
  iconUrl?: string;
}

export interface InstanceMemoCategory {
  slug: string;
  title: string;
  description?: string;
  access?: InstanceContentAccess;
}

export type InstanceContentAccess = "public" | "authenticated" | "admin";

const parseArray = <T>(value: string): T[] => {
  if (!value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

/** Legacy location used before music, first-visit style and reset time gained dedicated backend fields. */
export const SITE_CONFIG_SLUG = "__site-config";

export type InstanceMusicMode = "random" | "sequential" | "reverse";

export interface InstanceMusicTrack {
  id: string;
  title: string;
  artist?: string;
  url: string;
}

export interface InstanceMusicConfig {
  enabled: boolean;
  /** Start playing on arrival (browsers may hold it until the visitor's first click when it is not muted). */
  autoplay: boolean;
  defaultMuted: boolean;
  /** Initial playback volume, from 0 to 1, before a visitor saves their own preference. */
  defaultVolume: number;
  mode: InstanceMusicMode;
  tracks: InstanceMusicTrack[];
}

export interface InstanceSiteConfig {
  music?: Partial<InstanceMusicConfig>;
  /** Blog 2 style shown to a browser that has not picked one yet. */
  firstVisitStyle?: string;
  /**
   * When the admin last ran "initialize all member preferences" (ms since epoch). Display preferences live in each
   * browser, so every browser resets its own once it sees a newer value than it last handled.
   */
  preferencesResetAt?: number;
}

export const DEFAULT_MUSIC_CONFIG: InstanceMusicConfig = {
  enabled: false,
  autoplay: true,
  defaultMuted: true,
  defaultVolume: 0.3,
  mode: "random",
  tracks: [],
};

/** Normalizes persisted/admin volume without allowing invalid values into the media element. */
export const normalizeMusicVolume = (value: unknown, fallback = DEFAULT_MUSIC_CONFIG.defaultVolume): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

type RawItem = Record<string, unknown>;

const isSiteConfigEntry = (item: RawItem) => item.slug === SITE_CONFIG_SLUG;

export const parseInstanceNavigation = (value: string) => parseArray<InstanceNavigationItem>(value);
export const parseInstancePages = (value: string) =>
  parseArray<InstanceMarkdownPage>(value).filter((page) => page.slug !== SITE_CONFIG_SLUG);
export const parseInstanceCategories = (value: string) => parseArray<InstanceMemoCategory>(value);

export const parseInstanceSiteConfig = (pagesJson: string): InstanceSiteConfig => {
  const entry = parseArray<RawItem>(pagesJson).find(isSiteConfigEntry);
  const config = entry?.config;
  return config && typeof config === "object" && !Array.isArray(config) ? (config as InstanceSiteConfig) : {};
};

const isTrack = (track: unknown): track is InstanceMusicTrack =>
  !!track && typeof track === "object" && typeof (track as InstanceMusicTrack).id === "string";

/** A track the player can load; the editor keeps the others too, since a newly added one has no link yet. */
export const isPlayableTrack = (track: InstanceMusicTrack) => typeof track.url === "string" && track.url.trim() !== "";

const parseMusicConfigJSON = (value: string): Partial<InstanceMusicConfig> | undefined => {
  if (!value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Partial<InstanceMusicConfig>) : undefined;
  } catch {
    return undefined;
  }
};

/** The music settings with every field filled in. The dedicated backend field wins; the reserved page is a legacy fallback. */
export const resolveMusicConfig = (config: InstanceSiteConfig, musicConfigJson = ""): InstanceMusicConfig => {
  const music = parseMusicConfigJSON(musicConfigJson) ?? config.music;
  const mode: InstanceMusicMode = music?.mode === "sequential" || music?.mode === "reverse" ? music.mode : "random";
  return {
    enabled: Boolean(music?.enabled),
    autoplay: music?.autoplay ?? DEFAULT_MUSIC_CONFIG.autoplay,
    defaultMuted: music?.defaultMuted ?? DEFAULT_MUSIC_CONFIG.defaultMuted,
    defaultVolume: normalizeMusicVolume(music?.defaultVolume),
    mode,
    tracks: Array.isArray(music?.tracks)
      ? music.tracks.filter(isTrack).map((track) => ({ ...track, title: track.title ?? "", url: track.url ?? "" }))
      : [],
  };
};

/** Writes the legacy site config into custom_pages_json and leaves every page untouched. */
export const withInstanceSiteConfig = (pagesJson: string, config: InstanceSiteConfig): string => {
  const items = parseArray<RawItem>(pagesJson).filter((item) => !isSiteConfigEntry(item));
  return JSON.stringify([...items, { slug: SITE_CONFIG_SLUG, title: "", markdown: "", access: "public", config }]);
};

/** Carries the site config of `previousPagesJson` over into freshly serialized pages, so editing pages never drops it. */
export const keepInstanceSiteConfig = (nextPagesJson: string, previousPagesJson: string): string => {
  const entry = parseArray<RawItem>(previousPagesJson).find(isSiteConfigEntry);
  if (!entry) return nextPagesJson;
  return JSON.stringify([...parseArray<RawItem>(nextPagesJson).filter((item) => !isSiteConfigEntry(item)), entry]);
};

export const canAccessInstanceContent = (access: InstanceContentAccess | undefined, user: { role?: number } | undefined): boolean => {
  if (!access || access === "public") return true;
  if (!user) return false;
  return access === "authenticated" || user.role === 2;
};
