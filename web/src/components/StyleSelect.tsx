import {
  BookOpenIcon,
  CircleIcon,
  CrownIcon,
  DropletsIcon,
  Gamepad2Icon,
  GlassWaterIcon,
  LayoutTemplateIcon,
  PaletteIcon,
  PencilIcon,
  SparklesIcon,
  SquareTerminalIcon,
  SunsetIcon,
} from "lucide-react";
import { type ReactElement, useState } from "react";
import ReactionCodex from "@/components/StyledBlog/ReactionCodex";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useView } from "@/contexts/ViewContext";
import useCurrentTheme from "@/hooks/useCurrentTheme";
import i18n from "@/i18n";
import { cn } from "@/lib/utils";
import { useBlogProgress } from "@/utils/blog-progress";
import { BLOG_STYLE_OPTIONS, type BlogStyle, isBlogStyle, SECRET_BLOG_STYLES } from "@/utils/blog-style";
import { useTranslate } from "@/utils/i18n";
import { stylePackLabel } from "@/utils/style-packs";
import { computeFusion, elementName, legendaryName } from "@/utils/style-reactions";

const STYLE_ICONS: Record<BlogStyle, ReactElement> = {
  default: <LayoutTemplateIcon className="size-4" />,
  glass: <GlassWaterIcon className="size-4" />,
  neumorphism: <CircleIcon className="size-4" />,
  aero: <DropletsIcon className="size-4" />,
  y2k: <SparklesIcon className="size-4" />,
  vaporwave: <SunsetIcon className="size-4" />,
  pixel: <Gamepad2Icon className="size-4" />,
  handdrawn: <PencilIcon className="size-4" />,
  terminal: <SquareTerminalIcon className="size-4" />,
  golden: <CrownIcon className="size-4" />,
};

/** Community style packs share one icon; their looks are whatever their authors made. */
const STYLE_PACK_ICON = <PaletteIcon className="size-4" />;

const styleIcon = (style: string) => (isBlogStyle(style) ? STYLE_ICONS[style] : STYLE_PACK_ICON);

/** The picker entry that opens the reaction codex instead of choosing a style. */
const CODEX_VALUE = "__codex";

interface Props {
  className?: string;
  iconOnly?: boolean;
}

/** Picks the Blog 2 style. Styles dress the Blog 2 layout, so choosing one switches to it. Also opens the codex. */
const StyleSelect = ({ className, iconOnly = false }: Props) => {
  const t = useTranslate();
  const { blogStyle, styleId, setBlogStyle, setStylePack, stylePacks, feedLayout, setFeedLayout } = useView();
  const progress = useBlogProgress();
  const [codexOpen, setCodexOpen] = useState(false);
  // The secret style shows once its achievement (same id) is earned, or while it is in use.
  const options = BLOG_STYLE_OPTIONS.filter(
    (option) => !SECRET_BLOG_STYLES.includes(option.value) || progress.achievements.includes(option.value) || styleId === option.value,
  ).map((option) => ({ ...option, label: t(option.labelKey) }));
  // Installed community packs follow the built-in styles.
  const packOptions = stylePacks.map((pack) => ({ value: pack.id, label: stylePackLabel(pack, i18n.language) }));
  const items = [...options, ...packOptions];
  const currentLabel = items.find((option) => option.value === styleId)?.label ?? t("blog-style.default");
  // The button's label names the style × theme reaction that is on, if any.
  const theme = useCurrentTheme();
  const fusion = feedLayout === "blog2" ? computeFusion(blogStyle, theme) : undefined;
  const reaction = fusion?.legendary
    ? t(legendaryName(fusion.legendary.id))
    : (fusion?.elements ?? []).map((element) => t(elementName(element))).join(" / ");
  const buttonLabel = `${t("blog-style.title")}: ${currentLabel}${reaction ? ` \u2192 ${reaction}` : ""}`;

  const handleStyleChange = (value: string) => {
    if (value === CODEX_VALUE) {
      setCodexOpen(true);
      return;
    }
    if (isBlogStyle(value)) {
      setBlogStyle(value);
      if (value !== "default" && feedLayout !== "blog2") setFeedLayout("blog2");
    } else if (stylePacks.some((pack) => pack.id === value)) {
      setStylePack(value);
      if (feedLayout !== "blog2") setFeedLayout("blog2");
    }
  };

  return (
    <>
      <Select value={styleId} items={items} onValueChange={handleStyleChange}>
        <SelectTrigger
          aria-label={iconOnly ? buttonLabel : undefined}
          title={iconOnly ? buttonLabel : undefined}
          showChevron={!iconOnly}
          className={cn(
            iconOnly &&
              "size-8 justify-center border-0 bg-transparent p-0 text-muted-foreground shadow-none [&_svg]:text-current hover:bg-accent/65 hover:text-foreground",
            className,
          )}
        >
          {iconOnly ? (
            styleIcon(styleId)
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {styleIcon(styleId)}
              <SelectValue className="truncate" />
            </div>
          )}
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                {STYLE_ICONS[option.value]}
                <span>{option.label}</span>
              </div>
            </SelectItem>
          ))}
          {packOptions.length > 0 && <SelectSeparator />}
          {packOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                {STYLE_PACK_ICON}
                <span>{option.label}</span>
              </div>
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={CODEX_VALUE}>
            <div className="flex items-center gap-2">
              <BookOpenIcon className="size-4" />
              <span>{t("fusion.codex")}</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
      <ReactionCodex open={codexOpen} onOpenChange={setCodexOpen} />
    </>
  );
};

export default StyleSelect;
