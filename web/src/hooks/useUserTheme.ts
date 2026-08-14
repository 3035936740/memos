import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getThemeWithFallback, loadTheme, setupSystemThemeListener } from "@/utils/theme";

/**
 * Hook that reactively applies user theme preference.
 * Priority: User setting → localStorage → system preference
 */
export const useUserTheme = () => {
  const { currentUser, isIdentityInitialized, isUserSettingsInitialized, userGeneralSetting } = useAuth();

  // Guests always start in the instance Cosmic theme. Authenticated users keep
  // their account preference once settings have finished loading.
  useEffect(() => {
    if (!isIdentityInitialized) {
      return;
    }

    if (!currentUser) {
      loadTheme("cosmic-dark");
      return;
    }

    if (!isUserSettingsInitialized) return;

    const theme = getThemeWithFallback(userGeneralSetting?.theme);
    loadTheme(theme);
  }, [currentUser, isIdentityInitialized, isUserSettingsInitialized, userGeneralSetting?.theme]);

  // Listen for system theme changes when using "system" theme
  useEffect(() => {
    if (!isIdentityInitialized || !currentUser || !isUserSettingsInitialized) return;

    const theme = getThemeWithFallback(userGeneralSetting?.theme);

    // Only set up listener if theme is "system"
    if (theme !== "system") {
      return;
    }

    // Set up listener for OS theme preference changes
    const cleanup = setupSystemThemeListener(() => {
      loadTheme(theme);
    });

    return cleanup;
  }, [currentUser, isIdentityInitialized, isUserSettingsInitialized, userGeneralSetting?.theme]);
};
