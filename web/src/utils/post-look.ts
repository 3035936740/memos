import { BLOG_STYLES, type BlogStyle, SECRET_BLOG_STYLES } from "./blog-style";
import { type ResolvedTheme, THEME_OPTIONS } from "./theme";

/** Tag prefixes an author puts on a post to choose its look: #style/vaporwave, #theme/neon-rain. */
export const STYLE_TAG_PREFIX = "style/";
export const THEME_TAG_PREFIX = "theme/";

/** The look an author chose for one post: a built-in style or a style pack, and a theme; any part may be missing. */
export interface PostLook {
  style?: BlogStyle;
  /** An enabled community style pack's id, used when the tag names no built-in style. */
  stylePack?: string;
  theme?: ResolvedTheme;
}

/** Styles a tag can pick. Secret styles stay something each reader unlocks. */
export const TAGGABLE_STYLES: readonly BlogStyle[] = BLOG_STYLES.filter((style) => !SECRET_BLOG_STYLES.includes(style));

/**
 * Theme names a tag can use: the short name from the theme's label ("neon-rain", "light", "dark") and its full id
 * ("neon-rain-dark", "default"). "system" is left out, it is not a look.
 */
export const THEME_TAG_NAMES: ReadonlyMap<string, ResolvedTheme> = new Map(
  THEME_OPTIONS.flatMap((option): Array<[string, ResolvedTheme]> => {
    if (option.value === "system") return [];
    return [
      [option.labelKey.replace(/^theme\./, ""), option.value],
      [option.value, option.value],
    ];
  }),
);

const tagValue = (tags: readonly string[], prefix: string) =>
  tags
    .map((tag) => tag.trim().toLowerCase())
    .find((tag) => tag.startsWith(prefix) && tag.length > prefix.length)
    ?.slice(prefix.length);

/**
 * The look a post's tags ask for. `stylePackIds` are the enabled packs a #style/ tag may also name. Unknown names are
 * ignored; the first tag of each kind wins.
 */
export const postLookOf = (tags: readonly string[], stylePackIds: readonly string[] = []): PostLook => {
  const styleName = tagValue(tags, STYLE_TAG_PREFIX);
  const themeName = tagValue(tags, THEME_TAG_PREFIX);
  const style = TAGGABLE_STYLES.find((candidate) => candidate === styleName);
  return {
    style,
    stylePack: !style && styleName && stylePackIds.includes(styleName) ? styleName : undefined,
    theme: themeName ? THEME_TAG_NAMES.get(themeName) : undefined,
  };
};

export const hasPostLook = (look: PostLook | undefined) => Boolean(look?.style || look?.stylePack || look?.theme);
