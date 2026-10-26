import type { Translations } from "./i18n";

/**
 * Big visual styles for the Blog 2 layout. A colour theme only repaints; a style changes the
 * look itself (surfaces, type, page background). "default" is Blog 2 as it shipped.
 */
export const BLOG_STYLES = [
  "default",
  "glass",
  "neumorphism",
  "aero",
  "y2k",
  "vaporwave",
  "pixel",
  "handdrawn",
  "terminal",
  "golden",
] as const;

/** Hidden until the visitor has found every legendary reaction (see utils/blog-progress). */
export const SECRET_BLOG_STYLES: readonly string[] = ["golden"];

export type BlogStyle = (typeof BLOG_STYLES)[number];

export const DEFAULT_BLOG_STYLE: BlogStyle = "default";

export const isBlogStyle = (value: unknown): value is BlogStyle =>
  typeof value === "string" && (BLOG_STYLES as readonly string[]).includes(value);

/** Whether the styled Blog 2 layout is in use. Every style, the default included, dresses it. */
export const isStyledBlog = (feedLayout: string | undefined) => feedLayout === "blog2";

export const BLOG_STYLE_OPTIONS: Array<{ value: BlogStyle; labelKey: Translations }> = [
  { value: "default", labelKey: "blog-style.default" },
  { value: "glass", labelKey: "blog-style.glass" },
  { value: "neumorphism", labelKey: "blog-style.neumorphism" },
  { value: "aero", labelKey: "blog-style.aero" },
  { value: "y2k", labelKey: "blog-style.y2k" },
  { value: "vaporwave", labelKey: "blog-style.vaporwave" },
  { value: "pixel", labelKey: "blog-style.pixel" },
  { value: "handdrawn", labelKey: "blog-style.handdrawn" },
  { value: "terminal", labelKey: "blog-style.terminal" },
  { value: "golden", labelKey: "blog-style.golden" },
];

export const blogStyleLabelKey = (style: string): Translations =>
  BLOG_STYLE_OPTIONS.find((option) => option.value === style)?.labelKey ?? "blog-style.default";
