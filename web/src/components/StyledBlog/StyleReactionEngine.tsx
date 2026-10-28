import { BatteryLowIcon, MoonIcon, RotateCcwIcon, TrophyIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useInstance } from "@/contexts/InstanceContext";
import { useMusicEffects } from "@/contexts/MusicPlayerContext";
import { useView } from "@/contexts/ViewContext";
import useCurrentTheme from "@/hooks/useCurrentTheme";
import { parseInstanceSiteConfig } from "@/lib/instance-content";
import {
  ACHIEVEMENTS,
  achievementName,
  bumpCounter,
  computeTransformations,
  discover,
  recordVisitDay,
  updateProgress,
  useBlogProgress,
} from "@/utils/blog-progress";
import { blogStyleLabelKey } from "@/utils/blog-style";
import { isMotionReduced, watchFrameRate } from "@/utils/effects";
import { useTranslate } from "@/utils/i18n";
import {
  computeFusion,
  ELEMENT_PARTICLES,
  elementFlavor,
  elementName,
  FESTIVAL_PARTICLES,
  getDaypart,
  getFestival,
  LEGENDARY_REACTIONS,
  legendaryFlavor,
  legendaryName,
  type ParticleKind,
} from "@/utils/style-reactions";
import PixelBoss from "./PixelBoss";
import ReactionCanvas, { type ParticleLook } from "./ReactionCanvas";
import useStylePackLoader from "./useStylePackLoader";

// The detailed scene is only downloaded and parsed while this style is active.
const VaporwaveSkyline = lazy(() => import("./VaporwaveSkyline"));

const LOOKS: Record<string, ParticleLook> = {
  pixel: "pixel",
  terminal: "ascii",
  handdrawn: "ink",
  aero: "gloss",
  y2k: "neon",
  vaporwave: "pastel",
  golden: "gold",
};

const NO_KINDS: ParticleKind[] = [];
const BANNER_MS = 3600;
const GLITCH_MS = 10_000;
const GLITCH_CHANCE = 0.005;
const MIDNIGHT_KEY = "memos-midnight-greeting";

const setRootAttribute = (name: string, value: string | undefined) => {
  if (value) document.documentElement.setAttribute(name, value);
  else document.documentElement.removeAttribute(name);
};

const RESET_HANDLED_KEY = "memos-preferences-reset-handled";
/** This browser's display choices that an admin reset clears (reaction progress is the visitor's own and stays). */
const LOCAL_PREFERENCE_KEYS = ["memos-view-setting", "memos-music-player"];

const readLocal = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeLocal = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Without storage the reset simply applies again next time.
  }
};

/** Shown once per browser session; true the first time. */
const firstTimeThisSession = (key: string) => {
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
};

interface Banner {
  kicker: string;
  title: string;
  flavor: string;
  legendary: boolean;
}

/**
 * Runs the style × theme reactions for Blog 2: works out the fusion, mirrors it onto <html> for the stylesheets
 * (data-fusion, data-elements, data-legend, data-daypart, data-festival, data-transform, data-mastery), announces
 * new discoveries and achievements, sets the particles loose, and rolls the rare events. It also applies the
 * admin's first-visit style to browsers that never picked one.
 */
const StyleReactionEngine = () => {
  const t = useTranslate();
  const { generalSetting, isInitialized } = useInstance();
  const { feedLayout, blogStyle, sceneStyle, applyFirstVisitStyle, resetToDefaults } = useView();
  const { getEnergy, resetPrefs } = useMusicEffects();
  useStylePackLoader();
  const progress = useBlogProgress();
  const theme = useCurrentTheme();
  const [now, setNow] = useState(() => new Date());
  const [banner, setBanner] = useState<Banner | undefined>(undefined);
  const [glitching, setGlitching] = useState(false);
  const styled = feedLayout === "blog2";
  const activeStyle = styled ? blogStyle : undefined;
  const fusion = useMemo(() => computeFusion(activeStyle, theme), [activeStyle, theme]);
  const daypart = getDaypart(now);
  const festival = isInitialized && !generalSetting.disableFestivalEffects ? getFestival(now) : undefined;
  const transformations = useMemo(() => computeTransformations(progress), [progress]);
  const mastered = !!activeStyle && transformations.masteredStyles.includes(activeStyle);
  const siteConfig = useMemo(() => parseInstanceSiteConfig(generalSetting?.customPagesJson ?? ""), [generalSetting?.customPagesJson]);
  const firstVisitStyle = generalSetting?.firstVisitDefaultStyle || siteConfig.firstVisitStyle;
  const preferencesResetAt = Number(generalSetting?.preferencesResetAt ?? 0n) || siteConfig.preferencesResetAt;

  useEffect(() => {
    if (firstVisitStyle) applyFirstVisitStyle(firstVisitStyle);
  }, [applyFirstVisitStyle, firstVisitStyle]);

  // The admin initialized every member's preferences: this browser drops its own display choices, once per reset.
  useEffect(() => {
    if (!preferencesResetAt || preferencesResetAt <= Number(readLocal(RESET_HANDLED_KEY) ?? 0)) return;
    const hadChoices = LOCAL_PREFERENCE_KEYS.some((key) => readLocal(key) !== null);
    writeLocal(RESET_HANDLED_KEY, String(preferencesResetAt));
    resetToDefaults();
    resetPrefs();
    if (firstVisitStyle) applyFirstVisitStyle(firstVisitStyle);
    if (hadChoices) toast(t("blog-extra.preferences-reset"), { icon: <RotateCcwIcon aria-hidden className="size-5 text-primary" /> });
    // Once per reset value; the reset functions are recreated every render.
  }, [preferencesResetAt]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // If this device cannot keep the effects smooth, low-power mode takes over for the session, and says so once.
  useEffect(() => {
    const notify = () => toast(t("effects.auto-lite"), { icon: <BatteryLowIcon aria-hidden className="size-5 text-primary" /> });
    return watchFrameRate(notify);
    // Once per visit.
  }, []);

  // Arrival: count the day, greet night owls, and very rarely glitch.
  useEffect(() => {
    recordVisitDay();
    if (getDaypart(new Date()) === "midnight" && firstTimeThisSession(MIDNIGHT_KEY)) {
      toast(t("fusion.midnight"), { icon: <MoonIcon aria-hidden className="size-5 text-primary" /> });
    }
    if (Math.random() < GLITCH_CHANCE && !isMotionReduced()) {
      setGlitching(true);
      bumpCounter("glitches");
      discover("glitch");
    }
    // Arrival happens once.
  }, []);

  useEffect(() => {
    if (!glitching) return;
    const timer = window.setTimeout(() => setGlitching(false), GLITCH_MS);
    return () => window.clearTimeout(timer);
  }, [glitching]);

  // Mirror the state onto <html> for blog-styles.css.
  useEffect(() => {
    const transforms = [transformations.traveler && "traveler", transformations.regular && "regular"].filter(Boolean).join(" ");
    setRootAttribute("data-fusion", styled ? (fusion.pure ? "pure" : "fused") : undefined);
    setRootAttribute("data-elements", styled ? fusion.elements.join(" ") : undefined);
    setRootAttribute("data-legend", styled ? fusion.legendary?.id : undefined);
    setRootAttribute("data-daypart", daypart);
    setRootAttribute("data-festival", styled ? festival : undefined);
    setRootAttribute("data-transform", styled ? transforms : undefined);
    setRootAttribute("data-mastery", mastered ? "1" : undefined);
    setRootAttribute("data-glitch", glitching ? "1" : undefined);
  }, [daypart, festival, fusion, glitching, mastered, styled, transformations]);

  // New discoveries get the banner, a legendary one first.
  useEffect(() => {
    if (!styled || !activeStyle) return;
    const fresh = fusion.reactionIds.filter((id) => discover(id));
    if (fresh.length === 0) return;
    const legend = fusion.legendary && fresh.includes(fusion.legendary.id) ? fusion.legendary : undefined;
    if (legend) {
      setBanner({
        kicker: t("fusion.new-legend"),
        title: t(legendaryName(legend.id)),
        flavor: t(legendaryFlavor(legend.id)),
        legendary: true,
      });
      return;
    }
    const element = fusion.elements.find((item) => fresh.includes(`${activeStyle}:${item}`));
    if (element) {
      setBanner({
        kicker: t("fusion.new-reaction"),
        title: `${t(blogStyleLabelKey(activeStyle))} × ${t(elementName(element))}`,
        flavor: t(elementFlavor(element)),
        legendary: false,
      });
    }
  }, [activeStyle, fusion, styled, t]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(undefined), BANNER_MS);
    return () => window.clearTimeout(timer);
  }, [banner]);

  // Achievements unlock as the run goes on.
  useEffect(() => {
    const legendaryCount = LEGENDARY_REACTIONS.filter((reaction) => progress.discovered.includes(reaction.id)).length;
    const unlocked = ACHIEVEMENTS.filter((rule) => !progress.achievements.includes(rule.id) && rule.test(progress, legendaryCount));
    if (unlocked.length === 0) return;
    updateProgress((current) => ({ ...current, achievements: [...current.achievements, ...unlocked.map((rule) => rule.id)] }));
    for (const rule of unlocked) {
      toast(`${t("fusion.achievement-unlocked")}: ${t(achievementName(rule.id))}`, {
        icon: <TrophyIcon aria-hidden className="size-5 text-primary" />,
      });
    }
    // The secret style deserves more than a toast.
    if (unlocked.some((rule) => rule.id === "golden")) {
      setBanner({
        kicker: t("fusion.achievement-unlocked"),
        title: t("blog-style.golden"),
        flavor: t("fusion.golden-unlocked"),
        legendary: true,
      });
    }
  }, [progress, t]);

  const kinds = useMemo(() => {
    if (!styled) return [];
    const list: ParticleKind[] = [];
    for (const element of fusion.elements) {
      const kind = ELEMENT_PARTICLES[element];
      if (kind) list.push(kind);
    }
    // Lanterns belong to the evening.
    const evening = daypart !== "day" && daypart !== "dawn";
    if (fusion.legendary) list.push(...fusion.legendary.particles.filter((kind) => kind !== "lantern" || evening));
    if (festival) list.push(FESTIVAL_PARTICLES[festival]);
    if (activeStyle === "golden") list.push("star");
    return [...new Set(list)];
  }, [activeStyle, daypart, festival, fusion, styled]);
  const look = LOOKS[activeStyle ?? ""] ?? "plain";

  // Standing particles sit behind the page, so the opaque page shells step aside while there are any.
  useEffect(() => {
    setRootAttribute("data-particles", kinds.length > 0 ? "1" : undefined);
  }, [kinds.length]);

  return (
    <>
      {styled && sceneStyle === "vaporwave" && fusion.legendary?.id !== "outrun" && (
        <Suspense fallback={null}>
          <VaporwaveSkyline />
        </Suspense>
      )}
      {styled && (
        <>
          <ReactionCanvas layer="back" kinds={kinds} look={look} density={mastered ? 2 : 1} getEnergy={getEnergy} />
          <ReactionCanvas layer="front" kinds={NO_KINDS} look={look} density={1} getEnergy={getEnergy} />
        </>
      )}
      {styled && sceneStyle === "pixel" && <PixelBoss />}
      {styled && transformations.traveler && (
        <div data-travel-stamp="" aria-hidden className="pointer-events-none fixed bottom-6 end-6 z-[4]" />
      )}
      {banner && (
        <div
          role="status"
          data-reaction-banner=""
          data-legendary={banner.legendary || undefined}
          className="pointer-events-none fixed inset-x-0 top-[26vh] z-[60] flex flex-col items-center gap-2 px-4 text-center"
        >
          <p data-reaction-kicker="" className="text-xs tracking-[0.3em]">
            {banner.kicker}
          </p>
          <p data-reaction-title="" className="text-3xl font-black sm:text-4xl">
            {banner.title}
          </p>
          <p data-reaction-flavor="" className="text-sm">
            {banner.flavor}
          </p>
        </div>
      )}
    </>
  );
};

export default StyleReactionEngine;
