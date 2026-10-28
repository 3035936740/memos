/**
 * Low-power mode: on weak devices the styles keep their looks but drop the costly motion (particle canvases, the
 * rain shader, animated scenes, background blur). The visitor can force it on or off in Preferences; "auto" turns it
 * on for devices that report little memory, ask to save data, or turn out to animate slowly. Core counts are left
 * out: they say little about the graphics, and plenty of capable laptops have few.
 *
 * The visitor's system-wide "reduce motion" setting always wins: "full" never brings back motion they turned off.
 */

export type EffectsMode = "auto" | "full" | "lite";

export const EFFECTS_MODES: readonly EffectsMode[] = ["auto", "full", "lite"];

/** Fired on window whenever low-power mode turns on or off. */
export const EFFECTS_CHANGE_EVENT = "memos-plus:effects-change";

const MODE_KEY = "memos-plus-effects";
/** Set for the rest of the session once the frame-rate check found this device slow. */
const SLOW_SESSION_KEY = "memos-plus-effects-slow";

/** Below this many frames a second the animations are visibly stuttering. */
const SLOW_FPS = 24;
/** The check waits for the page to settle, then times this many frames. */
const SETTLE_MS = 5000;
const SAMPLE_FRAMES = 90;

interface DeviceHints {
  /** Gigabytes, rounded down by the browser; Chromium only. */
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

const readStorage = (storage: () => Storage, key: string) => {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (storage: () => Storage, key: string, value: string) => {
  try {
    storage().setItem(key, value);
  } catch {
    // Not remembered; the default applies next time.
  }
};

export const readEffectsMode = (): EffectsMode => {
  const stored = readStorage(() => localStorage, MODE_KEY);
  return EFFECTS_MODES.includes(stored as EffectsMode) ? (stored as EffectsMode) : "auto";
};

/** Devices that say up front they are short of memory or data. */
export const looksLowPowered = (hints: DeviceHints = navigator as Navigator & DeviceHints) =>
  (hints.deviceMemory !== undefined && hints.deviceMemory <= 2) || hints.connection?.saveData === true;

const systemReducesMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export const isLiteEffects = (mode: EffectsMode = readEffectsMode()) =>
  mode === "lite" || (mode === "auto" && (readStorage(() => sessionStorage, SLOW_SESSION_KEY) === "1" || looksLowPowered()));

/** Whether decorative motion should stand still: low-power mode, or the system's reduce-motion setting. */
export const isMotionReduced = () => systemReducesMotion() || isLiteEffects();

/** Mirrors the mode onto <html data-effects="lite"> for the CSS (themes/lite-effects.css). */
export const applyEffectsAttribute = () => {
  if (isLiteEffects()) document.documentElement.dataset.effects = "lite";
  else delete document.documentElement.dataset.effects;
};

const announce = () => {
  applyEffectsAttribute();
  window.dispatchEvent(new Event(EFFECTS_CHANGE_EVENT));
};

export const setEffectsMode = (mode: EffectsMode) => {
  writeStorage(() => localStorage, MODE_KEY, mode);
  announce();
};

type MotionListener = () => void;

/**
 * A stand-in for matchMedia("(prefers-reduced-motion: reduce)") that also counts low-power mode, for effects that
 * read `.matches` and listen for "change".
 */
export const reducedMotionQuery = () => {
  const system = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  return {
    get matches() {
      return isMotionReduced();
    },
    addEventListener: (_type: "change", listener: MotionListener) => {
      system?.addEventListener?.("change", listener);
      window.addEventListener(EFFECTS_CHANGE_EVENT, listener);
    },
    removeEventListener: (_type: "change", listener: MotionListener) => {
      system?.removeEventListener?.("change", listener);
      window.removeEventListener(EFFECTS_CHANGE_EVENT, listener);
    },
  };
};

/**
 * Once per session in "auto", times a burst of frames after the page settles; if the device cannot keep the
 * animations smooth, low-power mode turns on and `onSlow` runs. Returns a function that stops the check.
 */
export const watchFrameRate = (onSlow: () => void) => {
  if (readEffectsMode() !== "auto" || isMotionReduced() || typeof window.requestAnimationFrame !== "function") return () => {};
  let frame = 0;
  let stopped = false;

  const sample = () => {
    if (stopped || document.hidden) return;
    let frames = 0;
    const started = performance.now();
    const tick = () => {
      if (stopped) return;
      // A hidden tab throttles frames; that says nothing about the device.
      if (document.hidden) return;
      frames += 1;
      if (frames < SAMPLE_FRAMES) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      const fps = (frames * 1000) / (performance.now() - started);
      if (fps < SLOW_FPS) {
        writeStorage(() => sessionStorage, SLOW_SESSION_KEY, "1");
        announce();
        onSlow();
      }
    };
    frame = window.requestAnimationFrame(tick);
  };

  const timer = window.setTimeout(sample, SETTLE_MS);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    window.cancelAnimationFrame(frame);
  };
};
