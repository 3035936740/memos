import { CoinsIcon } from "lucide-react";
import { type MouseEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { bumpCounter } from "@/utils/blog-progress";
import { isMotionReduced } from "@/utils/effects";
import { useTranslate } from "@/utils/i18n";
import { burst } from "./ReactionCanvas";

const BOSS_HP = 10;
const SPAWN_CHANCE = 0.4;
const SPAWN_DELAY_MS = 12_000;
const SESSION_KEY = "memos-pixel-boss";

const alreadyAppeared = () => {
  try {
    return sessionStorage.getItem(SESSION_KEY) !== null;
  } catch {
    return true;
  }
};

/**
 * Pixel retro's random event: now and then a pixel boss drifts across the page. Ten clicks bring it down for a coin.
 * At most once a visit, and only sometimes.
 */
const PixelBoss = () => {
  const t = useTranslate();
  const [flying, setFlying] = useState(false);
  const [hp, setHp] = useState(BOSS_HP);

  useEffect(() => {
    // It only makes sense moving; visitors who asked for less motion are spared it.
    if (alreadyAppeared() || Math.random() > SPAWN_CHANCE || isMotionReduced()) return;
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // It just may come back next time.
      }
      setFlying(true);
    }, SPAWN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!flying) return null;

  const hit = (event: MouseEvent<HTMLButtonElement>) => {
    const remaining = hp - 1;
    setHp(remaining);
    burst({ kind: "confetti", x: event.clientX, y: event.clientY, count: remaining > 0 ? 6 : 60 });
    if (remaining > 0) return;
    bumpCounter("bossKills");
    toast(t("fusion.boss-defeated"), { icon: <CoinsIcon aria-hidden className="size-5 text-primary" /> });
    setFlying(false);
  };

  return (
    <button
      type="button"
      data-pixel-boss=""
      aria-label={t("fusion.boss")}
      onClick={hit}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setFlying(false);
      }}
      className="fixed start-0 top-[22vh] z-[55] flex h-14 w-20 cursor-crosshair flex-col items-center gap-1"
    >
      <span data-pixel-boss-hp="" aria-hidden className="block h-1.5 w-full">
        <span className="block h-full" style={{ width: `${(hp / BOSS_HP) * 100}%` }} />
      </span>
      <span data-pixel-boss-sprite="" aria-hidden className="block h-11 w-full" />
    </button>
  );
};

export default PixelBoss;
