import { type RefObject, useEffect, useRef } from "react";
import { recordRead } from "@/utils/blog-progress";
import { tagItemsOf } from "@/utils/tag-items";
import RainyGlass from "./RainyGlass";
import { burst } from "./ReactionCanvas";

/** Cells in the text bar the developer style shows instead of the drawn one. */
const TEXT_BAR_CELLS = 24;

interface Props {
  memoName: string;
  tags: string[];
  /** The Blog 2 style the article is read in, for style mastery. */
  style: string;
  /** Only the article card, excluding comments, navigation and sidebar widgets. */
  articleRef: RefObject<HTMLElement | null>;
}

/**
 * A bar across the top of the window that fills as an article is read. Each style dresses it (blog-styles.css);
 * the width and the text bar are written straight to the DOM so scrolling never re-renders React.
 */
const ReadingProgress = ({ memoName, tags, style, articleRef }: Props) => {
  const fillRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const readRef = useRef({ memoName, tags, style });
  const items = tagItemsOf(tags);

  useEffect(() => {
    readRef.current = { memoName, tags, style };
  }, [memoName, style, tags]);

  // A birthday post opens with confetti.
  useEffect(() => {
    if (tagItemsOf(tags).includes("birthday")) burst({ kind: "confetti", count: 80 });
    // Once per article.
  }, [memoName]);

  useEffect(() => {
    let frame = 0;
    let recorded = false;
    const update = () => {
      frame = 0;
      const article = articleRef.current;
      if (!article) return;
      const bounds = article.getBoundingClientRect();
      if (bounds.height <= 0) return;
      const toolbarBottom = Math.max(0, document.querySelector<HTMLElement>("[data-app-toolbar]")?.getBoundingClientRect().bottom ?? 0);
      const start = Math.max(0, window.scrollY + bounds.top - toolbarBottom);
      const end = Math.max(0, window.scrollY + bounds.bottom - window.innerHeight);
      // The last line reaching the viewport completes the article, regardless of
      // how much sidebar or comment content continues below it. Allow subpixel rounding.
      const complete = bounds.bottom <= window.innerHeight + 1;
      const ratio = complete ? 1 : end > start ? Math.min(1, Math.max(0, (window.scrollY - start) / (end - start))) : 0;
      if (fillRef.current) fillRef.current.style.width = `${ratio * 100}%`;
      // A short article that fits the window counts as read straight away.
      if (complete && !recorded) {
        const { memoName: name, tags: readTags, style: readStyle } = readRef.current;
        recordRead(name, readTags, readStyle);
        recorded = true;
      }
      if (labelRef.current) {
        const filled = Math.floor(ratio * TEXT_BAR_CELLS);
        const bar = `${"=".repeat(Math.max(0, filled - 1))}${filled > 0 ? ">" : ""}${" ".repeat(TEXT_BAR_CELLS - filled)}`;
        labelRef.current.textContent = `[${bar}] ${Math.floor(ratio * 100)}%`;
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Images, embeds and font loading can change the article after its first paint.
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : undefined;
    if (articleRef.current) observer?.observe(articleRef.current);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [articleRef, memoName]);

  return (
    <>
      {items.includes("rain") && <RainyGlass />}
      <div data-reading-progress="" aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[3px]">
        <div ref={fillRef} data-reading-progress-fill="" className="h-full w-0 bg-primary" />
        <span ref={labelRef} data-reading-progress-label="" className="hidden" />
      </div>
    </>
  );
};

export default ReadingProgress;
