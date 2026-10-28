import { DownloadIcon, PaletteIcon, RefreshCwIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { MEMOS_PLUS_REPOSITORY } from "@/components/PoweredByMemosPlus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { instanceServiceClient } from "@/connect";
import { useAllStylePacks, useDeleteStylePack, useInstallStylePack, useUpdateStylePack } from "@/hooks/useStylePackQueries";
import i18n from "@/i18n";
import { getErrorMessage } from "@/lib/error";
import type { StylePack } from "@/types/proto/api/v1/instance_service_pb";
import { blogStyleLabelKey, isBlogStyle } from "@/utils/blog-style";
import { useTranslate } from "@/utils/i18n";
import { stylePackLabel, stylePackScheme } from "@/utils/style-packs";
import SettingSection from "./SettingSection";

/** Where the pack format (style.json, style.css, assets/) and its limits are written down. */
const FORMAT_DOC_URL = `${MEMOS_PLUS_REPOSITORY}/blob/main/docs/style-pack-authoring.md`;

const readZip = async (event: ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  return file ? new Uint8Array(await file.arrayBuffer()) : undefined;
};

const PackRow = ({ pack, onDelete }: { pack: StylePack; onDelete: (pack: StylePack) => void }) => {
  const t = useTranslate();
  const updateStylePack = useUpdateStylePack();
  const fileRef = useRef<HTMLInputElement>(null);
  const label = stylePackLabel(pack, i18n.language);
  const scheme = stylePackScheme(pack);

  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(done);
    } catch (error) {
      toast.error(getErrorMessage(error, t("style-packs.failed")));
    }
  };

  const handleUpdate = async (event: ChangeEvent<HTMLInputElement>) => {
    const zip = await readZip(event);
    if (zip) await run(() => updateStylePack.mutateAsync({ id: pack.id, zip }), t("style-packs.updated", { name: label }));
  };

  const handleExport = () =>
    run(
      async () => {
        const { zip } = await instanceServiceClient.exportStylePack({ id: pack.id });
        const url = URL.createObjectURL(new Blob([new Uint8Array(zip)], { type: "application/zip" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `${pack.id}-${pack.version}.zip`;
        link.click();
        URL.revokeObjectURL(url);
      },
      t("style-packs.exported", { name: label }),
    );

  return (
    <li data-settings-surface="" className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <PaletteIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium text-foreground">{label}</span>
          <span className="font-mono text-xs text-muted-foreground">{`${pack.id} · v${pack.version}`}</span>
          {!pack.enabled && <Badge variant="outline">{t("style-packs.disabled")}</Badge>}
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {isBlogStyle(pack.reactsLike)
            ? t("style-packs.reacts-like", { style: t(blogStyleLabelKey(pack.reactsLike)) })
            : t("style-packs.no-reactions")}
        </p>
        {scheme && (
          <p className="text-xs leading-5 text-muted-foreground">
            {t(scheme === "dark" ? "style-packs.scheme-dark" : "style-packs.scheme-light")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Switch
          aria-label={t("style-packs.enabled", { name: label })}
          checked={pack.enabled}
          disabled={updateStylePack.isPending}
          onCheckedChange={(enabled) =>
            run(
              () => updateStylePack.mutateAsync({ id: pack.id, enabled }),
              t(enabled ? "style-packs.turned-on" : "style-packs.turned-off", { name: label }),
            )
          }
        />
        <Button variant="outline" size="sm" disabled={updateStylePack.isPending} onClick={() => fileRef.current?.click()}>
          <RefreshCwIcon className="size-4" />
          {t("style-packs.update")}
        </Button>
        <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={(event) => void handleUpdate(event)} />
        <Button variant="outline" size="sm" onClick={() => void handleExport()}>
          <DownloadIcon className="size-4" />
          {t("style-packs.export")}
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete(pack)}>
          <Trash2Icon className="size-4" />
          {t("common.delete")}
        </Button>
      </div>
    </li>
  );
};

/**
 * Settings → Style packs (admins): install community styles from ZIP files, turn them on for everyone, replace them
 * with a newer version, export the original ZIP, or remove them. A new pack starts switched off; once on, it shows in
 * every visitor's style picker and a post can name it with #style/<id>.
 */
const StylePacksSection = () => {
  const t = useTranslate();
  const packsQuery = useAllStylePacks();
  const installStylePack = useInstallStylePack();
  const deleteStylePack = useDeleteStylePack();
  const fileRef = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState<StylePack>();
  const packs = packsQuery.data ?? [];

  const handleInstall = async (event: ChangeEvent<HTMLInputElement>) => {
    const zip = await readZip(event);
    if (!zip) return;
    try {
      const pack = await installStylePack.mutateAsync(zip);
      toast.success(t("style-packs.installed", { name: stylePackLabel(pack, i18n.language) }));
    } catch (error) {
      toast.error(getErrorMessage(error, t("style-packs.failed")));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteStylePack.mutateAsync(deleting.id);
      toast.success(t("style-packs.deleted", { name: stylePackLabel(deleting, i18n.language) }));
    } catch (error) {
      toast.error(getErrorMessage(error, t("style-packs.failed")));
    }
  };

  return (
    <SettingSection
      title={t("setting.style-packs.label")}
      description={t("style-packs.description")}
      actions={
        <>
          <Button size="sm" disabled={installStylePack.isPending} onClick={() => fileRef.current?.click()}>
            <UploadIcon className="size-4" />
            {installStylePack.isPending ? t("style-packs.installing") : t("style-packs.install")}
          </Button>
          <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={(event) => void handleInstall(event)} />
        </>
      }
    >
      {packsQuery.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("style-packs.loading")}</p>
      ) : packs.length === 0 ? (
        <div data-settings-surface="" className="rounded-lg border border-dashed border-border px-4 py-9 text-center">
          <p className="text-sm font-medium">{t("style-packs.empty")}</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">{t("style-packs.empty-description")}</p>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {packs.map((pack) => (
            <PackRow key={pack.id} pack={pack} onDelete={setDeleting} />
          ))}
        </ul>
      )}

      <p className="text-xs leading-5 text-muted-foreground">
        {t("style-packs.rules")}{" "}
        <a className="underline underline-offset-2 hover:text-foreground" href={FORMAT_DOC_URL} target="_blank" rel="noreferrer">
          {t("style-packs.format-link")}
        </a>
      </p>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={t("style-packs.delete-title", { name: deleting ? stylePackLabel(deleting, i18n.language) : "" })}
        description={t("style-packs.delete-description")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        confirmVariant="destructive"
        onConfirm={confirmDelete}
      />
    </SettingSection>
  );
};

export default StylePacksSection;
