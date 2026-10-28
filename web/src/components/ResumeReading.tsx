import { XIcon } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTranslate } from "@/utils/i18n";
import { articleReadRatio, articleScrollSpan, loadReadingPosition, saveReadingPosition } from "@/utils/reading-position";

/** Articles shorter than this many window heights are not worth finding a place in. */
const MIN_SCREENS = 1.5;
/** The offer goes away by itself after this long. */
const OFFER_MS = 12_000;
/** The place is saved this long after scrolling stops. */
const SAVE_DELAY_MS = 800;
/** Lets images and embeds lay out before the article's length is judged. */
const LAYOUT_DELAY_MS = 400;

interface Props {
  memoName: string;
  /** Only the article card, excluding comments, navigation and sidebar widgets. */
  articleRef: RefObject<HTMLElement | null>;
}

/**
 * Remembers how far a long article was read, in this browser, and on the next visit offers to jump back there.
 * Nothing is offered when the address points at an anchor (a comment, a footnote) or the article is short.
 */
const ResumeReading = ({ memoName, articleRef }: Props) => {
  const t = useTranslate();
  const { hash } = useLocation();
  const [offer, setOffer] = useState<number>();
  // While the offer stands the saved place is kept, so a look at the top does not overwrite it.
  const holdingRef = useRef(false);

  useEffect(() => {
    setOffer(undefined);
    holdingRef.current = false;
    const saved = loadReadingPosition(memoName);
    if (saved === undefined || hash) return;
    holdingRef.current = true;
    const timer = window.setTimeout(() => {
      const article = articleRef.current;
      if (article && article.getBoundingClientRect().height >= window.innerHeight * MIN_SCREENS) {
        setOffer(saved);
      } else {
        holdingRef.current = false;
      }
    }, LAYOUT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [articleRef, hash, memoName]);

  useEffect(() => {
    if (offer === undefined) return;
    const timer = window.setTimeout(() => {
      holdingRef.current = false;
      setOffer(undefined);
    }, OFFER_MS);
    return () => window.clearTimeout(timer);
  }, [offer]);

  useEffect(() => {
    let timer = 0;
    const save = () => {
      timer = 0;
      const article = articleRef.current;
      if (!article || holdingRef.current) return;
      if (article.getBoundingClientRect().height < window.innerHeight * MIN_SCREENS) return;
      saveReadingPosition(memoName, articleReadRatio(article));
    };
    const schedule = () => {
      if (!timer) timer = window.setTimeout(save, SAVE_DELAY_MS);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("pagehide", save);
      if (timer) window.clearTimeout(timer);
    };
  }, [articleRef, memoName]);

  const dismiss = () => {
    holdingRef.current = false;
    setOffer(undefined);
  };

  const resume = () => {
    const article = articleRef.current;
    if (article && offer !== undefined) {
      const { start, end } = articleScrollSpan(article);
      const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      window.scrollTo({ top: start + offer * (end - start), behavior: still ? "auto" : "smooth" });
    }
    dismiss();
  };

  if (offer === undefined) return null;

  return (
    <div role="status" data-resume-reading="" className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-popover py-1 ps-4 pe-1 text-sm text-popover-foreground shadow-lg">
        <span className="tabular-nums">{t("memo.resume.prompt", { percent: Math.round(offer * 100) })}</span>
        <Button size="sm" variant="ghost" className="text-primary" onClick={resume}>
          {t("memo.resume.action")}
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label={t("memo.resume.dismiss")} onClick={dismiss}>
          <XIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
};

export default ResumeReading;
