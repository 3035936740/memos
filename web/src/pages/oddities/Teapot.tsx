import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { type Translations, useTranslate } from "@/utils/i18n";
import { teapotAnswer } from "@/utils/oddities";
import TeapotShape from "@/vendor/openmoji/TeapotShape";

/** The spout stays at (95.55, 79.3); the water follows a gravity-shaped arc into the cup. */
const TeapotArt = ({ pouring, wobble }: { pouring: boolean; wobble: number }) => {
  const cupClip = useId();
  return (
    <svg viewBox="0 0 260 190" aria-hidden className="h-auto w-64 max-w-full" data-teapot="" data-pouring={pouring || undefined}>
      <defs>
        <clipPath id={cupClip}>
          <path d="M39 149h46l-6 27H45z" />
        </clipPath>
      </defs>
      <g data-teapot-steam="" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" className="text-muted-foreground/50">
        <path d="M145 37c-5-6 5-10 0-16" />
        <path d="M157 33c-5-6 5-10 0-16" />
        <path d="M169 37c-5-6 5-10 0-16" />
      </g>
      {/* A nested viewBox makes the rotation pivot the actual OpenMoji spout, independent of its size. */}
      <svg x="76" y="8" width="165.6" height="165.6" viewBox="0 0 72 72" overflow="visible">
        <g key={wobble} data-teapot-body="" className="text-foreground">
          <TeapotShape />
        </g>
      </svg>
      <g data-teapot-cup="" className="text-muted-foreground">
        <ellipse cx="62" cy="181" rx="34" ry="3" fill="currentColor" opacity="0.15" />
        <path d="M84 152h5c12 0 12 17-2 17h-6" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M38 148h48l-6 29H44z" fill="var(--card)" />
        {/* Constant horizontal motion and accelerating descent; paint tea above the stream inside the cup. */}
        <path
          data-teapot-stream=""
          d="M95.55 79.3Q78.775 83.5 62 173"
          pathLength="1"
          fill="none"
          stroke="#b5651d"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <g clipPath={`url(#${cupClip})`}>
          <g data-teapot-tea="">
            <rect x="37" y="154" width="50" height="25" fill="#b5651d" />
            <ellipse cx="62" cy="154" rx="24" ry="2.5" fill="#d99b52" />
          </g>
        </g>
        <path d="M38 148h48l-6 29H44z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      </g>
    </svg>
  );
};

/**
 * /418, after RFC 2324: this server is a teapot and may refuse to brew coffee. It does, with ever worse excuses,
 * until the eighteenth try, when it gives in and pours a cup of tea instead.
 */
const Teapot = () => {
  const t = useTranslate();
  const [clicks, setClicks] = useState(0);
  const answer = clicks > 0 ? teapotAnswer(clicks) : undefined;
  const poured = answer === "pour";

  return (
    <section className="min-h-full w-full">
      <div
        data-page-panel=""
        data-oddity="teapot"
        className="mx-auto flex w-full max-w-xl flex-col items-center gap-5 py-10 text-center sm:py-16"
      >
        <p className="font-mono text-xs text-muted-foreground">{poured ? "HTTP/1.1 200 Tea" : "HTTP/1.1 418 I'm a teapot"}</p>
        <TeapotArt pouring={poured} wobble={clicks} />
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("oddities.teapot.title")}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{t("oddities.teapot.lead")}</p>
        </header>

        <p aria-live="polite" className="min-h-12 max-w-md text-[15px] leading-relaxed text-foreground">
          {answer === undefined ? "" : poured ? t("oddities.teapot.pour") : t(`oddities.teapot.refusal-${answer}` as Translations)}
        </p>

        {poured ? (
          <Button variant="outline" onClick={() => setClicks(0)}>
            {t("oddities.teapot.again")}
          </Button>
        ) : (
          <Button onClick={() => setClicks(clicks + 1)}>{t("oddities.teapot.brew")}</Button>
        )}
        {clicks > 0 && !poured && (
          <p className="text-xs tabular-nums text-muted-foreground">{t("oddities.teapot.refused", { count: clicks })}</p>
        )}
        <a
          href="https://github.com/hfg-gmuend/openmoji/blob/master/color/svg/1FAD6.svg"
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-muted-foreground underline-offset-4 hover:underline"
        >
          OpenMoji · CC BY-SA 4.0
        </a>
      </div>
    </section>
  );
};

export default Teapot;
