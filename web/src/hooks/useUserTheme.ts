import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useInstance } from "@/contexts/InstanceContext";
import { getThemeWithFallback, loadTheme, setupSystemThemeListener } from "@/utils/theme";

/**
 * Hook that reactively applies user theme preference.
 * Priority: user setting, local preference, instance first-visit default.
 */
export const useUserTheme = () => {
  const { currentUser, isIdentityInitialized, isUserSettingsInitialized, userGeneralSetting } = useAuth();
  const { generalSetting, isInitialized: isInstanceInitialized } = useInstance();

  // Wait for the instance setting so the early fallback does not accidentally
  // become a saved preference before the configured first-visit default arrives.
  useEffect(() => {
    if (!isIdentityInitialized || !isInstanceInitialized) {
      return;
    }

    if (!currentUser) {
      loadTheme(getThemeWithFallback(undefined, generalSetting.firstVisitDefaultTheme));
      return;
    }

    if (!isUserSettingsInitialized) return;

    const theme = getThemeWithFallback(userGeneralSetting?.theme, generalSetting.firstVisitDefaultTheme);
    loadTheme(theme);
  }, [
    currentUser,
    generalSetting.firstVisitDefaultTheme,
    isIdentityInitialized,
    isInstanceInitialized,
    isUserSettingsInitialized,
    userGeneralSetting?.theme,
  ]);

  // Listen for system theme changes when using "system" theme
  useEffect(() => {
    if (!isIdentityInitialized || !isInstanceInitialized || !currentUser || !isUserSettingsInitialized) return;

    const theme = getThemeWithFallback(userGeneralSetting?.theme, generalSetting.firstVisitDefaultTheme);

    // Only set up listener if theme is "system"
    if (theme !== "system") {
      return;
    }

    // Set up listener for OS theme preference changes
    const cleanup = setupSystemThemeListener(() => {
      loadTheme(theme);
    });

    return cleanup;
  }, [
    currentUser,
    generalSetting.firstVisitDefaultTheme,
    isIdentityInitialized,
    isInstanceInitialized,
    isUserSettingsInitialized,
    userGeneralSetting?.theme,
  ]);
};
