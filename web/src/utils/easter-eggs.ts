/** Public, persisted IDs; keep in sync with the backend's validation list. */
export const EASTER_EGGS = [
  "konami",
  "cursor-trail",
  "terminal",
  "vim-navigation",
  "midnight",
  "glitch",
  "pixel-boss",
  "shiny-cards",
  "achievements",
  "rain",
  "cat",
  "travel",
  "birthday",
  "void",
  "teapot",
  "museum",
  "time-machine",
] as const;

export type EasterEgg = (typeof EASTER_EGGS)[number];

interface EasterEggSetting {
  disableEasterEggs?: boolean;
  disabledEasterEggs?: readonly string[];
}

/** Missing fields on an existing instance preserve its previous behavior. */
export const isEasterEggEnabled = (setting: EasterEggSetting, id: EasterEgg) =>
  !setting.disableEasterEggs && !setting.disabledEasterEggs?.includes(id);
