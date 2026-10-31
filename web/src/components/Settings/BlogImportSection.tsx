import { CircleCheckIcon, CircleSlashIcon, FileUpIcon, ImageIcon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import useCurrentUser from "@/hooks/useCurrentUser";
import i18n from "@/i18n";
import { getErrorMessage } from "@/lib/error";
import {
  cancelImport,
  defaultSelection,
  formatOfFile,
  getImportJob,
  getImportSettings,
  IMPORT_LIMIT_RANGE,
  type ImportJob,
  type ImportPost,
  type ImportPreview,
  type ImportVisibility,
  isFinishedImport,
  previewImport,
  runImport,
  saveImportSettings,
} from "@/utils/blog-import";
import { type Translations, useTranslate } from "@/utils/i18n";
import { isSuperUser } from "@/utils/user";
import SettingGroup from "./SettingGroup";
import { SettingList, SettingListItem } from "./SettingList";
import SettingSection from "./SettingSection";

/** How often a running import is asked how far it got. */
const POLL_MS = 1500;
const VISIBILITIES: readonly ImportVisibility[] = ["PRIVATE", "PROTECTED", "PUBLIC"];

const formatDate = (value: string) => {
  const date = new Date(value);
  // Posts without a date arrive as Go's zero time, year 1.
  return Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1900 ? "" : date.toLocaleDateString(i18n.language);
};

/** Admins only: the largest export file anyone may upload, kept apart from the system settings' Save. */
const UploadLimit = () => {
  const t = useTranslate();
  const [value, setValue] = useState<number>();
  const [saved, setSaved] = useState<number>();

  useEffect(() => {
    getImportSettings()
      .then(({ maxUploadMb }) => {
        setValue(maxUploadMb);
        setSaved(maxUploadMb);
      })
      .catch(() => setValue(IMPORT_LIMIT_RANGE.fallback));
  }, []);

  const save = async () => {
    if (value === undefined) return;
    try {
      const { maxUploadMb } = await saveImportSettings(value);
      setSaved(maxUploadMb);
      toast.success(t("blog-import.limit-saved"));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <SettingListItem label={t("blog-import.limit")} description={t("blog-import.limit-description")}>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          className="w-24"
          min={IMPORT_LIMIT_RANGE.min}
          max={IMPORT_LIMIT_RANGE.max}
          value={value ?? ""}
          onChange={(event) =>
            setValue(Math.min(IMPORT_LIMIT_RANGE.max, Math.max(IMPORT_LIMIT_RANGE.min, Math.trunc(event.target.valueAsNumber) || 1)))
          }
        />
        <Button variant="outline" size="sm" disabled={value === undefined || value === saved} onClick={() => void save()}>
          {t("common.save")}
        </Button>
      </div>
    </SettingListItem>
  );
};

interface PostRowProps {
  post: ImportPost;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

const PostRow = ({ post, checked, onCheckedChange }: PostRowProps) => {
  const t = useTranslate();
  const skipped = !!post.skipReason;
  const labels = [post.category, ...post.tags.map((tag) => `#${tag}`)].filter(Boolean).join(" ");
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={skipped}
        aria-label={post.title || t("memo.blog-untitled")}
        onCheckedChange={(value: boolean) => onCheckedChange(value)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={skipped ? "text-sm text-muted-foreground line-through" : "text-sm text-foreground"}>
            {post.title || t("memo.blog-untitled")}
          </span>
          {post.draft && <Badge variant="outline">{t("blog-import.draft")}</Badge>}
          {post.private && <Badge variant="outline">{t("blog-import.private")}</Badge>}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {formatDate(post.created) && <span>{formatDate(post.created)}</span>}
          {labels && <span>{labels}</span>}
          {post.localImages + post.externalImages > 0 && (
            <span className="inline-flex items-center gap-1">
              <ImageIcon aria-hidden className="size-3" />
              {t("blog-import.images", { local: post.localImages, external: post.externalImages })}
            </span>
          )}
        </p>
        {skipped && <p className="mt-0.5 text-xs text-muted-foreground">{t("blog-import.skip-reason", { reason: post.skipReason })}</p>}
        {post.changes.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{post.changes.join("；")}</p>}
      </div>
    </li>
  );
};

/** One line of the report: what became of a post. */
const ReportRow = ({ entry }: { entry: ImportPost }) => {
  const t = useTranslate();
  const title = entry.title || t("memo.blog-untitled");
  const Icon = entry.state === "imported" ? CircleCheckIcon : entry.state === "skipped" ? CircleSlashIcon : TriangleAlertIcon;
  const tone = entry.state === "failed" ? "text-destructive" : "text-muted-foreground";
  return (
    <li className="flex items-start gap-2 px-3 py-2 text-sm">
      <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${tone}`} />
      <div className="min-w-0">
        {entry.memo ? (
          <Link to={`/${entry.memo}`} className="text-foreground underline-offset-2 hover:underline">
            {title}
          </Link>
        ) : (
          <span className="text-foreground">{title}</span>
        )}
        {(entry.error || entry.skipReason) && <p className="text-xs text-muted-foreground">{entry.error || entry.skipReason}</p>}
      </div>
    </li>
  );
};

/**
 * Settings → Spaces → Import: bring posts over from WordPress (its WXR export) or a folder of Markdown files (Hexo, Hugo,
 * Jekyll and the like, as a ZIP). The export is previewed first and nothing is written until the visitor picks the
 * posts and confirms; posts arrive private by default with their original dates, tags and categories.
 */
const BlogImportSection = ({ targetSpace }: { targetSpace?: { name: string; title: string } }) => {
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportPreview>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibility, setVisibility] = useState<ImportVisibility>("PRIVATE");
  const [job, setJob] = useState<ImportJob>();
  const [selectedCount, setSelectedCount] = useState(0);
  const finished = isFinishedImport(job?.state);

  // While an import runs, ask how far it got until it ends.
  useEffect(() => {
    if (!job || finished) return;
    const timer = window.setTimeout(() => {
      getImportJob(job.id)
        .then(setJob)
        .catch((error) => toast.error(getErrorMessage(error)));
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [finished, job]);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handlePreview = async () => {
    if (!file || !source.trim()) return;
    setBusy(true);
    try {
      const result = await previewImport(file, source, formatOfFile(file.name), targetSpace?.name);
      setPreview(result);
      setSelected(new Set(defaultSelection(result.posts)));
    } catch (error) {
      toast.error(getErrorMessage(error, t("blog-import.preview-failed")));
    } finally {
      setBusy(false);
    }
  };

  const handleRun = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const ids = preview.posts.filter((post) => selected.has(post.id)).map((post) => post.id);
      setSelectedCount(ids.length);
      setJob(await runImport({ previewId: preview.id, selectedIds: ids, visibility, space: targetSpace?.name }));
    } catch (error) {
      toast.error(getErrorMessage(error, t("blog-import.run-failed")));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!job) return;
    try {
      await cancelImport(job.id);
      setJob({ ...job, cancelRequested: true });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const startOver = () => {
    setFile(undefined);
    setPreview(undefined);
    setSelected(new Set());
    setJob(undefined);
  };

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const report = job?.report ?? undefined;
  const processed = report?.entries.length ?? 0;
  const percent = selectedCount ? Math.round((processed / selectedCount) * 100) : 0;
  const visibilityOptions = VISIBILITIES.map((value) => ({
    value,
    label: t(`memo.visibility.${value.toLowerCase() as "private" | "protected" | "public"}`),
  }));

  return (
    <SettingSection title={t(targetSpace ? "setting.import.label" : "blog-import.main-site")} description={t("blog-import.description")}>
      <p className="text-sm text-muted-foreground">
        {targetSpace ? t("blog-import.target-space", { space: targetSpace.title }) : t("blog-import.target-main")}
      </p>
      {!targetSpace && isSuperUser(currentUser) && (
        <SettingGroup title={t("blog-import.admin-title")}>
          <SettingList>
            <UploadLimit />
          </SettingList>
        </SettingGroup>
      )}

      {!preview && (
        <SettingGroup
          title={t("blog-import.step-file")}
          description={t("blog-import.formats")}
          showSeparator={!targetSpace && isSuperUser(currentUser)}
        >
          <div data-settings-surface="" className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{t("blog-import.source")}</span>
              <Input
                value={source}
                maxLength={120}
                placeholder={t("blog-import.source-placeholder")}
                onChange={(event) => setSource(event.target.value)}
              />
              <span className="text-xs leading-5 text-muted-foreground">{t("blog-import.source-hint")}</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <FileUpIcon className="size-4" />
                {file ? file.name : t("blog-import.choose-file")}
              </Button>
              <input ref={fileRef} type="file" accept=".zip,.xml,application/zip,text/xml,application/xml" hidden onChange={handleFile} />
              <Button disabled={!file || !source.trim() || busy} onClick={() => void handlePreview()}>
                {busy && <LoaderCircleIcon className="size-4 animate-spin" />}
                {t("blog-import.preview")}
              </Button>
            </div>
          </div>
        </SettingGroup>
      )}

      {preview && !job && (
        <SettingGroup
          title={t("blog-import.step-pick")}
          description={t("blog-import.summary", { total: preview.posts.length, selected: selected.size })}
          showSeparator
        >
          <ul
            data-settings-surface=""
            className="m-0 max-h-[28rem] list-none divide-y divide-border overflow-y-auto rounded-lg border border-border p-0"
          >
            {preview.posts.map((post) => (
              <PostRow key={post.id} post={post} checked={selected.has(post.id)} onCheckedChange={(checked) => toggle(post.id, checked)} />
            ))}
          </ul>
          <SettingList>
            <SettingListItem label={t("blog-import.visibility")} description={t("blog-import.visibility-description")}>
              <Select value={visibility} items={visibilityOptions} onValueChange={(value) => setVisibility(value as ImportVisibility)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {visibilityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingListItem>
          </SettingList>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={startOver}>
              {t("blog-import.start-over")}
            </Button>
            <Button disabled={busy || selected.size === 0} onClick={() => void handleRun()}>
              {busy && <LoaderCircleIcon className="size-4 animate-spin" />}
              {t("blog-import.run", { count: selected.size })}
            </Button>
          </div>
        </SettingGroup>
      )}

      {job && (
        <SettingGroup title={finished ? t("blog-import.step-done") : t("blog-import.step-running")} showSeparator>
          {!finished && (
            <div className="flex flex-col gap-2">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={selectedCount}
                aria-valuenow={processed}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("blog-import.progress", { done: processed, total: selectedCount })}</span>
                <Button variant="ghost" size="sm" disabled={job.cancelRequested} onClick={() => void handleCancel()}>
                  {job.cancelRequested ? t("blog-import.cancelling") : t("common.cancel")}
                </Button>
              </div>
            </div>
          )}
          {finished && (
            <>
              <p className="text-sm text-foreground">
                {t(`blog-import.state-${job.state}` as Translations)}{" "}
                {t("blog-import.counts", { imported: report?.imported ?? 0, skipped: report?.skipped ?? 0, failed: report?.failed ?? 0 })}
              </p>
              {report && report.entries.length > 0 && (
                <ul
                  data-settings-surface=""
                  className="m-0 max-h-[24rem] list-none divide-y divide-border overflow-y-auto rounded-lg border border-border p-0"
                >
                  {report.entries.map((entry) => (
                    <ReportRow key={entry.id} entry={entry} />
                  ))}
                </ul>
              )}
              <div className="flex justify-end">
                <Button variant="outline" onClick={startOver}>
                  {t("blog-import.again")}
                </Button>
              </div>
            </>
          )}
        </SettingGroup>
      )}
    </SettingSection>
  );
};

export default BlogImportSection;
