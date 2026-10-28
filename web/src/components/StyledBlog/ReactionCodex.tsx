import { CheckIcon, CircleHelpIcon, LockKeyholeIcon, MinusIcon, SparklesIcon, TrophyIcon } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  ACHIEVEMENTS,
  achievementDescription,
  achievementName,
  computeTransformations,
  currentVisitStreak,
  MASTERY_READS,
  useBlogProgress,
} from "@/utils/blog-progress";
import { blogStyleLabelKey, SECRET_BLOG_STYLES } from "@/utils/blog-style";
import { useTranslate } from "@/utils/i18n";
import {
  ELEMENTS,
  elementName,
  elementReactionId,
  isReactiveStyle,
  LEGENDARY_REACTIONS,
  legendaryFlavor,
  legendaryHint,
  legendaryName,
  REACTIVE_STYLES,
  THEME_ELEMENTS,
} from "@/utils/style-reactions";
import { THEME_OPTIONS } from "@/utils/theme";

const TABS = ["legend", "element", "achievement", "record"] as const;
type CodexTab = (typeof TABS)[number];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The codex: every reaction found so far, the ones still hidden, achievements and the run's record. */
const ReactionCodex = ({ open, onOpenChange }: Props) => {
  const t = useTranslate();
  const progress = useBlogProgress();
  const [tab, setTab] = useState<CodexTab>("legend");
  const found = new Set(progress.discovered);
  const legendaryFound = LEGENDARY_REACTIONS.filter((reaction) => found.has(reaction.id)).length;
  // The secret style's row stays out of the table, and out of the count, until its achievement unlocks it.
  const styles = REACTIVE_STYLES.filter((style) => !SECRET_BLOG_STYLES.includes(style) || progress.achievements.includes(style));
  const elementFound = styles.reduce(
    (count, style) => count + ELEMENTS.filter((element) => found.has(elementReactionId(style, element))).length,
    0,
  );
  const total = LEGENDARY_REACTIONS.length + styles.length * ELEMENTS.length;
  const transformations = computeTransformations(progress);
  const themeLabel = (theme: string) => {
    const option = THEME_OPTIONS.find((item) => item.value === theme);
    return option ? t(option.labelKey) : theme;
  };
  // For a cell not found yet: the themes that carry its element.
  const themesWith = (element: string) =>
    Object.entries(THEME_ELEMENTS)
      .filter(([, elements]) => (elements as string[]).includes(element))
      .map(([theme]) => themeLabel(theme))
      .join(" / ");
  // What is reacting right now, read from the attributes StyleReactionEngine keeps on <html>.
  const { style = "", theme = "", legend, elements = "" } = document.documentElement.dataset;
  const reactionNow = legend
    ? t(legendaryName(legend))
    : elements
        .split(" ")
        .filter(Boolean)
        .map((element) => t(elementName(element as (typeof ELEMENTS)[number])))
        .join(" / ");
  const currentLine =
    isReactiveStyle(style) && reactionNow
      ? t("fusion.current", { combo: `${t(blogStyleLabelKey(style))} \u00D7 ${themeLabel(theme)}`, reaction: reactionNow })
      : t("fusion.current-none");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" data-reaction-codex="">
        <DialogHeader>
          <DialogTitle>{t("fusion.codex")}</DialogTitle>
          <DialogDescription>{t("fusion.codex-progress", { found: legendaryFound + elementFound, total })}</DialogDescription>
        </DialogHeader>

        <p data-codex-current="" className="rounded-md border border-dashed px-3 py-2 text-sm">
          {currentLine}
        </p>

        <div role="tablist" className="flex flex-wrap gap-1 rounded-md bg-muted/60 p-1 text-sm">
          {TABS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                "flex-1 rounded px-3 py-1 transition-colors",
                tab === value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`fusion.tab-${value}`)}
            </button>
          ))}
        </div>

        {tab === "legend" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {LEGENDARY_REACTIONS.map((reaction) => {
              const known = found.has(reaction.id);
              return (
                <div key={reaction.id} data-codex-entry="" data-found={known || undefined} className="rounded-lg border p-3">
                  <p className="font-semibold">{known ? t(legendaryName(reaction.id)) : "???"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {known ? `${t(blogStyleLabelKey(reaction.style))} × ${themeLabel(reaction.theme)}` : t(legendaryHint(reaction.id))}
                  </p>
                  {known && <p className="mt-1.5 text-xs italic text-foreground/80">{t(legendaryFlavor(reaction.id))}</p>}
                </div>
              );
            })}
          </div>
        )}

        {tab === "element" && (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-center text-xs">
              <thead>
                <tr>
                  <th className="text-start font-normal text-muted-foreground" />
                  {ELEMENTS.map((element) => (
                    <th key={element} className="whitespace-nowrap px-1 font-normal text-muted-foreground">
                      {t(elementName(element))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {styles.map((style) => (
                  <tr key={style}>
                    <th className="whitespace-nowrap pe-2 text-start font-medium">{t(blogStyleLabelKey(style))}</th>
                    {ELEMENTS.map((element) => {
                      const known = found.has(elementReactionId(style, element));
                      return (
                        <td
                          key={element}
                          title={
                            known
                              ? `${t(blogStyleLabelKey(style))} × ${t(elementName(element))}`
                              : `${t("fusion.try-themes")}: ${themesWith(element)}`
                          }
                          data-found={known || undefined}
                          className={cn("size-7 rounded", known ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
                        >
                          {known ? (
                            <SparklesIcon className="mx-auto size-3.5" role="img" aria-label={t("fusion.unlocked")} />
                          ) : (
                            <CircleHelpIcon className="mx-auto size-3.5" role="img" aria-label={t("fusion.locked")} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">{t("fusion.element-hint")}</p>
          </div>
        )}

        {tab === "achievement" && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {ACHIEVEMENTS.map((rule) => {
              const unlocked = progress.achievements.includes(rule.id);
              const secret = rule.hidden && !unlocked;
              return (
                <li key={rule.id} data-found={unlocked || undefined} className={cn("rounded-lg border p-3", !unlocked && "opacity-60")}>
                  <p className="flex items-center gap-2 font-semibold">
                    {unlocked ? (
                      <TrophyIcon className="size-4 shrink-0 text-primary" role="img" aria-label={t("fusion.unlocked")} />
                    ) : (
                      <LockKeyholeIcon className="size-4 shrink-0 text-muted-foreground" role="img" aria-label={t("fusion.locked")} />
                    )}
                    <span>{secret ? "???" : t(achievementName(rule.id))}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {secret ? t("fusion.secret-achievement") : t(achievementDescription(rule.id))}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {tab === "record" && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t("fusion.record-reads")}</dt>
            <dd className="text-end tabular-nums">{Object.keys(progress.reads).length}</dd>
            <dt className="text-muted-foreground">{t("fusion.record-streak")}</dt>
            <dd className="text-end tabular-nums">{currentVisitStreak(progress.visitDays)}</dd>
            <dt className="text-muted-foreground">{t("fusion.record-bosses")}</dt>
            <dd className="text-end tabular-nums">{progress.bossKills}</dd>
            <dt className="text-muted-foreground">{t("fusion.record-shinies")}</dt>
            <dd className="text-end tabular-nums">{progress.shinies}</dd>
            <dt className="text-muted-foreground">{t("fusion.record-glitches")}</dt>
            <dd className="text-end tabular-nums">{progress.glitches}</dd>
            <dt className="text-muted-foreground">{t("fusion.transform-traveler")}</dt>
            <dd className="text-end">
              {transformations.traveler ? (
                <CheckIcon className="ms-auto size-4 text-primary" role="img" aria-label={t("fusion.unlocked")} />
              ) : (
                <MinusIcon className="ms-auto size-4 text-muted-foreground" role="img" aria-label={t("fusion.locked")} />
              )}
            </dd>
            <dt className="text-muted-foreground">{t("fusion.transform-regular")}</dt>
            <dd className="text-end">
              {transformations.regular ? (
                <CheckIcon className="ms-auto size-4 text-primary" role="img" aria-label={t("fusion.unlocked")} />
              ) : (
                <MinusIcon className="ms-auto size-4 text-muted-foreground" role="img" aria-label={t("fusion.locked")} />
              )}
            </dd>
            <dt className="text-muted-foreground">{t("fusion.transform-mastery", { n: MASTERY_READS })}</dt>
            <dd className="text-end">
              {transformations.masteredStyles.length > 0
                ? transformations.masteredStyles.map((style) => t(blogStyleLabelKey(style))).join(" / ")
                : "—"}
            </dd>
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ReactionCodex;
