import { timestampDate } from "@bufbuild/protobuf/wkt";
import { BellIcon, FlameIcon, HistoryIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useDateFilterNavigation } from "@/hooks/useDateFilterNavigation";
import { useNotifications, useUserStats } from "@/hooks/useUserQueries";
import i18n from "@/i18n";
import { UserNotification_Status } from "@/types/proto/api/v1/user_service_pb";
import { hideTodayCard, isTodayCardHidden, sameDayInPastYears, writingStreak } from "@/utils/home-today";
import { useTranslate } from "@/utils/i18n";

/** Past years listed under "on this day"; older ones are a click into the calendar away. */
const PAST_YEARS_SHOWN = 3;

/**
 * The card at the top of Home: today's date and writing streak, what the visitor wrote on this day in past years
 * (each year filters the list to that day), and unread notifications. It can be put away for the rest of the day.
 */
const TodayCard = () => {
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const { data: stats } = useUserStats(currentUser?.name);
  const { data: notifications = [] } = useNotifications();
  const navigateToDateFilter = useDateFilterNavigation();
  const [today] = useState(() => new Date());
  const [hidden, setHidden] = useState(() => isTodayCardHidden(today));
  const created = useMemo(() => (stats?.memoCreatedTimestamps ?? []).map((timestamp) => timestampDate(timestamp)), [stats]);
  const streak = useMemo(() => writingStreak(created, today), [created, today]);
  const pastDays = useMemo(() => sameDayInPastYears(created, today).slice(0, PAST_YEARS_SHOWN), [created, today]);
  const unread = notifications.filter((notification) => notification.status === UserNotification_Status.UNREAD).length;

  if (hidden || !stats) return null;

  const streakText = streak.wroteToday
    ? streak.days > 1
      ? t("home-today.streak", { count: streak.days })
      : t("home-today.wrote-today", { count: streak.todayCount })
    : streak.days > 0
      ? t("home-today.keep-going", { count: streak.days })
      : t("home-today.not-yet");

  return (
    <section
      data-home-today=""
      data-sb-subcard=""
      aria-label={t("home-today.title")}
      className="relative mb-3 flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pe-8">
        <h2 className="text-sm font-semibold text-foreground">
          {today.toLocaleDateString(i18n.language, { month: "long", day: "numeric", weekday: "long" })}
        </h2>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <FlameIcon aria-hidden className={streak.days > 0 ? "size-3.5 text-primary" : "size-3.5"} />
          {streakText}
        </span>
      </div>

      {pastDays.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <HistoryIcon aria-hidden className="size-3.5" />
          <span>{t("home-today.on-this-day")}</span>
          {pastDays.map((day) => (
            <Button key={day.key} variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => navigateToDateFilter(day.key)}>
              {t("home-today.past-year", { year: day.year, count: day.count })}
            </Button>
          ))}
        </div>
      )}

      {unread > 0 && (
        <Link to="/inbox" className="inline-flex w-fit items-center gap-1 text-xs text-primary underline-offset-2 hover:underline">
          <BellIcon aria-hidden className="size-3.5" />
          {t("home-today.unread", { count: unread })}
        </Link>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="absolute end-2 top-2 size-7 text-muted-foreground"
        aria-label={t("home-today.hide")}
        title={t("home-today.hide")}
        onClick={() => {
          hideTodayCard(today);
          setHidden(true);
        }}
      >
        <XIcon className="size-4" />
      </Button>
    </section>
  );
};

export default TodayCard;
