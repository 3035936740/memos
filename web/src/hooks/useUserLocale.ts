import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { getLocaleWithFallback, loadLocale } from "@/utils/i18n";

/**
 * Hook that reactively applies user locale preference.
 * Priority: User setting → localStorage → browser language
 */
export const useUserLocale = () => {
  const { i18n } = useTranslation();
  const { currentUser, isIdentityInitialized, isUserSettingsInitialized, userGeneralSetting } = useAuth();

  // Guests always start in Simplified Chinese. Authenticated users keep their
  // saved account locale once settings have finished loading.
  useEffect(() => {
    if (!isIdentityInitialized) {
      return;
    }

    if (!currentUser) {
      loadLocale("zh-Hans");
      return;
    }

    if (!isUserSettingsInitialized) return;

    const locale = getLocaleWithFallback(userGeneralSetting?.locale);
    loadLocale(locale);
  }, [currentUser, isIdentityInitialized, isUserSettingsInitialized, userGeneralSetting?.locale]);

  // Update HTML lang and dir attributes based on current locale
  useEffect(() => {
    const currentLocale = i18n.language;
    document.documentElement.setAttribute("lang", currentLocale);

    // RTL languages
    if (["ar", "fa"].includes(currentLocale)) {
      document.documentElement.setAttribute("dir", "rtl");
    } else {
      document.documentElement.setAttribute("dir", "ltr");
    }
  }, [i18n.language]);
};
