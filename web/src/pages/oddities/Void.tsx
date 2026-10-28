import { type CSSProperties, type KeyboardEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useView } from "@/contexts/ViewContext";
import { isStyledBlog } from "@/utils/blog-style";
import { isMotionReduced } from "@/utils/effects";
import { useTranslate } from "@/utils/i18n";
import {
  bumpVoidCount,
  readVoidCount,
  scatter,
  VOID_MAX_LENGTH,
  type VoidEffect,
  type VoidMilestone,
  voidEffectFor,
  voidMilestone,
} from "@/utils/oddities";

interface Thought {
  id: number;
  text: string;
  effect: VoidEffect;
}

/** How long each way of destroying a thought takes, so the stage clears itself when it is over. */
const LIFETIME_MS: Record<VoidEffect, number> = {
  dissolve: 1600,
  shatter: 1500,
  press: 1400,
  bubbles: 2000,
  melt: 1900,
  blocks: 1700,
  erase: 1600,
  rm: 2600,
  gild: 1800,
};

/** Only a few thoughts burn at once; a fast typist should not pile up a hundred animations. */
const MAX_BURNING = 3;

const ShellLines = ({ text }: { text: string }) => {
  const short = text.length > 24 ? `${text.slice(0, 24)}…` : text;
  const lines = [
    `$ echo "${short}" > thought.txt`,
    "$ rm -f thought.txt",
    "$ cat thought.txt",
    "cat: thought.txt: No such file or directory",
  ];
  return (
    <span data-void-shell="">
      {lines.map((line, index) => (
        <span key={line} data-void-line="" style={{ "--d": `${index * 420}ms` } as CSSProperties}>
          {line}
        </span>
      ))}
    </span>
  );
};

const BurningThought = ({ thought, onDone }: { thought: Thought; onDone: (id: number) => void }) => {
  const seed = (thought.id * 37) % 997;
  return (
    <div
      aria-hidden
      data-void-thought=""
      data-void-fx={thought.effect}
      style={{ "--void-life": `${LIFETIME_MS[thought.effect]}ms` } as CSSProperties}
      onAnimationEnd={(event) => event.target === event.currentTarget && onDone(thought.id)}
    >
      {thought.effect === "rm" ? (
        <ShellLines text={thought.text} />
      ) : (
        <span data-void-text="">
          {Array.from(thought.text).map((char, index) => (
            <span
              // Letters repeat; their place in a thought that never changes does not.
              key={index}
              data-ch=""
              style={
                {
                  "--dx": (scatter(index, seed) * 2 - 1).toFixed(3),
                  "--dy": scatter(index, seed + 1).toFixed(3),
                  "--rot": (scatter(index, seed + 2) * 2 - 1).toFixed(3),
                  "--d": `${Math.round(scatter(index, seed + 3) * 360)}ms`,
                } as CSSProperties
              }
            >
              {char}
            </span>
          ))}
        </span>
      )}
    </div>
  );
};

/**
 * /void: write down what you want to say but not keep, press Enter, and watch it be destroyed the way the current
 * style would do it. Nothing is saved, drafted or sent; only how many thoughts this browser has let go is counted.
 */
const Void = () => {
  const t = useTranslate();
  const { feedLayout, blogStyle } = useView();
  const effect = voidEffectFor(isStyledBlog(feedLayout) ? blogStyle : undefined);
  const [draft, setDraft] = useState("");
  const [burning, setBurning] = useState<Thought[]>([]);
  const [count, setCount] = useState(readVoidCount);
  const [milestone, setMilestone] = useState<VoidMilestone>();
  const nextId = useRef(0);

  const letGo = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const next = bumpVoidCount();
    setCount(next);
    setMilestone(voidMilestone(next));
    // Without motion the thought is simply gone.
    if (isMotionReduced()) return;
    setBurning((list) => [...list.slice(-(MAX_BURNING - 1)), { id: ++nextId.current, text, effect }]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter lets go; Shift+Enter is a new line. Never while an input method is still composing.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    letGo();
  };

  return (
    <section className="min-h-full w-full">
      <div data-page-panel="" data-oddity="void" className="mx-auto flex w-full max-w-xl flex-col gap-5 py-10 sm:py-16">
        <header className="text-center">
          <h1 className="font-mono text-3xl font-semibold tracking-tight text-foreground">/void</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{t("oddities.void.lead")}</p>
        </header>

        <div className="flex flex-col gap-2">
          <Textarea
            autoFocus
            rows={3}
            value={draft}
            maxLength={VOID_MAX_LENGTH}
            aria-label={t("oddities.void.label")}
            placeholder={t("oddities.void.placeholder")}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{t("oddities.void.privacy")}</span>
            <Button variant="outline" size="sm" disabled={!draft.trim()} onClick={letGo}>
              {t("oddities.void.let-go")}
            </Button>
          </div>
        </div>

        <div data-void-stage="" className="relative min-h-32">
          {burning.map((thought) => (
            <BurningThought
              key={thought.id}
              thought={thought}
              onDone={(id) => setBurning((list) => list.filter((item) => item.id !== id))}
            />
          ))}
        </div>

        <p aria-live="polite" className="text-center text-sm text-muted-foreground">
          {count > 0 ? t("oddities.void.count", { count }) : t("oddities.void.empty")}
          {milestone && <span className="mt-1 block">{t(`oddities.void.milestone-${milestone}`)}</span>}
        </p>
      </div>
    </section>
  );
};

export default Void;
