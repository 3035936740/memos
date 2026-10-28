import {
  BookOpenIcon,
  CodeIcon,
  ExternalLinkIcon,
  FolderGit2Icon,
  GitForkIcon,
  GlobeIcon,
  type LucideIcon,
  ScissorsIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { useInstance } from "@/contexts/InstanceContext";
import { WEB_CLIPPER_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { ODDITY_PAGES } from "@/utils/oddities";
import { parsePlusVersion } from "@/utils/plus-version";

const PROJECT_REPOSITORY = "https://github.com/3035936740/memos";
const UPSTREAM_REPOSITORY = "https://github.com/usememos/memos";
const DEMO_SITE = "https://memos.bing.tomato-universe.tech/";

const DEFAULT_TITLE = "Memos Plus";
const DEFAULT_LOGO = "/logo.webp";

const isCommitSha = (commit: string) => /^[0-9a-f]{7,40}$/i.test(commit);

const ExternalLink = ({ href, className, children }: { href?: string; className?: string; children: React.ReactNode }) =>
  href ? (
    <a className={cn("underline-offset-2 hover:text-foreground hover:underline", className)} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  );

interface ProjectLink {
  label: string;
  note: string;
  href: string;
  icon: LucideIcon;
}

const About = () => {
  const t = useTranslate();
  const { profile, generalSetting } = useInstance();

  const customProfile = generalSetting.customProfile;
  const instanceTitle = customProfile?.title || DEFAULT_TITLE;
  const instanceTagline = customProfile?.description || t("about.tagline");
  const instanceLogo = customProfile?.logoUrl || DEFAULT_LOGO;

  const version = parsePlusVersion(profile.version);
  const releaseUrl = version?.releaseTag ? `${PROJECT_REPOSITORY}/releases/tag/${version.releaseTag}` : undefined;
  const upstreamUrl = version?.upstreamTag ? `${UPSTREAM_REPOSITORY}/releases/tag/${version.upstreamTag}` : undefined;
  const commit = isCommitSha(profile.commit) ? profile.commit : "";

  const projectLinks: ProjectLink[] = [
    { label: t("about.demo-site"), note: t("about.demo-site-note"), href: DEMO_SITE, icon: GlobeIcon },
    { label: t("about.documents"), note: t("about.plus-documents-note"), href: `${PROJECT_REPOSITORY}#readme`, icon: BookOpenIcon },
    { label: t("about.github-repository"), note: t("about.github-repository-note"), href: PROJECT_REPOSITORY, icon: FolderGit2Icon },
    { label: t("about.upstream-project"), note: "usememos/memos", href: UPSTREAM_REPOSITORY, icon: GitForkIcon },
    { label: t("about.api-docs"), note: t("about.api-docs-note"), href: "https://usememos.com/docs/api", icon: CodeIcon },
    { label: t("about.web-clipper"), note: t("about.web-clipper-platforms"), href: WEB_CLIPPER_URL, icon: ScissorsIcon },
  ];

  return (
    <section className="min-h-full w-full">
      <div data-page-panel="" className="mx-auto w-full max-w-2xl py-6 sm:py-8">
        <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:gap-5 sm:text-left">
          <img
            className="size-16 shrink-0 select-none rounded-2xl bg-card object-cover shadow-sm ring-1 ring-border"
            src={instanceLogo}
            alt=""
            draggable={false}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{instanceTitle}</h1>
              {instanceTitle !== DEFAULT_TITLE && <Badge variant="secondary">Memos Plus</Badge>}
              {profile.demo && <Badge variant="warning">{t("about.demo")}</Badge>}
            </div>
            <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{instanceTagline}</p>
          </div>
        </header>

        <section
          aria-labelledby="about-version"
          data-settings-surface=""
          className="mt-8 overflow-hidden rounded-xl border border-border bg-card"
        >
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-5 pb-4 pt-5">
            <div className="min-w-0">
              <h2 id="about-version" className="text-sm text-muted-foreground">
                {t("about.plus-version")}
              </h2>
              {version ? (
                <>
                  <p className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="break-all text-4xl font-semibold tracking-tight tabular-nums text-foreground">{version.plus}</span>
                    <Badge variant={version.channel === "stable" ? "secondary" : "outline"} shape="pill">
                      {t(`about.channel-${version.channel}`)}
                    </Badge>
                  </p>
                  {version.upstream && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("about.based-on")} <ExternalLink href={upstreamUrl}>Memos {version.upstream}</ExternalLink>
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">{t("about.version-unknown")}</p>
              )}
            </div>
            {releaseUrl && (
              <a
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                href={releaseUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t("about.release-notes")}
                <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
              </a>
            )}
          </div>
          {version?.channel === "dev" && <p className="px-5 pb-4 text-xs leading-5 text-muted-foreground">{t("about.dev-build-note")}</p>}
          <dl className="grid grid-cols-2 border-t border-border text-sm">
            <div className="px-5 py-3">
              <dt className="text-xs text-muted-foreground">{t("about.commit")}</dt>
              <dd className="m-0 mt-0.5 font-mono text-[13px] text-foreground">
                {commit ? <ExternalLink href={`${PROJECT_REPOSITORY}/commit/${commit}`}>{commit.slice(0, 7)}</ExternalLink> : "—"}
              </dd>
            </div>
            <div className="border-l border-border px-5 py-3">
              <dt className="text-xs text-muted-foreground">{t("about.license")}</dt>
              <dd className="m-0 mt-0.5 text-[13px] text-foreground">
                <ExternalLink href={`${PROJECT_REPOSITORY}/blob/main/LICENSE`}>MIT</ExternalLink>
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="about-links" className="mt-8">
          <h2 id="about-links" className="text-sm font-medium text-foreground">
            {t("about.project")}
          </h2>
          <nav aria-label={t("about.project-links")} className="mt-3 grid gap-2 sm:grid-cols-2">
            {projectLinks.map((link) => (
              <a
                key={link.href}
                data-settings-surface=""
                className="group flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 transition-colors hover:bg-accent/60"
                href={link.href}
                target="_blank"
                rel="noreferrer"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
                  <link.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{link.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{link.note}</span>
                </span>
                <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground/70 group-hover:text-foreground" />
              </a>
            ))}
          </nav>
        </section>

        <p className="mt-8 text-sm leading-relaxed text-muted-foreground">{t("about.plus-description")}</p>

        {/* For the curious: one faint dot for each odd page beside the app. */}
        <nav aria-label={t("oddities.title")} className="mt-12 flex justify-center gap-3">
          {ODDITY_PAGES.map((page) => (
            <Link
              key={page.path}
              to={page.path}
              title={page.path}
              aria-label={t(page.labelKey)}
              className="size-1.5 rounded-full bg-muted-foreground/25 transition-colors hover:bg-muted-foreground/70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            />
          ))}
        </nav>
      </div>
    </section>
  );
};

export default About;
