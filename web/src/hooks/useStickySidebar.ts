import { type RefObject, useEffect } from "react";

/** Space kept between the sidebar and the toolbar above it, or the window's bottom edge below it. */
const EDGE_GAP = 16;

/**
 * Keeps a page's side column in view the way Twitter's does. A column shorter than the window sticks under the
 * toolbar. A taller one scrolls with the page until its last widget is in view and then stays there; scrolling
 * back up, it scrolls along again until its top is back in view. The offset is written straight to the element,
 * so scrolling never re-renders React.
 */
export const useStickySidebar = (ref: RefObject<HTMLElement | null>, enabled = true) => {
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;

    const toolbarOffset = () =>
      Math.max(0, document.querySelector<HTMLElement>("[data-app-toolbar]")?.getBoundingClientRect().bottom ?? 0) + EDGE_GAP;
    let top = toolbarOffset();
    let lastScrollY = window.scrollY;
    let frame = 0;

    const update = () => {
      frame = 0;
      const highest = toolbarOffset();
      // The furthest up the column may go: its bottom edge resting just above the window's bottom edge.
      const lowest = Math.min(highest, window.innerHeight - element.offsetHeight - EDGE_GAP);
      const scrolled = window.scrollY - lastScrollY;
      lastScrollY = window.scrollY;
      top = Math.min(highest, Math.max(lowest, top - scrolled));
      element.style.top = `${top}px`;
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    element.style.position = "sticky";
    element.style.alignSelf = "start";
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Widgets load and grow after the first paint.
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : undefined;
    observer?.observe(element);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      element.style.position = "";
      element.style.alignSelf = "";
      element.style.top = "";
    };
  }, [enabled, ref]);
};
