import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslate } from "@/utils/i18n";
import { listQuarantine, listReports, type ModerationItem, restoreQuarantine, setReportCount } from "@/utils/moderation";
import SettingSection from "./SettingSection";

const PAGE_SIZE = 20;
type Mode = "reports" | "quarantine";

const ModerationCenter = ({ mode }: { mode: Mode }) => {
  const t = useTranslate();
  const [page, setPage] = useState(1);
  const [targetType, setTargetType] = useState("");
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [adjustingItem, setAdjustingItem] = useState<ModerationItem | undefined>();
  const [adjustedCount, setAdjustedCount] = useState("0");
  const load = async () => {
    setLoading(true);
    try {
      const result =
        mode === "reports" ? await listReports(page, PAGE_SIZE, targetType) : await listQuarantine(page, PAGE_SIZE, targetType);
      const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setItems(result.items);
      setTotal(result.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("setting.moderation-center.load-failed"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [mode, page, targetType]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const itemPath = (item: ModerationItem) =>
    item.targetType === "USER" ? `/u/${item.targetName.replace(/^users\//, "")}` : `/${item.targetName}`;
  return (
    <SettingSection
      title={mode === "reports" ? t("setting.moderation.label") : t("setting.quarantine.label")}
      description={
        mode === "reports" ? t("setting.moderation-center.reports-description") : t("setting.moderation-center.quarantine-description")
      }
    >
      <Tabs
        value={targetType}
        onValueChange={(value) => {
          setTargetType(value);
          setPage(1);
        }}
      >
        <TabsList className="w-fit rounded-lg bg-muted p-1">
          <TabsTrigger value="">{t("common.all")}</TabsTrigger>
          <TabsTrigger value="ARTICLE">{t("setting.moderation-center.article")}</TabsTrigger>
          <TabsTrigger value="COMMENT">{t("setting.moderation-center.comment")}</TabsTrigger>
          <TabsTrigger value="USER">{t("common.user")}</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="overflow-hidden rounded-lg border border-border">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{t("message.no-data")}</div>
        ) : (
          items.map((item) => (
            <div
              key={`${item.targetType}-${item.targetId}`}
              className="flex flex-col gap-3 border-b border-border p-4 last:border-b-0 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5">{item.targetType}</span>
                  <span>{t("setting.moderation-center.report-count", { count: item.count })}</span>
                  {item.creator ? <span>@{item.creator}</span> : null}
                </div>
                <Link to={itemPath(item)} className="block truncate font-medium hover:underline">
                  {item.title || item.targetName || `#${item.targetId}`}
                </Link>
                {item.reason ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {t("setting.moderation-center.latest-reason", { reason: item.reason })}
                  </p>
                ) : null}
              </div>
              {mode === "quarantine" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await restoreQuarantine(item);
                      toast.success(t("setting.moderation-center.restored"));
                      await load();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : t("setting.moderation-center.restore-failed"));
                    }
                  }}
                >
                  {t("common.restore")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAdjustingItem(item);
                    setAdjustedCount(String(item.count));
                  }}
                >
                  {t("setting.moderation-center.adjust-count")}
                </Button>
              )}
            </div>
          ))
        )}
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{t("setting.moderation-center.total", { count: total })}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            {t("memo.pagination-previous")}
          </Button>
          <span>
            {page} / {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>
            {t("memo.pagination-next")}
          </Button>
        </div>
      </div>
      <Dialog open={!!adjustingItem} onOpenChange={(open) => !open && setAdjustingItem(undefined)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("setting.moderation-center.adjust-title")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="moderation-report-count">{t("setting.moderation-center.effective-count")}</Label>
            <Input
              id="moderation-report-count"
              type="number"
              min={0}
              max={10000}
              step={1}
              value={adjustedCount}
              onChange={(event) => setAdjustedCount(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("setting.moderation-center.adjust-description")}</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjustingItem(undefined)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={async () => {
                if (!adjustingItem) return;
                const count = Number(adjustedCount);
                if (!Number.isInteger(count) || count < 0 || count > 10000) {
                  toast.error(t("setting.moderation-center.invalid-count"));
                  return;
                }
                try {
                  await setReportCount(adjustingItem, count);
                  toast.success(t("setting.moderation-center.count-updated"));
                  setAdjustingItem(undefined);
                  await load();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : t("message.update-failed"));
                }
              }}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingSection>
  );
};
export const ModerationReportsSection = () => <ModerationCenter mode="reports" />;
export const ModerationQuarantineSection = () => <ModerationCenter mode="quarantine" />;
