import { useEffect, useRef } from "react";
import { useMusicEffects } from "@/contexts/MusicPlayerContext";
import { useView } from "@/contexts/ViewContext";

interface Props {
  title: string;
  description?: string;
}

/** The site title over the feed in the styled Blog 2 layout; each style dresses it its own way. */
const BlogHero = ({ title, description }: Props) => {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { feedLayout, blogStyle } = useView();
  const { playing, muted, volume, getEnergy } = useMusicEffects();

  // Only this title consumes the beat. Keep changing styles local to it instead
  // of invalidating inherited styles on the entire document every frame.
  useEffect(() => {
    const element = titleRef.current;
    if (!element || feedLayout !== "blog2" || blogStyle !== "golden" || !playing || muted || volume <= 0) return;
    let frame = 0;
    let last = 0;
    let previous = -1;
    const loop = (time: number) => {
      frame = 0;
      if (document.hidden) return;
      if (time - last >= 50) {
        const value = Math.round(getEnergy() * 50) / 50;
        if (value !== previous) element.style.setProperty("--sb-beat", value.toString());
        previous = value;
        last = time;
      }
      frame = window.requestAnimationFrame(loop);
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame) frame = window.requestAnimationFrame(loop);
    };
    if (!document.hidden) frame = window.requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      element.style.removeProperty("--sb-beat");
    };
  }, [blogStyle, feedLayout, getEnergy, muted, playing, volume]);

  return (
    <header data-sb-hero="" className="mb-6 min-w-0">
      <h1 ref={titleRef} data-sb-hero-title="" className="text-[1.875rem] font-bold leading-tight text-foreground">
        {title}
      </h1>
      {description && (
        <p data-sb-hero-desc="" className="mt-2 text-sm text-muted-foreground">
          {description}
        </p>
      )}
    </header>
  );
};

export default BlogHero;
