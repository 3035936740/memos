import { Gamepad2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useView } from "@/contexts/ViewContext";
import { computeTransformations, updateProgress, useBlogProgress } from "@/utils/blog-progress";
import { isMotionReduced } from "@/utils/effects";
import { useTranslate } from "@/utils/i18n";
import TerminalConsole from "./TerminalConsole";

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
const SPARKLE_PATHS = [
  "M12 2 15 9 22 12 15 15 12 22 9 15 2 12 9 9Z",
  "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3L5.8 21 7 14.2 2 9.3l6.9-1Z",
];
// Windows 98 mouse trails in the 16-colour palette: navy, teal, yellow and white.
const Y2K_COLORS = ["#000080", "#008080", "#ffff00", "#ffffff"];
const GOLD_COLORS = ["#ffd76a", "#f5b942", "#fff1b8"];
const MAX_SPARKLES = 24;

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

const prefersReducedMotion = isMotionReduced;

/** The sparkle colour: rainbow in the Y2K × cosmic legend, gold for regulars, Windows 98 colours otherwise. */
const sparkleColor = (gold: boolean) => {
  if (document.documentElement.dataset.legend === "cyber") return `hsl(${Math.floor(Math.random() * 360)} 95% 65%)`;
  const colors = gold ? GOLD_COLORS : Y2K_COLORS;
  return colors[Math.floor(Math.random() * colors.length)];
};

/**
 * Small surprises tied to the Blog 2 styles: the Konami code turns on pixel retro, the pointer leaves a trail of
 * sparkles in Y2K (gold ones for regulars in any style), "/" opens a pretend shell in the developer style, and a
 * developer-style master can move between posts with Vim keys. The rest live in CSS and StyleReactionEngine.
 * They belong to the built-in styles themselves, so a pack that borrows one's reactions does not bring them.
 */
const StyleEasterEggs = () => {
  const t = useTranslate();
  const { feedLayout, sceneStyle, setFeedLayout, setBlogStyle } = useView();
  const progress = useBlogProgress();
  const [terminalOpen, setTerminalOpen] = useState(false);
  const styled = feedLayout === "blog2";
  const { regular, masteredStyles } = computeTransformations(progress);
  const sparkles = styled && (sceneStyle === "y2k" || regular);
  const goldSparkles = sceneStyle !== "y2k";
  const vimKeys = styled && sceneStyle === "terminal" && masteredStyles.includes("terminal");

  // Up up down down left right left right B A, anywhere outside a text field.
  useEffect(() => {
    let step = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === KONAMI[step]) {
        step += 1;
      } else if (key === "ArrowUp") {
        // A third "up" still leaves the first two counted.
        step = step === 2 ? 2 : 1;
      } else {
        step = 0;
      }
      if (step === KONAMI.length) {
        step = 0;
        setFeedLayout("blog2");
        setBlogStyle("pixel");
        updateProgress((current) => ({ ...current, konami: true }));
        toast(t("blog-extra.konami"), { icon: <Gamepad2Icon aria-hidden className="size-5 text-primary" /> });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setBlogStyle, setFeedLayout, t]);

  // A trail of sparkles drifts down behind the mouse pointer and fades out.
  useEffect(() => {
    if (!sparkles || prefersReducedMotion()) return;
    const layer = document.createElement("div");
    layer.setAttribute("data-sparkle-layer", "");
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
    let last = 0;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.timeStamp - last < 45 || layer.childElementCount >= MAX_SPARKLES) return;
      last = event.timeStamp;
      const spark = document.createElement("span");
      const variant = Math.floor(Math.random() * 4);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", variant % 2 === 0 ? "currentColor" : "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.5");
      svg.setAttribute("stroke-linejoin", "round");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", SPARKLE_PATHS[Math.floor(variant / 2)]);
      svg.appendChild(path);
      spark.appendChild(svg);
      spark.style.left = `${event.clientX}px`;
      spark.style.top = `${event.clientY}px`;
      spark.style.color = sparkleColor(goldSparkles);
      spark.addEventListener("animationend", () => spark.remove());
      layer.appendChild(spark);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      layer.remove();
    };
  }, [goldSparkles, sparkles]);

  // Developer style: "/" opens the shell.
  useEffect(() => {
    if (!styled || sceneStyle !== "terminal") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      event.preventDefault();
      setTerminalOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sceneStyle, styled]);

  // Developer mastery: j / k move between posts, o opens one, gg and G jump to the top and the bottom.
  useEffect(() => {
    if (!vimKeys) return;
    let cursor = -1;
    let pendingG = false;
    const links = () => Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-sb-card] [data-sb-title] a"));
    const focusAt = (index: number) => {
      const items = links();
      if (items.length === 0) return;
      cursor = Math.max(0, Math.min(items.length - 1, index));
      items[cursor].focus();
      items[cursor].closest("[data-sb-card]")?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      const items = links();
      const focused = items.indexOf(document.activeElement as HTMLAnchorElement);
      if (focused >= 0) cursor = focused;
      if (event.key === "j") focusAt(cursor + 1);
      else if (event.key === "k") focusAt(cursor - 1);
      else if (event.key === "o" && cursor >= 0) items[cursor]?.click();
      else if (event.key === "G") window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      else if (event.key === "g" && pendingG) window.scrollTo({ top: 0, behavior: "smooth" });
      pendingG = event.key === "g" && !pendingG;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [vimKeys]);

  return terminalOpen && styled && sceneStyle === "terminal" ? <TerminalConsole onClose={() => setTerminalOpen(false)} /> : null;
};

export default StyleEasterEggs;
