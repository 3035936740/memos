import { ArrowDownIcon, ArrowUpIcon, FolderIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
    slug: category.slug,
    title: category.title,
    description: category.description || "",
    access: category.access || "public",
  }));

const InstanceCategoryEditor = ({ value, onChange }: Props) => {
  const categories = useMemo(() => normalizeCategories(value), [value]);

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
  };
  const addCategory = () => {
    const slug = `category-${Date.now().toString(36)}`;
    commit([...categories, { slug, title: "新分类", description: "", access: "public" }]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">创建分类并设置访问权限。登录用户可在发布/编辑备忘录时选择类目。</p>
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

      {categories.map((category, index) => (
        <section key={`category-${index}`} className="space-y-4 rounded-lg border bg-card/50 p-4">
          <div className="flex items-center gap-2">
            <FolderIcon className="size-4 text-muted-foreground" />
            <h4 className="min-w-0 flex-1 truncate text-sm font-medium">{category.title || "未命名分类"}</h4>
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
              onClick={() => commit(categories.filter((_, categoryIndex) => categoryIndex !== index))}
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
            <div className="space-y-1.5 sm:col-span-2">
              <Label>访问权限</Label>
              <Select value={category.access || "public"} onValueChange={(access) => update(index, { access: access as InstanceContentAccess })}>
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
          </div>
        </section>
      ))}
    </div>
  );
};

export default InstanceCategoryEditor;
