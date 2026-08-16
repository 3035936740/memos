import { CheckIcon, ChevronDownIcon, FolderIcon, XIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useInstance } from "@/contexts/InstanceContext";
import { parseInstanceCategories } from "@/lib/instance-content";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";

interface Props {
  value?: string;
  onChange: (category?: string) => void;
  onOpenChange?: (open: boolean) => void;
  size?: "default" | "compact";
}

const CategorySelector = ({ value, onChange, onOpenChange, size = "default" }: Props) => {
  const t = useTranslate();
  const compact = size === "compact";
  const { generalSetting } = useInstance();
  const categories = parseInstanceCategories(generalSetting.memoCategoriesJson).filter((category) => category.slug && category.title);

  if (categories.length === 0) {
    return null;
  }

  const current = categories.find((category) => category.slug === value);
  const currentLabel = current?.title || t("memo.category.none");

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <button
            className={cn(
              "inline-flex items-center rounded-md hover:bg-accent transition-colors",
              compact ? "px-1.5 py-[3px] text-[13px] leading-5 text-foreground/85" : "h-8 px-2 text-sm text-muted-foreground",
            )}
          />
        }
      >
        <FolderIcon className={cn("opacity-60 mr-1.5", compact ? "size-3.5" : "size-4")} />
        <span className="max-w-28 truncate">{currentLabel}</span>
        <ChevronDownIcon className={cn("ml-0.5 opacity-60", compact ? "size-3.5 text-muted-foreground/70" : "w-4 h-4")} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => onChange(undefined)}>
          <XIcon className="size-4 opacity-60" />
          <div className="flex flex-col">
            <span>{t("memo.category.none")}</span>
            <span className="text-xs text-muted-foreground">{t("memo.category.none-description")}</span>
          </div>
          {!value && <CheckIcon className="ml-auto w-4 h-4 text-primary" />}
        </DropdownMenuItem>
        {categories.map((category) => (
          <DropdownMenuItem key={category.slug} onClick={() => onChange(category.slug)}>
            <FolderIcon className="size-4 opacity-60" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate">{category.title}</span>
              {category.description ? <span className="truncate text-xs text-muted-foreground">{category.description}</span> : null}
            </div>
            {value === category.slug && <CheckIcon className="ml-auto w-4 h-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default CategorySelector;
