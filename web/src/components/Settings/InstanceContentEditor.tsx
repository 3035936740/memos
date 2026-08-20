import {
  ArrowDownIcon,
  ArrowUpIcon,
  BoldIcon,
  ExternalLinkIcon,
  FileTextIcon,
  Heading1Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  PlusIcon,
  QuoteIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useRef } from "react";
import { MemoMarkdownRenderer } from "@/components/MemoContent/MemoMarkdownRenderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  type InstanceContentAccess,
  type InstanceMarkdownPage,
  type InstanceNavigationItem,
  parseInstanceNavigation,
  parseInstancePages,
} from "@/lib/instance-content";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";

interface Props {
  navigationJson: string;
  pagesJson: string;
  onNavigationChange: (value: string) => void;
  onPagesChange: (value: string) => void;
}

interface EditorEntry {
  kind: "page" | "link";
  id: string;
  title: string;
  slug: string;
  path: string;
  markdown: string;
  icon: string;
  iconUrl: string;
  access: InstanceContentAccess;
  showInNavigation: boolean;
}

const ICON_OPTIONS = [
  { value: "link", labelKey: "setting.content.icon-link" },
  { value: "book", labelKey: "setting.content.icon-book" },
  { value: "info", labelKey: "setting.content.icon-info" },
  { value: "folder", labelKey: "setting.content.icon-folder" },
  { value: "earth", labelKey: "setting.content.icon-earth" },
  { value: "attachment", labelKey: "setting.content.icon-attachment" },
] as const;

const pagePath = (slug: string) => `/pages/${slug.trim()}`;

const buildEntries = (navigationJson: string, pagesJson: string): EditorEntry[] => {
  const navigation = parseInstanceNavigation(navigationJson);
  const pages = parseInstancePages(pagesJson);
  const pagesByPath = new Map(pages.map((page) => [pagePath(page.slug), page]));
  const includedPages = new Set<string>();

  const entries = navigation.map<EditorEntry>((item) => {
    const page = pagesByPath.get(item.path);
    if (page) {
      includedPages.add(page.slug);
      return {
        kind: "page",
        id: item.id || page.slug,
        title: page.title || item.label,
        slug: page.slug,
        path: item.path,
        markdown: page.markdown,
        icon: item.icon || page.icon || "book",
        iconUrl: item.iconUrl || page.iconUrl || "",
        access: page.access || item.access || "public",
        showInNavigation: true,
      };
    }
    return {
      kind: "link",
      id: item.id,
      title: item.label,
      slug: "",
      path: item.path,
      markdown: "",
      icon: item.icon || "link",
      iconUrl: item.iconUrl || "",
      access: item.access || "public",
      showInNavigation: true,
    };
  });

  for (const page of pages) {
    if (includedPages.has(page.slug)) continue;
    entries.push({
      kind: "page",
      id: page.slug,
      title: page.title,
      slug: page.slug,
      path: pagePath(page.slug),
      markdown: page.markdown,
      icon: page.icon || "book",
      iconUrl: page.iconUrl || "",
      access: page.access || "public",
      showInNavigation: false,
    });
  }

  return entries;
};

const serializeEntries = (entries: EditorEntry[]) => {
  const pages: InstanceMarkdownPage[] = entries
    .filter((entry) => entry.kind === "page")
    .map((entry) => ({
      slug: entry.slug.trim(),
      title: entry.title.trim(),
      markdown: entry.markdown,
      access: entry.access,
      icon: entry.icon,
      iconUrl: entry.iconUrl.trim() || undefined,
    }));

  const navigation: InstanceNavigationItem[] = entries
    .filter((entry) => entry.kind === "link" || entry.showInNavigation)
    .map((entry) => ({
      id: (entry.kind === "page" ? entry.slug : entry.id).trim(),
      label: entry.title.trim(),
      path: entry.kind === "page" ? pagePath(entry.slug) : entry.path.trim(),
      icon: entry.icon,
      iconUrl: entry.iconUrl.trim() || undefined,
      access: entry.access,
    }));

  return {
    navigationJson: JSON.stringify(navigation),
    pagesJson: JSON.stringify(pages),
  };
};

const MarkdownField = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const t = useTranslate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insert = (before: string, after: string, placeholder: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || placeholder;
    const nextValue = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(nextValue);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1" aria-label={t("setting.content.markdown-toolbar")}>
        <MarkdownTool icon={Heading1Icon} label={t("editor.format.heading")} onClick={() => insert("# ", "", t("editor.format.heading"))} />
        <MarkdownTool
          icon={BoldIcon}
          label={t("editor.format.bold")}
          onClick={() => insert("**", "**", t("setting.content.bold-placeholder"))}
        />
        <MarkdownTool
          icon={ItalicIcon}
          label={t("editor.format.italic")}
          onClick={() => insert("*", "*", t("setting.content.italic-placeholder"))}
        />
        <MarkdownTool
          icon={LinkIcon}
          label={t("editor.format.link")}
          onClick={() => insert("[", "](https://)", t("setting.content.link-placeholder"))}
        />
        <MarkdownTool
          icon={ListIcon}
          label={t("setting.content.list")}
          onClick={() => insert("- ", "", t("setting.content.list-placeholder"))}
        />
        <MarkdownTool
          icon={QuoteIcon}
          label={t("setting.content.quote")}
          onClick={() => insert("> ", "", t("setting.content.quote-placeholder"))}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("setting.content.page-body")}</Label>
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={14}
            placeholder={t("setting.content.page-body-placeholder")}
            className="min-h-64 resize-y font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("setting.content.live-preview")}</Label>
          <div className="min-h-64 overflow-auto rounded-md border bg-background/60 p-4 text-sm">
            {value.trim() ? (
              <MemoMarkdownRenderer content={value} resolvedMentionUsernames={new Set()} standalone />
            ) : (
              <p className="text-muted-foreground">{t("setting.content.preview-placeholder")}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const MarkdownTool = ({ icon: Icon, label, onClick }: { icon: typeof BoldIcon; label: string; onClick: () => void }) => (
  <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 px-2" onClick={onClick} title={label}>
    <Icon className="size-3.5" />
    <span className="text-xs">{label}</span>
  </Button>
);

const InstanceContentEditor = ({ navigationJson, pagesJson, onNavigationChange, onPagesChange }: Props) => {
  const t = useTranslate();
  const entries = useMemo(() => buildEntries(navigationJson, pagesJson), [navigationJson, pagesJson]);
  const accessOptions: Array<{ value: InstanceContentAccess; label: string }> = [
    { value: "public", label: t("setting.content.access-public") },
    { value: "authenticated", label: t("setting.content.access-authenticated") },
    { value: "admin", label: t("setting.content.access-admin") },
  ];

  const commit = (nextEntries: EditorEntry[]) => {
    const serialized = serializeEntries(nextEntries);
    onNavigationChange(serialized.navigationJson);
    onPagesChange(serialized.pagesJson);
  };

  const update = (index: number, partial: Partial<EditorEntry>) => {
    commit(entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...partial } : entry)));
  };

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= entries.length) return;
    const nextEntries = [...entries];
    [nextEntries[index], nextEntries[target]] = [nextEntries[target], nextEntries[index]];
    commit(nextEntries);
  };

  const addPage = () => {
    const slug = `page-${Date.now().toString(36)}`;
    commit([
      ...entries,
      {
        kind: "page",
        id: slug,
        title: t("setting.content.new-page"),
        slug,
        path: pagePath(slug),
        markdown: t("setting.content.new-page-markdown"),
        icon: "book",
        iconUrl: "",
        access: "public",
        showInNavigation: true,
      },
    ]);
  };

  const addLink = () => {
    const id = `link-${Date.now().toString(36)}`;
    commit([
      ...entries,
      {
        kind: "link",
        id,
        title: t("setting.content.new-link"),
        slug: "",
        path: "https://",
        markdown: "",
        icon: "link",
        iconUrl: "",
        access: "public",
        showInNavigation: true,
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("setting.content.editor-description")}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addLink}>
            <ExternalLinkIcon className="size-4" />
            {t("setting.content.add-link")}
          </Button>
          <Button type="button" size="sm" onClick={addPage}>
            <PlusIcon className="size-4" />
            {t("setting.content.add-page")}
          </Button>
        </div>
      </div>

      {entries.length === 0 && (
        <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {t("setting.content.empty")}
        </div>
      )}

      {entries.map((entry, index) => (
        <section key={`${entry.kind}-${index}`} className="space-y-4 rounded-lg border bg-card/50 p-4">
          <div className="flex items-center gap-2">
            {entry.kind === "page" ? (
              <FileTextIcon className="size-4 text-muted-foreground" />
            ) : (
              <ExternalLinkIcon className="size-4 text-muted-foreground" />
            )}
            <h4 className="min-w-0 flex-1 truncate text-sm font-medium">
              {entry.title || (entry.kind === "page" ? t("setting.content.untitled-page") : t("setting.content.untitled-link"))}
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label={t("common.move-up")}
            >
              <ArrowUpIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={index === entries.length - 1}
              onClick={() => move(index, 1)}
              aria-label={t("common.move-down")}
            >
              <ArrowDownIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              onClick={() => commit(entries.filter((_, entryIndex) => entryIndex !== index))}
              aria-label={t("common.delete")}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("setting.content.display-name")}</Label>
              <Input
                value={entry.title}
                onChange={(event) => update(index, { title: event.target.value })}
                placeholder={t("setting.content.display-name-placeholder")}
              />
            </div>
            {entry.kind === "page" ? (
              <div className="space-y-1.5">
                <Label>{t("setting.content.page-path")}</Label>
                <div className="flex overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-ring/50">
                  <span className="flex items-center bg-muted px-2 text-sm text-muted-foreground">/pages/</span>
                  <Input
                    value={entry.slug}
                    onChange={(event) => update(index, { slug: event.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })}
                    className="rounded-none border-0 shadow-none focus-visible:ring-0"
                    placeholder="about"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>{t("setting.content.destination")}</Label>
                <Input
                  value={entry.path}
                  onChange={(event) => update(index, { path: event.target.value })}
                  placeholder="https://example.com"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{t("setting.content.access")}</Label>
              <Select value={entry.access} onValueChange={(access) => update(index, { access: access as InstanceContentAccess })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accessOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("setting.content.lucide-icon")}</Label>
              <Select value={entry.icon} onValueChange={(icon) => update(index, { icon })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("setting.content.custom-icon-url")}</Label>
              <Input
                value={entry.iconUrl}
                onChange={(event) => update(index, { iconUrl: event.target.value })}
                placeholder="https://example.com/icon.png"
              />
            </div>
          </div>

          {entry.kind === "page" && (
            <>
              <div className="flex items-center justify-between rounded-md border bg-background/40 px-3 py-2">
                <div>
                  <Label>{t("setting.content.show-in-navigation")}</Label>
                  <p className="text-xs text-muted-foreground">{t("setting.content.show-in-navigation-description")}</p>
                </div>
                <Switch checked={entry.showInNavigation} onCheckedChange={(showInNavigation) => update(index, { showInNavigation })} />
              </div>
              <MarkdownField value={entry.markdown} onChange={(markdown) => update(index, { markdown })} />
            </>
          )}

          {entry.kind === "link" && (
            <p className={cn("text-xs text-muted-foreground", !entry.path.trim() && "text-destructive")}>
              {t("setting.content.link-behavior")}
            </p>
          )}
        </section>
      ))}
    </div>
  );
};

export default InstanceContentEditor;
