import type { StylePack } from "@/types/proto/api/v1/instance_service_pb";
import { BLOG_STYLES, type BlogStyle, DEFAULT_BLOG_STYLE, isBlogStyle } from "./blog-style";

/**
 * Community style packs (docs/style-packs-and-import-api.md): styles installed by the admin as compiled CSS, shown
 * on <html data-style="<pack id>"> beside the built-in ones. Built-in logic (reactions, music, easter eggs) keys on
 * BlogStyle, so a pack borrows the built-in style named in its `reactsLike`, or behaves like the default one.
 */

/** A pack id as the server accepts it: lower-case letters, digits and hyphens, never a built-in style's name. */
const STYLE_PACK_ID = /^[a-z0-9-]{3,32}$/;

export const isStylePackId = (value: unknown): value is string =>
  typeof value === "string" &&
  STYLE_PACK_ID.test(value) &&
  !(BLOG_STYLES as readonly string[]).includes(value) &&
  !value.startsWith("memos-");

/** The built-in style whose behaviour a pack borrows. */
export const stylePackBase = (pack: Pick<StylePack, "reactsLike"> | undefined): BlogStyle =>
  pack && isBlogStyle(pack.reactsLike) ? pack.reactsLike : DEFAULT_BLOG_STYLE;

/** A pack's name in the reader's language: exact locale, then its base language, then English, then any. */
export const stylePackLabel = (pack: Pick<StylePack, "id" | "name">, locale: string) => {
  const names = pack.name ?? {};
  const base = locale.split("-")[0];
  return names[locale] || names[base] || names.en || Object.values(names).find(Boolean) || pack.id;
};

/** The link element that carries the active pack's stylesheet. */
const LINK_ID = "memos-style-pack";

/** Loads one pack's stylesheet, replacing any other; undefined removes it. */
export const applyStylePackStylesheet = (cssUrl: string | undefined) => {
  const existing = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (!cssUrl) {
    existing?.remove();
    return;
  }
  if (existing?.getAttribute("href") === cssUrl) return;
  const link = existing ?? document.createElement("link");
  link.id = LINK_ID;
  link.rel = "stylesheet";
  link.href = cssUrl;
  if (!existing) document.head.appendChild(link);
};
