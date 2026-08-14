import { ArrowDownIcon, ArrowUpIcon, CheckIcon, FolderIcon, PlusIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useInfiniteMemos } from "@/hooks/useMemoQueries";
import { type InstanceContentAccess, type InstanceMemoCategory, parseInstanceCategories } from "@/lib/instance-content";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

const ACCESS_OPTIONS: Array<{ value: InstanceContentAccess; label: string }> = [
  { value: "public", label: "所有人（包括游客）" },
  { value: "authenticated", label: "仅登录用户" },
  { value: "admin", label: "仅管理员" },
];

const normalizeCategories = (value: string): InstanceMemoCategory[] =>
  parseInstanceCategories(value).map((category) => ({
    ...category,
    access: category.access || "public",
    memoNames: Array.isArray(category.memoNames) ? category.memoNames : [],
  }));

const InstanceCategoryEditor = ({ value, onChange }: Props) => {
  const categories = useMemo(() => normalizeCategories(value), [value]);
  const [pickerIndex, setPickerIndex] = useState<number>();
  const [search, setSearch] = useState("");
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteMemos(
    { pageSize: 100 },
    { enabled: pickerIndex !== undefined },
  );
  const memos = useMemo(() => data?.pages.flatMap((page) => page.memos) ?? [], [data]);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredMemos = useMemo(
    () =>
      memos.filter((memo) => {
        if (!normalizedSearch) return true;
        return memo.content.toLocaleLowerCase().includes(normalizedSearch) || memo.name.toLocaleLowerCase().includes(normalizedSearch);
      }),
    [memos, normalizedSearch],
  );

  const commit = (nextCategories: InstanceMemoCategory[]) => onChange(JSON.stringify(nextCategories));
  const update = (index: number, partial: Partial<InstanceMemoCategory>) => {
    commit(categories.map((category, categoryIndex) => (categoryIndex === index ? { ...category, ...partial } : category)));
  };
  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= categories.length) return;
    const nextCategories = [...categories];
    [nextCategories[index], nextCategories[target]] = [nextCategories[target], nextCategories[index]];
    commit(nextCategories);
    setPickerIndex(undefined);
  };
  const addCategory = () => {
    const slug = `category-${Date.now().toString(36)}`;
    commit([...categories, { slug, title: "新分类", description: "", memoNames: [], access: "public" }]);
  };
  const toggleMemo = (categoryIndex: number, memoName: string, checked: boolean) => {
    const current = categories[categoryIndex].memoNames;
    const memoNames = checked ? [...new Set([...current, memoName])] : current.filter((name) => name !== memoName);
    update(categoryIndex, { memoNames });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">创建分类并勾选需要归入该分类的备忘录。分类会自动出现在主导航的下拉菜单中。</p>
        <Button type="button" size="sm" onClick={addCategory}>
          <PlusIcon className="size-4" />
          添加分类
        </Button>
      </div>

      {categories.length === 0 && (
        <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          暂无分类。点击“添加分类”开始整理备忘录。
        </div>
      )}

      {categories.map((category, index) => {
        const pickerOpen = pickerIndex === index;
        return (
          <section key={`category-${index}`} className="space-y-4 rounded-lg border bg-card/50 p-4">
            <div className="flex items-center gap-2">
              <FolderIcon className="size-4 text-muted-foreground" />
              <h4 className="min-w-0 flex-1 truncate text-sm font-medium">{category.title || "未命名分类"}</h4>
              <span className="text-xs text-muted-foreground">{category.memoNames.length} 篇</span>
              <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label="上移">
                <ArrowUpIcon className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={index === categories.length - 1}
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
                onClick={() => {
                  commit(categories.filter((_, categoryIndex) => categoryIndex !== index));
                  setPickerIndex(undefined);
                }}
                aria-label="删除"
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>分类名称</Label>
                <Input value={category.title} onChange={(event) => update(index, { title: event.target.value })} placeholder="例如：设计" />
              </div>
              <div className="space-y-1.5">
                <Label>分类路径</Label>
                <div className="flex overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-ring/50">
                  <span className="flex items-center bg-muted px-2 text-sm text-muted-foreground">/categories/</span>
                  <Input
                    value={category.slug}
                    onChange={(event) => update(index, { slug: event.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })}
                    className="rounded-none border-0 shadow-none focus-visible:ring-0"
                    placeholder="design"
                  />
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>分类说明（可选）</Label>
                <Textarea
                  value={category.description || ""}
                  onChange={(event) => update(index, { description: event.target.value })}
                  rows={2}
                  placeholder="简要介绍这个分类收录的内容"
                />
              </div>
              <div className="space-y-1.5">
                <Label>访问权限</Label>
                <Select
                  value={category.access || "public"}
                  onValueChange={(access) => update(index, { access: access as InstanceContentAccess })}
                >
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
              <div className="flex items-end">
                <Button
                  type="button"
                  variant={pickerOpen ? "secondary" : "outline"}
                  className="w-full"
                  onClick={() => {
                    setPickerIndex(pickerOpen ? undefined : index);
                    setSearch("");
                  }}
                >
                  {pickerOpen ? <XIcon className="size-4" /> : <CheckIcon className="size-4" />}
                  {pickerOpen ? "收起备忘录选择" : `选择备忘录（已选 ${category.memoNames.length}）`}
                </Button>
              </div>
            </div>

            {pickerOpen && (
              <div className="space-y-2 rounded-md border bg-background/50 p-3">
                {category.memoNames.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {category.memoNames.map((name) => {
                      const selectedMemo = memos.find((memo) => memo.name === name);
                      const label = selectedMemo?.content.replace(/\s+/g, " ").trim() || name;
                      return (
                        <button
                          type="button"
                          key={name}
                          className="flex max-w-full items-center gap-1 rounded-full border bg-muted/50 px-2 py-1 text-xs hover:bg-muted"
                          onClick={() => toggleMemo(index, name, false)}
                          title="从分类中移除"
                        >
                          <span className="max-w-48 truncate">{label}</span>
                          <XIcon className="size-3 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" placeholder="搜索备忘录内容" />
                </div>
                <div className="max-h-80 divide-y overflow-y-auto rounded-md border">
                  {filteredMemos.map((memo) => {
                    const checked = category.memoNames.includes(memo.name);
                    const summary = memo.content.replace(/\s+/g, " ").trim() || "（无文字内容）";
                    return (
                      <label key={memo.name} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/50">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => toggleMemo(index, memo.name, value === true)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block text-sm">{summary}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{memo.name}</span>
                        </span>
                      </label>
                    );
                  })}
                  {filteredMemos.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">没有匹配的备忘录。</p>}
                </div>
                {hasNextPage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={isFetchingNextPage}
                    onClick={() => fetchNextPage()}
                  >
                    {isFetchingNextPage ? "正在加载……" : "加载更多备忘录"}
                  </Button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default InstanceCategoryEditor;
