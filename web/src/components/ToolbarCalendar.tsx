import { CalendarDaysIcon } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { getSidebarRouteKind } from "@/components/AppSidebar/routes";
import useCollectionSidebarData from "@/components/AppSidebar/useCollectionSidebarData";
import StatisticsView from "@/components/StatisticsView";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import YearHeatmap from "@/components/YearHeatmap";
import { useView } from "@/contexts/ViewContext";
import type { MemoStatsContext } from "@/hooks/useFilteredMemoStats";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";

/** Blog 2 keeps the publishing calendar behind a toolbar button rather than in a sidebar. Other layouts show nothing. */
const ToolbarCalendar = () => {
  const t = useTranslate();
  const location = useLocation();
  const { feedLayout } = useView();
  const [open, setOpen] = useState(false);
  const kind = getSidebarRouteKind(location.pathname);

  if (feedLayout !== "blog2" || !(kind === "home" || kind === "archived" || kind === "explore" || kind === "profile")) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t("common.calendar")}
        title={t("common.calendar")}
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/65 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-accent/65 data-popup-open:text-foreground"
      >
        <CalendarDaysIcon className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-auto max-w-[calc(100vw-1.5rem)] p-3">
        <CalendarPanel context={kind} onDateSelect={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
};

const CALENDAR_MODES = ["month", "year"] as const;

/** Mounted only while the popover is open, so the calendar's stats load on demand. A month or the whole year. */
const CalendarPanel = ({ context, onDateSelect }: { context: MemoStatsContext; onDateSelect: () => void }) => {
  const t = useTranslate();
  const [mode, setMode] = useState<(typeof CALENDAR_MODES)[number]>("month");
  const { statistics, filterTarget } = useCollectionSidebarData(context, { always: true });

  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" data-calendar-modes="" className="flex gap-0.5 self-end rounded-md bg-muted/60 p-0.5 text-xs">
        {CALENDAR_MODES.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "rounded px-2.5 py-0.5 transition-colors",
              mode === value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "month" ? t("blog-extra.calendar-month") : t("blog-extra.calendar-year")}
          </button>
        ))}
      </div>
      {mode === "month" ? (
        <div className="w-66">
          <StatisticsView statisticsData={statistics} navigationTarget={filterTarget} onDateSelect={onDateSelect} />
        </div>
      ) : (
        <YearHeatmap statistics={statistics} navigationTarget={filterTarget} onDateSelect={onDateSelect} />
      )}
    </div>
  );
};

export default ToolbarCalendar;
