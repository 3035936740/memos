import type { BlogStyle } from "./blog-style";

/** Dispatched on window to open the setup wizard again (Settings → System). */
export const OPEN_SETUP_EVENT = "memos-plus:open-setup";

const SETUP_DONE_KEY = "memos-plus-setup-done";

export type SiteType = "blog" | "community" | "team";

export const SITE_TYPES: SiteType[] = ["blog", "community", "team"];

export interface SitePreset {
  disallowUserRegistration: boolean;
  defaultMemberMemoVisibility: "PUBLIC" | "PROTECTED" | "PRIVATE";
  style: BlogStyle;
}

/**
 * What each kind of site starts with. A personal blog is closed to sign-ups and public; a community lets people
 * sign up but keeps members' memos to signed-in readers by default; a team log is closed and members-only.
 */
export const SITE_PRESETS: Record<SiteType, SitePreset> = {
  blog: { disallowUserRegistration: true, defaultMemberMemoVisibility: "PUBLIC", style: "handdrawn" },
  community: { disallowUserRegistration: false, defaultMemberMemoVisibility: "PROTECTED", style: "aero" },
  team: { disallowUserRegistration: true, defaultMemberMemoVisibility: "PROTECTED", style: "terminal" },
};

/** A fresh install: nothing about the site's identity or look has been set yet. */
export const looksUnconfigured = (setting: {
  customProfile?: { title: string };
  firstVisitDefaultStyle: string;
  firstVisitDefaultTheme: string;
}) => !setting.customProfile?.title && !setting.firstVisitDefaultStyle && !setting.firstVisitDefaultTheme;

export const isSetupDone = () => {
  try {
    return localStorage.getItem(SETUP_DONE_KEY) === "1";
  } catch {
    return true;
  }
};

export const markSetupDone = () => {
  try {
    localStorage.setItem(SETUP_DONE_KEY, "1");
  } catch {
    // Without storage the wizard simply stays closed once its settings are saved.
  }
};
