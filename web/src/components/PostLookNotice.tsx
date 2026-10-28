import { PaletteIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useView } from "@/contexts/ViewContext";
import i18n from "@/i18n";
import { blogStyleLabelKey } from "@/utils/blog-style";
import { useTranslate } from "@/utils/i18n";
import { hasPostLook, postLookOf } from "@/utils/post-look";
import { stylePackLabel } from "@/utils/style-packs";
import { THEME_OPTIONS } from "@/utils/theme";

interface Props {
  memoName: string;
  tags: readonly string[];
}

/**
 * Dresses the page in the look the author tagged the post with (#style/…, #theme/…) while it is open, and says so
 * above the article with a way back to the reader's own look. Nothing is saved; leaving the post restores it.
 */
const PostLookNotice = ({ memoName, tags }: Props) => {
  const t = useTranslate();
  const { feedLayout, postLook, setPostLook, stylePack, stylePacks } = useView();
  const [declinedFor, setDeclinedFor] = useState<string>();
  const tagKey = tags.join("\n");
  const packKey = stylePacks.map((pack) => pack.id).join("\n");
  // Keyed on the contents of the tags and the pack list: the arrays themselves are new on every refetch.
  const look = useMemo(() => postLookOf(tags, packKey ? packKey.split("\n") : []), [tagKey, packKey]);
  // The style half only shows in Blog 2, where styles exist at all.
  const style = feedLayout === "blog2" ? look.style : undefined;
  const pack = feedLayout === "blog2" ? look.stylePack : undefined;
  const wanted = declinedFor !== memoName && hasPostLook({ style, stylePack: pack, theme: look.theme });

  useEffect(() => {
    if (!wanted) return;
    setPostLook({ style, stylePack: pack, theme: look.theme });
    return () => setPostLook(undefined);
  }, [look.theme, pack, setPostLook, style, wanted]);

  // Picking a style or theme by hand also hands the look back, so this follows what is actually showing.
  if (!hasPostLook(postLook)) return null;
  const themeOption = THEME_OPTIONS.find((option) => option.value === postLook?.theme);
  const styleLabel = postLook?.style
    ? t(blogStyleLabelKey(postLook.style))
    : postLook?.stylePack && stylePack
      ? stylePackLabel(stylePack, i18n.language)
      : undefined;
  const label = [styleLabel, themeOption && t(themeOption.labelKey)].filter(Boolean).join(" × ");

  return (
    <div
      role="note"
      data-post-look-notice=""
      data-sb-subcard=""
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
    >
      <PaletteIcon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{t("memo.post-look.text", { look: label })}</span>
      <Button variant="ghost" size="sm" className="-my-1 h-7" onClick={() => setDeclinedFor(memoName)}>
        {t("memo.post-look.decline")}
      </Button>
    </div>
  );
};

export default PostLookNotice;
