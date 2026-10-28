import { isBlogStyle } from "./blog-style";
import { isValidTheme } from "./theme";

/**
 * Appearance packs: a site's look (first-visit style and theme, default background, custom CSS) as a file that
 * another Memos Plus site can import. Scripts never travel in a pack, and neither does anything that identifies
 * the site (title, logo, music, pages).
 */
export const APPEARANCE_PACK_KIND = "memos-plus.appearance";
export const APPEARANCE_PACK_VERSION = 1;
/** Custom CSS larger than this is refused; a look does not need more. */
export const APPEARANCE_PACK_MAX_CSS = 200_000;

export interface Appearance {
  firstVisitDefaultStyle: string;
  firstVisitDefaultTheme: string;
  defaultBackgroundImageUrl: string;
  additionalStyle: string;
}

export interface AppearancePack {
  kind: typeof APPEARANCE_PACK_KIND;
  version: number;
  name: string;
  exportedAt: string;
  appearance: Appearance;
}

/** The block the "powered by" switch writes into the custom CSS; it belongs to one site and is left out of packs. */
const POWERED_BY_MARKER = "/* memos-plus: hide powered-by */";
const POWERED_BY_BLOCK = `${POWERED_BY_MARKER}\n[data-powered-by] {\n  display: none;\n}`;

export const isPoweredByHidden = (css: string) => css.includes(POWERED_BY_MARKER);

const withoutPoweredByBlock = (css: string) => css.replace(POWERED_BY_BLOCK, "").replace(POWERED_BY_MARKER, "").trim();

export const setPoweredByHidden = (css: string, hidden: boolean) => {
  const rest = withoutPoweredByBlock(css);
  if (!hidden) return rest;
  return rest ? `${rest}\n\n${POWERED_BY_BLOCK}` : POWERED_BY_BLOCK;
};

export const buildAppearancePack = (appearance: Appearance, name: string, now = new Date()): AppearancePack => ({
  kind: APPEARANCE_PACK_KIND,
  version: APPEARANCE_PACK_VERSION,
  name,
  exportedAt: now.toISOString(),
  appearance: {
    firstVisitDefaultStyle: appearance.firstVisitDefaultStyle,
    firstVisitDefaultTheme: appearance.firstVisitDefaultTheme,
    defaultBackgroundImageUrl: appearance.defaultBackgroundImageUrl,
    additionalStyle: withoutPoweredByBlock(appearance.additionalStyle),
  },
});

export type AppearancePackError = "invalid" | "version" | "too-large";

const textField = (value: unknown) => (typeof value === "string" ? value : "");

/** Reads a pack file; unknown styles and themes are dropped rather than imported. */
export const parseAppearancePack = (text: string): { pack: AppearancePack } | { error: AppearancePackError } => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "invalid" };
  }
  if (!raw || typeof raw !== "object") return { error: "invalid" };
  const value = raw as Record<string, unknown>;
  if (value.kind !== APPEARANCE_PACK_KIND || !value.appearance || typeof value.appearance !== "object") return { error: "invalid" };
  if (typeof value.version !== "number" || value.version > APPEARANCE_PACK_VERSION) return { error: "version" };
  const appearance = value.appearance as Record<string, unknown>;
  const additionalStyle = textField(appearance.additionalStyle);
  if (additionalStyle.length > APPEARANCE_PACK_MAX_CSS) return { error: "too-large" };
  const style = textField(appearance.firstVisitDefaultStyle);
  const theme = textField(appearance.firstVisitDefaultTheme);
  return {
    pack: {
      kind: APPEARANCE_PACK_KIND,
      version: value.version,
      name: textField(value.name).slice(0, 80),
      exportedAt: textField(value.exportedAt),
      appearance: {
        firstVisitDefaultStyle: isBlogStyle(style) ? style : "",
        firstVisitDefaultTheme: isValidTheme(theme) ? theme : "",
        defaultBackgroundImageUrl: textField(appearance.defaultBackgroundImageUrl),
        additionalStyle: withoutPoweredByBlock(additionalStyle),
      },
    },
  };
};

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
};

/**
 * Other sites the pack would make every visitor's browser contact (fonts, images, @import), so the admin can see
 * them before importing; such requests tell those sites who visits.
 */
export const externalHostsOf = (appearance: Appearance): string[] => {
  const urls = [appearance.defaultBackgroundImageUrl];
  for (const match of appearance.additionalStyle.matchAll(/url\(\s*["']?([^"')\s]+)|@import\s+["']([^"']+)/gi)) {
    urls.push(match[1] ?? match[2] ?? "");
  }
  const hosts = urls.filter((url) => /^(?:https?:)?\/\//i.test(url)).map((url) => hostOf(url.startsWith("//") ? `https:${url}` : url));
  return [...new Set(hosts.filter((host): host is string => !!host))];
};
