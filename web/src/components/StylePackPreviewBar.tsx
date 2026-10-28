import { EyeIcon } from "lucide-react";
import { useEffect } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { useView } from "@/contexts/ViewContext";
import { useUpdateStylePack } from "@/hooks/useStylePackQueries";
import i18n from "@/i18n";
import { getErrorMessage } from "@/lib/error";
import { useTranslate } from "@/utils/i18n";
import { stylePackLabel } from "@/utils/style-packs";

/**
 * While an admin previews a style pack (Settings → Style packs → Preview), a bar along the bottom of every page says
 * that only they see it, offers to switch a pack that is off on for everyone, and ends the preview. The preview also
 * ends by itself when the server stops serving its private stylesheet.
 */
const StylePackPreviewBar = () => {
  const t = useTranslate();
  const { packPreview, endPackPreview } = useView();
  const updateStylePack = useUpdateStylePack();
  const pack = packPreview?.pack;
  const expiresAt = packPreview?.expiresAt;

  useEffect(() => {
    if (!pack || !expiresAt) return;
    const timer = window.setTimeout(
      () => {
        endPackPreview();
        toast(t("style-packs.preview-expired", { name: stylePackLabel(pack, i18n.language) }));
      },
      Math.max(0, expiresAt.getTime() - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [endPackPreview, expiresAt, pack, t]);

  if (!pack) return null;
  const label = stylePackLabel(pack, i18n.language);

  const turnOn = async () => {
    try {
      await updateStylePack.mutateAsync({ id: pack.id, enabled: true });
      toast.success(t("style-packs.turned-on", { name: label }));
      endPackPreview();
    } catch (error) {
      toast.error(getErrorMessage(error, t("style-packs.failed")));
    }
  };

  return (
    <div data-style-pack-preview="" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg"
      >
        <EyeIcon aria-hidden className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">{t("style-packs.previewing", { name: label })}</span>
        <div className="flex items-center gap-2">
          {!pack.enabled && (
            <Button size="sm" className="h-7" disabled={updateStylePack.isPending} onClick={() => void turnOn()}>
              {t("style-packs.turn-on")}
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7" onClick={endPackPreview}>
            {t("style-packs.end-preview")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StylePackPreviewBar;
