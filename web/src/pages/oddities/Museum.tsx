import { LockIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useView } from "@/contexts/ViewContext";
import { useBlogProgress } from "@/utils/blog-progress";
import { type BlogStyle, blogStyleLabelKey, isStyledBlog } from "@/utils/blog-style";
import { type Translations, useTranslate } from "@/utils/i18n";

/** The rooms in visiting order: roughly by the years each look belongs to, the secret room last. */
const ROOMS: readonly BlogStyle[] = [
  "terminal",
  "pixel",
  "y2k",
  "aero",
  "vaporwave",
  "neumorphism",
  "glass",
  "handdrawn",
  "default",
  "golden",
];

/** A small framed picture of a card in the room's style, drawn in museum-only CSS (themes/oddities.css). */
const Miniature = ({ style, locked }: { style: BlogStyle; locked?: boolean }) => (
  <div aria-hidden data-museum-mini={locked ? "locked" : style} className="relative aspect-[4/3] w-full overflow-hidden">
    {locked ? (
      <span data-mini-door="" />
    ) : (
      <span data-mini-card="">
        <span data-mini-title="" />
        <span data-mini-line="" />
        <span data-mini-line="" />
        <span data-mini-line="" />
      </span>
    )}
  </div>
);

/**
 * /museum: every Memos Plus style hung as an exhibit, with a placard on when it is from and what it is made of.
 * Touching the exhibits is allowed: a room's button puts its style on. The last room stays shut until the visitor
 * has unlocked the golden style, and only light shows under its door.
 */
const Museum = () => {
  const t = useTranslate();
  const { feedLayout, blogStyle, setBlogStyle, setFeedLayout } = useView();
  const progress = useBlogProgress();
  const current = isStyledBlog(feedLayout) ? blogStyle : undefined;

  const enter = (style: BlogStyle) => {
    setBlogStyle(style);
    if (!isStyledBlog(feedLayout)) setFeedLayout("blog2");
  };

  return (
    <section className="min-h-full w-full">
      <div data-page-panel="" data-oddity="museum" className="mx-auto w-full max-w-4xl py-8 sm:py-12">
        <header className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("oddities.museum.title")}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{t("oddities.museum.lead")}</p>
        </header>

        <ol className="mt-8 grid gap-5 sm:grid-cols-2">
          {ROOMS.map((style, index) => {
            const locked = style === "golden" && !progress.achievements.includes("golden") && current !== "golden";
            const key = (field: "era" | "materials" | "note") => `oddities.museum.${style}-${field}` as Translations;
            return (
              <li key={style} data-museum-room={style} className="flex flex-col gap-3">
                <figure className="m-0 rounded-md border-[10px] border-[color-mix(in_oklch,var(--foreground)_78%,#8a6a3b)] bg-muted/40 p-2 shadow-md">
                  <Miniature style={style} locked={locked} />
                </figure>
                <div data-settings-surface="" className="rounded-md border border-border bg-card px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sm font-semibold text-foreground">
                      <span className="mr-2 font-mono text-xs text-muted-foreground">
                        {t("oddities.museum.room", { number: index + 1 })}
                      </span>
                      {locked ? t("oddities.museum.locked-title") : t(blogStyleLabelKey(style))}
                    </h2>
                    {!locked && <span className="text-xs text-muted-foreground">{t(key("era"))}</span>}
                  </div>
                  {locked ? (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                      <LockIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                      {t("oddities.museum.locked-note")}
                    </p>
                  ) : (
                    <>
                      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                        {t("oddities.museum.materials")}
                        {t(key("materials"))}
                      </p>
                      <p className="mt-1 text-[13px] leading-6 text-foreground">{t(key("note"))}</p>
                      <div className="mt-2.5 flex items-center gap-2">
                        {current === style ? (
                          <Badge variant="secondary">{t("oddities.museum.here")}</Badge>
                        ) : (
                          <Button variant="outline" size="sm" className="h-7" onClick={() => enter(style)}>
                            {t("oddities.museum.enter")}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
};

export default Museum;
