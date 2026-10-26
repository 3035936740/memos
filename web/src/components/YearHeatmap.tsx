import dayjs from "dayjs";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useDateFilterNavigation } from "@/hooks";
import type { StatisticsData } from "@/types/statistics";
import { useTranslate } from "@/utils/i18n";

interface Props {
  statistics: StatisticsData;
  /** When set, day clicks land on this route with the date filter instead of filtering the current one. */
  navigationTarget?: string;
  onDateSelect?: () => void;
}

interface HeatCell {
  date: string;
  count: number;
  inYear: boolean;
}

const NAV_BUTTON_CLASSES =
  "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

const levelFor = (count: number, max: number) => (count <= 0 || max <= 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4)));

/** A year of activity as a grid of days, one column per week, like a contribution graph. */
const YearHeatmap = ({ statistics, navigationTarget, onDateSelect }: Props) => {
  const t = useTranslate();
  const navigateToDateFilter = useDateFilterNavigation(navigationTarget);
  const thisYear = dayjs().year();
  const [year, setYear] = useState(thisYear);

  const { weeks, total, max } = useMemo(() => {
    const first = dayjs(`${year}-01-01`);
    const last = dayjs(`${year}-12-31`);
    const columns: HeatCell[][] = [];
    let cursor = first.subtract(first.day(), "day");
    let yearTotal = 0;
    let yearMax = 0;
    while (!cursor.isAfter(last, "day")) {
      const week: HeatCell[] = [];
      for (let day = 0; day < 7; day++) {
        const date = cursor.format("YYYY-MM-DD");
        const inYear = cursor.year() === year;
        const count = inYear ? (statistics.activityStats[date] ?? 0) : 0;
        yearTotal += count;
        yearMax = Math.max(yearMax, count);
        week.push({ date, count, inYear });
        cursor = cursor.add(1, "day");
      }
      columns.push(week);
    }
    return { weeks: columns, total: yearTotal, max: yearMax };
  }, [statistics.activityStats, year]);

  return (
    <div data-year-heatmap="" className="flex flex-col gap-2">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <button type="button" aria-label={t("blog-extra.previous-year")} onClick={() => setYear(year - 1)} className={NAV_BUTTON_CLASSES}>
          <ChevronLeftIcon className="size-3.5" />
        </button>
        <span className="tabular-nums text-sm font-medium text-foreground">{year}</span>
        <button
          type="button"
          aria-label={t("blog-extra.next-year")}
          disabled={year >= thisYear}
          onClick={() => setYear(year + 1)}
          className={NAV_BUTTON_CLASSES}
        >
          <ChevronRightIcon className="size-3.5" />
        </button>
        <span className="ms-auto tabular-nums">{t("blog-extra.year-total", { n: total })}</span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="flex w-max gap-[3px]">
          {weeks.map((week) => (
            <div key={week[0].date} className="flex flex-col gap-[3px]">
              {week.map((cell) =>
                cell.inYear ? (
                  <button
                    key={cell.date}
                    type="button"
                    data-heat-level={levelFor(cell.count, max)}
                    title={`${cell.date}  ${cell.count}`}
                    aria-label={`${cell.date}: ${cell.count}`}
                    onClick={() => {
                      navigateToDateFilter(cell.date);
                      onDateSelect?.();
                    }}
                    className="size-[10px] rounded-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  />
                ) : (
                  <span key={cell.date} aria-hidden className="size-[10px]" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default YearHeatmap;
