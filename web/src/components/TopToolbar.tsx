import { Clock3Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import LocalePicker from "@/components/LocalePicker";
import ThemeSelect from "@/components/ThemeSelect";
import { useAuth } from "@/contexts/AuthContext";
import { useInstance } from "@/contexts/InstanceContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useUpdateUserGeneralSetting } from "@/hooks/useUserQueries";
import { cn } from "@/lib/utils";
import { getLocaleWithFallback, loadLocale } from "@/utils/i18n";
import { getThemeWithFallback, type Theme } from "@/utils/theme";

export const ToolbarPreferences = () => {
  const currentUser = useCurrentUser();
  const { userGeneralSetting, refetchSettings } = useAuth();
  const { generalSetting } = useInstance();
  const { mutate: updateUserGeneralSetting } = useUpdateUserGeneralSetting(currentUser?.name);
  const [locale, setLocale] = useState<Locale>(() =>
    getLocaleWithFallback(userGeneralSetting?.locale, generalSetting.firstVisitDefaultLocale),
  );
  const [theme, setTheme] = useState<Theme>(() => getThemeWithFallback(userGeneralSetting?.theme, generalSetting.firstVisitDefaultTheme));

  useEffect(() => {
    setLocale(getLocaleWithFallback(userGeneralSetting?.locale, generalSetting.firstVisitDefaultLocale));
  }, [generalSetting.firstVisitDefaultLocale, userGeneralSetting?.locale]);

  useEffect(() => {
    setTheme(getThemeWithFallback(userGeneralSetting?.theme, generalSetting.firstVisitDefaultTheme));
  }, [generalSetting.firstVisitDefaultTheme, userGeneralSetting?.theme]);

  const handleLocaleChange = (nextLocale: Locale) => {
    setLocale(nextLocale);
    loadLocale(nextLocale);
    if (!currentUser) return;
    updateUserGeneralSetting(
      { generalSetting: { locale: nextLocale }, updateMask: ["locale"] },
      { onSuccess: () => void refetchSettings() },
    );
  };

  const handleThemeChange = (nextTheme: string) => {
    setTheme(nextTheme as Theme);
    if (!currentUser) return;
    updateUserGeneralSetting({ generalSetting: { theme: nextTheme }, updateMask: ["theme"] }, { onSuccess: () => void refetchSettings() });
  };

  return (
    <>
      <ThemeSelect value={theme} onValueChange={handleThemeChange} iconOnly />
      <LocalePicker value={locale} onChange={handleLocaleChange} iconOnly />
    </>
  );
};

export const ToolbarClock = ({ compact = false, className }: { compact?: boolean; className?: string }) => {
  const { i18n } = useTranslation();
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const formattedTime = useMemo(
    () =>
      new Intl.DateTimeFormat(
        i18n.language,
        compact
          ? { hour: "2-digit", minute: "2-digit" }
          : {
              month: "2-digit",
              day: "2-digit",
              weekday: "short",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            },
      ).format(currentTime),
    [compact, currentTime, i18n.language],
  );

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center text-muted-foreground tabular-nums",
        compact ? "gap-1 px-1 text-[11px]" : "h-8 gap-2 rounded-md bg-muted/45 px-3 text-xs",
        className,
      )}
    >
      <Clock3Icon className={compact ? "size-3.5" : "size-4"} />
      <time aria-label="Current time" dateTime={currentTime.toISOString()}>
        {formattedTime}
      </time>
    </div>
  );
};

const TopToolbar = () => {
  return (
    <header className="sticky top-0 z-20 hidden h-12 w-full shrink-0 items-center border-b border-border/70 bg-background/85 px-4 backdrop-blur-md md:flex sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2">
        <ToolbarPreferences />
        <ToolbarClock className="ml-auto" />
      </div>
    </header>
  );
};

export default TopToolbar;
