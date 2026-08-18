import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useInstance } from "@/contexts/InstanceContext";
import { getLocaleWithFallback, loadLocale } from "@/utils/i18n";

/**
 * Hook that reactively applies user locale preference.
 * Priority: user setting, local preference, instance first-visit default.
 */
export const useUserLocale = () => {
  const { i18n } = useTranslation();
  const { currentUser, isIdentityInitialized, isUserSettingsInitialized, userGeneralSetting } = useAuth();
  const { generalSetting, isInitialized: isInstanceInitialized } = useInstance();

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

  // Update HTML lang and dir attributes based on current locale
  useEffect(() => {
    const currentLocale = i18n.language;
    document.documentElement.setAttribute("lang", currentLocale);

    // RTL languages
    if (["ar", "fa", "he"].includes(currentLocale)) {
      document.documentElement.setAttribute("dir", "rtl");
    } else {
      document.documentElement.setAttribute("dir", "ltr");
    }
  }, [i18n.language]);
};
