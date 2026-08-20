import abyssDarkThemeContent from "../themes/abyss-dark.css?raw";
import auroraDarkThemeContent from "../themes/aurora-dark.css?raw";
import candyPopThemeContent from "../themes/candy-pop.css?raw";
import cosmicDarkThemeContent from "../themes/cosmic-dark.css?raw";
import dawnThemeContent from "../themes/dawn.css?raw";
import defaultDarkThemeContent from "../themes/default-dark.css?raw";
import desertSandThemeContent from "../themes/desert-sand.css?raw";
import inkNightDarkThemeContent from "../themes/ink-night-dark.css?raw";
import lavenderThemeContent from "../themes/lavender.css?raw";
import matchaThemeContent from "../themes/matcha.css?raw";
import moonlitForestDarkThemeContent from "../themes/moonlit-forest-dark.css?raw";
import neonRainDarkThemeContent from "../themes/neon-rain-dark.css?raw";
import oceanBreezeThemeContent from "../themes/ocean-breeze.css?raw";
import paperThemeContent from "../themes/paper.css?raw";
import porcelainThemeContent from "../themes/porcelain.css?raw";
import retroNewspaperThemeContent from "../themes/retro-newspaper.css?raw";
import retroTerminalDarkThemeContent from "../themes/retro-terminal-dark.css?raw";
import sakuraDayThemeContent from "../themes/sakura-day.css?raw";
import sakuraNightDarkThemeContent from "../themes/sakura-night-dark.css?raw";
import twilightDarkThemeContent from "../themes/twilight-dark.css?raw";
import type { Translations } from "./i18n";

// ============================================================================
// Types and Constants
// ============================================================================

const VALID_THEMES = [
  "system",
  "default",
  "default-dark",
  "paper",
  "cosmic-dark",
  "twilight-dark",
  "aurora-dark",
  "abyss-dark",
  "neon-rain-dark",
  "moonlit-forest-dark",
  "retro-terminal-dark",
  "ink-night-dark",
  "sakura-night-dark",
  "dawn",
  "ocean-breeze",
  "matcha",
  "lavender",
  "sakura-day",
  "desert-sand",
  "porcelain",
  "retro-newspaper",
  "candy-pop",
] as const;

export type Theme = (typeof VALID_THEMES)[number];
export type ResolvedTheme = Exclude<Theme, "system">;

export interface ThemeOption {
  value: Theme;
  labelKey: Translations;
}

const STORAGE_KEY = "memos-theme";
const STYLE_ELEMENT_ID = "instance-theme";

const THEME_CONTENT: Record<ResolvedTheme, string | null> = {
  default: null,
  "default-dark": defaultDarkThemeContent,
  paper: paperThemeContent,
  "cosmic-dark": cosmicDarkThemeContent,
  "twilight-dark": twilightDarkThemeContent,
  "aurora-dark": auroraDarkThemeContent,
  "abyss-dark": abyssDarkThemeContent,
  "neon-rain-dark": neonRainDarkThemeContent,
  "moonlit-forest-dark": moonlitForestDarkThemeContent,
  "retro-terminal-dark": retroTerminalDarkThemeContent,
  "ink-night-dark": inkNightDarkThemeContent,
  "sakura-night-dark": sakuraNightDarkThemeContent,
  dawn: dawnThemeContent,
  "ocean-breeze": oceanBreezeThemeContent,
  matcha: matchaThemeContent,
  lavender: lavenderThemeContent,
  "sakura-day": sakuraDayThemeContent,
  "desert-sand": desertSandThemeContent,
  porcelain: porcelainThemeContent,
  "retro-newspaper": retroNewspaperThemeContent,
  "candy-pop": candyPopThemeContent,
};

const THEME_COLORS: Record<ResolvedTheme, string> = {
  default: "#faf9f5",
  "default-dark": "#1d1f23",
  paper: "#f5ede4",
  "cosmic-dark": "#0c1026",
  "twilight-dark": "#24172d",
  "aurora-dark": "#071b24",
  "abyss-dark": "#050d1a",
  "neon-rain-dark": "#100c20",
  "moonlit-forest-dark": "#0b1813",
  "retro-terminal-dark": "#071009",
  "ink-night-dark": "#151b23",
  "sakura-night-dark": "#201426",
  dawn: "#fff3e6",
  "ocean-breeze": "#eaf9fb",
  matcha: "#edf5e5",
  lavender: "#f4effc",
  "sakura-day": "#fff1f5",
  "desert-sand": "#f3e3c2",
  porcelain: "#f5f9fc",
  "retro-newspaper": "#eee3c8",
  "candy-pop": "#f3fbff",
};

export const THEME_OPTIONS: ThemeOption[] = [
  { value: "system", labelKey: "theme.system" },
  { value: "default", labelKey: "theme.light" },
  { value: "default-dark", labelKey: "theme.dark" },
  { value: "paper", labelKey: "theme.paper" },
  { value: "cosmic-dark", labelKey: "theme.cosmic" },
  { value: "twilight-dark", labelKey: "theme.twilight" },
  { value: "aurora-dark", labelKey: "theme.aurora" },
  { value: "abyss-dark", labelKey: "theme.abyss" },
  { value: "neon-rain-dark", labelKey: "theme.neon-rain" },
  { value: "moonlit-forest-dark", labelKey: "theme.moonlit-forest" },
  { value: "retro-terminal-dark", labelKey: "theme.retro-terminal" },
  { value: "ink-night-dark", labelKey: "theme.ink-night" },
  { value: "sakura-night-dark", labelKey: "theme.sakura-night" },
  { value: "dawn", labelKey: "theme.dawn" },
  { value: "ocean-breeze", labelKey: "theme.ocean-breeze" },
  { value: "matcha", labelKey: "theme.matcha" },
  { value: "lavender", labelKey: "theme.lavender" },
  { value: "sakura-day", labelKey: "theme.sakura-day" },
  { value: "desert-sand", labelKey: "theme.desert-sand" },
  { value: "porcelain", labelKey: "theme.porcelain" },
  { value: "retro-newspaper", labelKey: "theme.retro-newspaper" },
  { value: "candy-pop", labelKey: "theme.candy-pop" },
];

// ============================================================================
// Theme Validation and Detection
// ============================================================================

/**
 * Validates and normalizes a theme string to a valid theme.
 * Falls back to "default" for invalid themes.
 */
const validateTheme = (theme: string): Theme => {
  return VALID_THEMES.includes(theme as Theme) ? (theme as Theme) : "default";
};

export const isValidTheme = (theme: string | undefined | null): theme is Theme => {
  return Boolean(theme && VALID_THEMES.includes(theme as Theme));
};

/**
 * Detects the system's preferred color scheme.
 * @returns "default-dark" for dark mode, "default" for light mode
 */
export const getSystemTheme = (): ResolvedTheme => {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "default-dark";
  }
  return "default";
};

/**
 * Resolves "system" theme to the actual theme based on OS preference.
 * Other themes are returned as-is after validation.
 */
export const resolveTheme = (theme: string): ResolvedTheme => {
  const validTheme = validateTheme(theme);
  return validTheme === "system" ? getSystemTheme() : validTheme;
};

// ============================================================================
// LocalStorage Helpers
// ============================================================================

/**
 * Safely reads the theme from localStorage.
 * @returns The stored theme, or null if not found or unavailable
 */
const getStoredTheme = (): Theme | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && VALID_THEMES.includes(stored as Theme) ? (stored as Theme) : null;
  } catch {
    return null;
  }
};

/**
 * Safely stores the theme to localStorage.
 */
const setStoredTheme = (theme: Theme): void => {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage might not be available (SSR, private browsing, etc.)
  }
};

// ============================================================================
// Theme Selection with Fallbacks
// ============================================================================

/**
 * Gets the theme for initial page load (before user settings are available).
 * Priority: localStorage -> backward-compatible Cosmic fallback
 */
export const getInitialTheme = (): Theme => {
  return getStoredTheme() ?? "cosmic-dark";
};

/**
 * Gets the theme with full fallback chain.
 * Priority:
 * 1. User setting (if logged in and has preference)
 * 2. localStorage (from previous session)
 * 3. Instance first-visit default
 * 4. Backward-compatible Cosmic fallback
 */
export const getThemeWithFallback = (userTheme?: string, instanceTheme?: string): Theme => {
  // Priority 1: User setting
  if (userTheme && VALID_THEMES.includes(userTheme as Theme)) {
    return userTheme as Theme;
  }

  // Priority 2: localStorage
  const stored = getStoredTheme();
  if (stored) {
    return stored;
  }

  // Priority 3: Instance default for first-time visitors
  if (isValidTheme(instanceTheme)) {
    return instanceTheme;
  }

  // Priority 4: Backward-compatible application default
  return "cosmic-dark";
};

// ============================================================================
// DOM Manipulation
// ============================================================================

/**
 * Removes the existing theme style element from the DOM.
 */
const removeThemeStyle = (): void => {
  document.getElementById(STYLE_ELEMENT_ID)?.remove();
};

/**
 * Injects theme CSS into the document head.
 * Skips injection for the default theme (uses base CSS).
 */
const injectThemeStyle = (theme: ResolvedTheme): void => {
  removeThemeStyle();

  if (theme === "default") {
    return; // Use base CSS for default theme
  }

  const css = THEME_CONTENT[theme];
  if (css) {
    const style = document.createElement("style");
    style.id = STYLE_ELEMENT_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }
};

/**
 * Sets the data-theme attribute on the document element.
 * This allows CSS to react to the current theme.
 */
const setThemeAttribute = (theme: ResolvedTheme): void => {
  document.documentElement.setAttribute("data-theme", theme);
};

/**
 * Updates the theme-color meta tag to match the current theme background.
 * This colors the browser/status bar on mobile devices.
 */
const updateThemeColorMeta = (theme: ResolvedTheme): void => {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content = THEME_COLORS[theme];
  }
};

const isDarkTheme = (theme: ResolvedTheme): boolean => {
  return theme.endsWith("-dark") || theme.endsWith(".dark");
};

/**
 * Updates the browser native control color scheme to match the current theme.
 */
const updateColorScheme = (theme: ResolvedTheme): void => {
  document.documentElement.style.colorScheme = isDarkTheme(theme) ? "dark" : "light";
};

// ============================================================================
// Main Theme Loading
// ============================================================================

/**
 * Loads and applies a theme.
 * This function:
 * 1. Validates the theme
 * 2. Resolves "system" to actual theme
 * 3. Injects theme CSS
 * 4. Sets data-theme attribute
 * 5. Updates browser native UI colors
 * 6. Persists to localStorage
 */
export const loadTheme = (themeName: string, options: { persist?: boolean } = {}): void => {
  const validTheme = validateTheme(themeName);
  const resolvedTheme = resolveTheme(validTheme);

  injectThemeStyle(resolvedTheme);
  setThemeAttribute(resolvedTheme);
  updateThemeColorMeta(resolvedTheme);
  updateColorScheme(resolvedTheme);
  if (options.persist !== false) {
    setStoredTheme(validTheme); // Store original theme preference (not resolved)
  }
};

/**
 * Applies theme early during initial page load to prevent FOUC.
 * Uses only localStorage and system preference (no user settings yet).
 */
export const applyThemeEarly = (): void => {
  const theme = getInitialTheme();
  loadTheme(theme, { persist: false });
};

// ============================================================================
// System Theme Listener
// ============================================================================

/**
 * Sets up a listener for OS-level theme preference changes.
 * Supports both modern (addEventListener) and legacy (addListener) APIs.
 *
 * @param onThemeChange - Callback invoked when system theme changes
 * @returns Cleanup function to remove the listener
 */
export const setupSystemThemeListener = (onThemeChange: () => void): (() => void) => {
  // Guard against SSR
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  // Modern API (preferred)
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener("change", onThemeChange);
    return () => mediaQuery.removeEventListener("change", onThemeChange);
  }

  // Legacy API (Safari < 14)
  if (mediaQuery.addListener) {
    mediaQuery.addListener(onThemeChange);
    return () => mediaQuery.removeListener(onThemeChange);
  }

  return () => {};
};
