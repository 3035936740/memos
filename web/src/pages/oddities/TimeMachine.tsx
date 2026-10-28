import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { deriveBlogMemoText } from "@/components/BlogMemoView";
import { Button } from "@/components/ui/button";
import { useInstance } from "@/contexts/InstanceContext";
import { useView } from "@/contexts/ViewContext";
import { useMemos } from "@/hooks/useMemoQueries";
import { cn } from "@/lib/utils";
import { blogStyleLabelKey, isStyledBlog } from "@/utils/blog-style";
import { useTranslate } from "@/utils/i18n";
import { bumpTimeMachineVisits, counterDigits, ERA_STYLES, ERAS, type Era, isEra } from "@/utils/oddities";

/** Posts shown inside the old (and future) browsers. */
const POST_COUNT = 3;

interface Post {
  href: string;
  title: string;
  tags: string[];
}

interface FrameProps {
  site: string;
  host: string;
  posts: Post[];
  visits: number;
}

const Era1985 = ({ site, posts }: FrameProps) => {
  const t = useTranslate();
  return (
    <div data-era="1985" className="font-mono text-sm leading-6">
      <p>{`${site.toUpperCase()} BBS  v1.0  (C) 1985`}</p>
      <p>{t("oddities.time.dos-memory")}</p>
      <p className="mt-3">C:\&gt; DIR /POSTS</p>
      {posts.map((post, index) => (
        <p key={post.href}>
          <Link to={post.href}>{`POST${String(index + 1).padStart(3, "0")}  TXT  ${post.title}`}</Link>
        </p>
      ))}
      <p>{t("oddities.time.dos-files", { count: posts.length })}</p>
      <p className="mt-3">
        C:\&gt; <span data-era-cursor="">_</span>
      </p>
    </div>
  );
};

const Era1999 = ({ site, host, posts, visits }: FrameProps) => {
  const t = useTranslate();
  return (
    <div data-era="1999">
      <div data-era-titlebar="">{`Netscape Navigator - [${site}]`}</div>
      <div data-era-toolbar="">
        {["Back", "Forward", "Reload", "Home", "Search", "Print"].map((label) => (
          <span key={label} data-era-button="">
            {label}
          </span>
        ))}
      </div>
      <div data-era-address="">{`Location: http://www.${host}/index.html`}</div>
      <div data-era-page="">
        <div data-era-marquee="">
          <span>{t("oddities.time.welcome", { site })}</span>
        </div>
        <h2 data-era-heading="">{t("oddities.time.homepage", { site })}</h2>
        <p data-era-construction="">{t("oddities.time.construction")}</p>
        <hr />
        <ul>
          {posts.map((post) => (
            <li key={post.href}>
              <Link to={post.href}>{post.title}</Link> <span data-era-new="">NEW!</span>
            </li>
          ))}
        </ul>
        <hr />
        <p className="text-center">
          {t("oddities.time.visitor-before")}
          <span data-era-counter="">
            {counterDigits(visits).map((digit, index) => (
              // The odometer's places never move.
              <span key={index}>{digit}</span>
            ))}
          </span>
          {t("oddities.time.visitor-after")}
        </p>
        <p data-era-footnote="">{t("oddities.time.best-viewed")}</p>
      </div>
    </div>
  );
};

const Era2009 = ({ site, host, posts }: FrameProps) => {
  const t = useTranslate();
  const tags = Array.from(new Set(posts.flatMap((post) => post.tags))).slice(0, 8);
  return (
    <div data-era="2009">
      <div data-era-titlebar="">
        <span>{site}</span>
        <span data-era-window-buttons="" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </div>
      <div data-era-address="">{`http://${host}/`}</div>
      <div data-era-page="">
        <h2 data-era-heading="">
          {site} <span data-era-beta="">Beta</span>
        </h2>
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <ul className="flex flex-col gap-3">
            {posts.map((post) => (
              <li key={post.href} data-era-post="">
                <Link to={post.href}>{post.title}</Link>
                <span data-era-more="">{t("oddities.time.read-more")}</span>
              </li>
            ))}
          </ul>
          <aside className="flex flex-col gap-3">
            <span data-era-rss="">{t("oddities.time.subscribe")}</span>
            {tags.length > 0 && (
              <p data-era-tags="">
                {tags.map((tag, index) => (
                  <span key={tag} style={{ fontSize: `${12 + ((index * 5) % 9)}px` }}>
                    {tag}{" "}
                  </span>
                ))}
              </p>
            )}
            <span data-era-share="">{t("oddities.time.share-2009")}</span>
          </aside>
        </div>
      </div>
    </div>
  );
};

const Era2049 = ({ site, posts }: FrameProps) => {
  const t = useTranslate();
  return (
    <div data-era="2049">
      <p data-era-status="">{t("oddities.time.neural-link", { site })}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {posts.map((post, index) => (
          <Link key={post.href} to={post.href} data-era-holo="" style={{ animationDelay: `${index * -1.3}s` }}>
            {post.title}
          </Link>
        ))}
      </div>
      <p data-era-footnote="">{t("oddities.time.readers-2049")}</p>
    </div>
  );
};

const FRAMES = { "1985": Era1985, "1999": Era1999, "2009": Era2009, "2049": Era2049 } satisfies Record<Era, (props: FrameProps) => unknown>;

/**
 * /time-machine: the site squeezed into the browser of another year (a 1985 terminal, a 1999 Netscape window with a
 * visitor counter, 2009 glass and a 2049 hologram), with its latest posts inside. "Stay in this era" puts on the
 * matching style.
 */
const TimeMachine = () => {
  const t = useTranslate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("year");
  const era: Era = isEra(requested) ? requested : "1999";
  const { generalSetting } = useInstance();
  const { feedLayout, styleId, setBlogStyle, setFeedLayout } = useView();
  const { data } = useMemos({ pageSize: POST_COUNT });
  const [visits, setVisits] = useState(0);
  const site = generalSetting.customProfile?.title || "Memos Plus";
  const eraStyle = ERA_STYLES[era];
  const staying = isStyledBlog(feedLayout) && styleId === eraStyle;

  // Every trip to 1999 is one more visitor, the way counters always were.
  useEffect(() => {
    if (era === "1999") setVisits(bumpTimeMachineVisits());
  }, [era]);

  const posts = useMemo<Post[]>(
    () =>
      (data?.memos ?? []).map((memo) => {
        const { title, excerpt } = deriveBlogMemoText(memo.content, memo.property?.title, memo.poll?.question);
        return { href: `/${memo.name}`, title: title || excerpt || t("memo.blog-untitled"), tags: memo.tags };
      }),
    [data?.memos, t],
  );

  const Frame = FRAMES[era];
  const stay = () => {
    setBlogStyle(eraStyle);
    if (!isStyledBlog(feedLayout)) setFeedLayout("blog2");
  };

  return (
    <section className="min-h-full w-full">
      <div data-page-panel="" data-oddity="time-machine" className="mx-auto w-full max-w-3xl py-8 sm:py-12">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("oddities.time.title")}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{t("oddities.time.lead")}</p>
        </header>

        <div role="tablist" aria-label={t("oddities.time.year")} className="mt-6 flex flex-wrap gap-1.5">
          {ERAS.map((year) => (
            <button
              key={year}
              type="button"
              role="tab"
              aria-selected={year === era}
              onClick={() => setSearchParams({ year }, { replace: true })}
              className={cn(
                "rounded-full border px-3.5 py-1 font-mono text-sm tabular-nums transition-colors",
                year === era ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {year}
            </button>
          ))}
        </div>

        <div data-time-machine-screen="" className="mt-5 overflow-hidden rounded-lg">
          <Frame site={site} host={window.location.host} posts={posts} visits={visits} />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{t("oddities.time.era-style", { style: t(blogStyleLabelKey(eraStyle)) })}</span>
          <Button variant="outline" size="sm" disabled={staying} onClick={stay}>
            {staying ? t("oddities.time.staying") : t("oddities.time.stay")}
          </Button>
        </div>
      </div>
    </section>
  );
};

export default TimeMachine;
