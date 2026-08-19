import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useInstance } from "@/contexts/InstanceContext";
import { getLocaleDirection, getLocaleWithFallback, type LocaleDirection, loadLocale, subscribeToLocaleDirection } from "@/utils/i18n";

/**
 * Hook that reactively applies user locale preference.
 * Priority: user setting, local preference, instance first-visit default.
 */
export const useUserLocale = () => {
  const { currentUser, isIdentityInitialized, isUserSettingsInitialized, userGeneralSetting } = useAuth();
  const { generalSetting, isInitialized: isInstanceInitialized } = useInstance();
  const direction = useSyncExternalStore<LocaleDirection>(subscribeToLocaleDirection, getLocaleDirection, () => "ltr");

  // Wait for the instance setting so the early fallback does not accidentally
  // become a saved preference before the configured first-visit default arrives.
  useEffect(() => {
    if (!isIdentityInitialized || !isInstanceInitialized) {
      return;
    }

    if (!currentUser) {
      loadLocale(getLocaleWithFallback(undefined, generalSetting.firstVisitDefaultLocale));
      return;
    }

    if (!isUserSettingsInitialized) return;

    const locale = getLocaleWithFallback(userGeneralSetting?.locale, generalSetting.firstVisitDefaultLocale);
    loadLocale(locale);
  }, [
    currentUser,
    generalSetting.firstVisitDefaultLocale,
    isIdentityInitialized,
    isInstanceInitialized,
    isUserSettingsInitialized,
    userGeneralSetting?.locale,
  ]);

  return direction;
};
