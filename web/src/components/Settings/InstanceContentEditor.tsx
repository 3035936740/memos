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
  { value: "link", label: "链接" },
  { value: "book", label: "书本" },
  { value: "info", label: "信息" },
  { value: "folder", label: "文件夹" },
  { value: "earth", label: "地球" },
  { value: "attachment", label: "附件" },
];

const ACCESS_OPTIONS: Array<{ value: InstanceContentAccess; label: string }> = [
  { value: "public", label: "所有人（包括游客）" },
  { value: "authenticated", label: "仅登录用户" },
  { value: "admin", label: "仅管理员" },
];

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
      <div className="flex flex-wrap gap-1" aria-label="Markdown 工具栏">
        <MarkdownTool icon={Heading1Icon} label="标题" onClick={() => insert("# ", "", "标题")} />
        <MarkdownTool icon={BoldIcon} label="粗体" onClick={() => insert("**", "**", "粗体文字")} />
        <MarkdownTool icon={ItalicIcon} label="斜体" onClick={() => insert("*", "*", "斜体文字")} />
        <MarkdownTool icon={LinkIcon} label="链接" onClick={() => insert("[", "](https://)", "链接文字")} />
        <MarkdownTool icon={ListIcon} label="列表" onClick={() => insert("- ", "", "列表项")} />
        <MarkdownTool icon={QuoteIcon} label="引用" onClick={() => insert("> ", "", "引用内容")} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-1.5">
          <Label>页面正文</Label>
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={14}
            placeholder="# 页面标题\n\n从这里开始写内容……"
            className="min-h-64 resize-y font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label>实时预览</Label>
          <div className="min-h-64 overflow-auto rounded-md border bg-background/60 p-4 text-sm">
            {value.trim() ? (
              <MemoMarkdownRenderer content={value} resolvedMentionUsernames={new Set()} standalone />
            ) : (
              <p className="text-muted-foreground">正文预览会显示在这里。</p>
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
  const entries = useMemo(() => buildEntries(navigationJson, pagesJson), [navigationJson, pagesJson]);

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
        title: "新页面",
        slug,
        path: pagePath(slug),
        markdown: "# 新页面\n\n在这里填写页面内容。",
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
        title: "新链接",
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
        <p className="text-sm text-muted-foreground">在一个地方管理导航按钮和页面正文；修改后点击本页底部的“保存”。</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addLink}>
            <ExternalLinkIcon className="size-4" />
            添加链接
          </Button>
          <Button type="button" size="sm" onClick={addPage}>
            <PlusIcon className="size-4" />
            添加页面
          </Button>
        </div>
      </div>

      {entries.length === 0 && (
        <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          暂无自定义内容。点击“添加页面”创建关于、友链等页面。
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
              {entry.title || (entry.kind === "page" ? "未命名页面" : "未命名链接")}
            </h4>
            <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label="上移">
              <ArrowUpIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={index === entries.length - 1}
              onClick={() => move(index, 1)}
              aria-label="下移"
            >
              <ArrowDownIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              onClick={() => commit(entries.filter((_, entryIndex) => entryIndex !== index))}
              aria-label="删除"
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>显示名称</Label>
              <Input value={entry.title} onChange={(event) => update(index, { title: event.target.value })} placeholder="例如：关于" />
            </div>
            {entry.kind === "page" ? (
              <div className="space-y-1.5">
                <Label>页面路径</Label>
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
                <Label>跳转地址</Label>
                <Input
                  value={entry.path}
                  onChange={(event) => update(index, { path: event.target.value })}
                  placeholder="https://example.com"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>访问权限</Label>
              <Select value={entry.access} onValueChange={(access) => update(index, { access: access as InstanceContentAccess })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Lucide 图标</Label>
              <Select value={entry.icon} onValueChange={(icon) => update(index, { icon })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>自定义图标图片 URL（可选，填写后优先使用）</Label>
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
                  <Label>显示在主导航栏</Label>
                  <p className="text-xs text-muted-foreground">关闭后页面仍可通过链接访问。</p>
                </div>
                <Switch checked={entry.showInNavigation} onCheckedChange={(showInNavigation) => update(index, { showInNavigation })} />
              </div>
              <MarkdownField value={entry.markdown} onChange={(markdown) => update(index, { markdown })} />
            </>
          )}

          {entry.kind === "link" && (
            <p className={cn("text-xs text-muted-foreground", !entry.path.trim() && "text-destructive")}>
              外部链接会在新标签页打开，站内路径会在当前页面跳转。
            </p>
          )}
        </section>
      ))}
    </div>
  );
};

export default InstanceContentEditor;
