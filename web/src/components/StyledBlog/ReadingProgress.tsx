import { useEffect, useRef } from "react";
import { recordRead } from "@/utils/blog-progress";
import { tagItemsOf } from "@/utils/tag-items";
import RainyGlass from "./RainyGlass";
import { burst } from "./ReactionCanvas";

/** Cells in the text bar the developer style shows instead of the drawn one. */
const TEXT_BAR_CELLS = 24;
/** How far down counts as having read the article. */
const READ_THROUGH = 0.95;

interface Props {
  memoName: string;
  tags: string[];
  /** The Blog 2 style the article is read in, for style mastery. */
  style: string;
}

/**
 * A bar across the top of the window that fills as an article is read. Each style dresses it (blog-styles.css);
 * the width and the text bar are written straight to the DOM so scrolling never re-renders React.
 */
const ReadingProgress = ({ memoName, tags, style }: Props) => {
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
    const update = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      if (fillRef.current) fillRef.current.style.width = `${ratio * 100}%`;
      // A short article that fits the window counts as read straight away.
      if (ratio >= READ_THROUGH || scrollable <= 0) {
        const { memoName: name, tags: readTags, style: readStyle } = readRef.current;
        recordRead(name, readTags, readStyle);
      }
      if (labelRef.current) {
        const filled = Math.round(ratio * TEXT_BAR_CELLS);
        const bar = `${"=".repeat(Math.max(0, filled - 1))}${filled > 0 ? ">" : ""}${" ".repeat(TEXT_BAR_CELLS - filled)}`;
        labelRef.current.textContent = `[${bar}] ${Math.round(ratio * 100)}%`;
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

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
