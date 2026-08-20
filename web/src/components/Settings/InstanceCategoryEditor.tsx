import { ArrowDownIcon, ArrowUpIcon, FolderIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type InstanceContentAccess, type InstanceMemoCategory, parseInstanceCategories } from "@/lib/instance-content";
import { useTranslate } from "@/utils/i18n";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

const normalizeCategories = (value: string): InstanceMemoCategory[] =>
  parseInstanceCategories(value).map((category) => ({
    slug: category.slug,
    title: category.title,
    description: category.description || "",
    access: category.access || "public",
  }));

const InstanceCategoryEditor = ({ value, onChange }: Props) => {
  const t = useTranslate();
  const categories = useMemo(() => normalizeCategories(value), [value]);
  const accessOptions: Array<{ value: InstanceContentAccess; label: string }> = [
    { value: "public", label: t("setting.content.access-public") },
    { value: "authenticated", label: t("setting.content.access-authenticated") },
    { value: "admin", label: t("setting.content.access-admin") },
  ];

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
    commit([...categories, { slug, title: t("setting.category.new-category"), description: "", access: "public" }]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("setting.category.editor-description")}</p>
        <Button type="button" size="sm" onClick={addCategory}>
          <PlusIcon className="size-4" />
          {t("setting.category.add")}
        </Button>
      </div>

      {categories.length === 0 && (
        <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {t("setting.category.empty")}
        </div>
      )}

      {categories.map((category, index) => (
        <section key={`category-${index}`} className="space-y-4 rounded-lg border bg-card/50 p-4">
          <div className="flex items-center gap-2">
            <FolderIcon className="size-4 text-muted-foreground" />
            <h4 className="min-w-0 flex-1 truncate text-sm font-medium">{category.title || t("setting.category.untitled")}</h4>
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
              disabled={index === categories.length - 1}
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
              onClick={() => commit(categories.filter((_, categoryIndex) => categoryIndex !== index))}
              aria-label={t("common.delete")}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("setting.category.name")}</Label>
              <Input
                value={category.title}
                onChange={(event) => update(index, { title: event.target.value })}
                placeholder={t("setting.category.name-placeholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("setting.category.path")}</Label>
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
              <Label>{t("setting.category.optional-description")}</Label>
              <Textarea
                value={category.description || ""}
                onChange={(event) => update(index, { description: event.target.value })}
                rows={2}
                placeholder={t("setting.category.description-placeholder")}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("setting.content.access")}</Label>
              <Select
                value={category.access || "public"}
                onValueChange={(access) => update(index, { access: access as InstanceContentAccess })}
              >
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
          </div>
        </section>
      ))}
    </div>
  );
};

export default InstanceCategoryEditor;
