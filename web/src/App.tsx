import { DirectionProvider } from "@base-ui/react/direction-provider";
import { useEffect, useRef } from "react";
import { Outlet, ScrollRestoration } from "react-router-dom";
import CosmicBackground from "./components/CosmicBackground";
import { useAuth } from "./contexts/AuthContext";
import { useInstance } from "./contexts/InstanceContext";
import { useView } from "./contexts/ViewContext";
import useNavigateTo from "./hooks/useNavigateTo";
import { useUserLocale } from "./hooks/useUserLocale";
import { useUserTheme } from "./hooks/useUserTheme";
import { cleanupExpiredOAuthState } from "./utils/oauth";

const GUEST_VIEW_DEFAULTS_STORAGE_KEY = "memos-guest-view-defaults-v1";

const App = () => {
  const navigateTo = useNavigateTo();
  const { profile: instanceProfile, profileLoaded, generalSetting: instanceGeneralSetting } = useInstance();
  const { currentUser, isIdentityInitialized } = useAuth();
  const { setCompactMode, setLinkPreview } = useView();
  const guestViewDefaultsAppliedRef = useRef(false);

  // Apply user preferences reactively
  const direction = useUserLocale();
  useUserTheme();

  // Apply the instance's guest defaults once, including for browsers that still
  // carry view settings from before compact mode became the default. Afterwards
  // the visitor's own local changes remain persistent.
  useEffect(() => {
    if (!isIdentityInitialized || currentUser || guestViewDefaultsAppliedRef.current) return;

    try {
      if (localStorage.getItem(GUEST_VIEW_DEFAULTS_STORAGE_KEY)) {
        guestViewDefaultsAppliedRef.current = true;
        return;
      }
    } catch {
      // Continue with in-memory defaults when storage is unavailable.
    }

    guestViewDefaultsAppliedRef.current = true;
    setCompactMode(true);
    setLinkPreview(true);

    try {
      localStorage.setItem(GUEST_VIEW_DEFAULTS_STORAGE_KEY, "1");
    } catch {
      // Private browsing can reject localStorage writes.
    }
  }, [currentUser, isIdentityInitialized, setCompactMode, setLinkPreview]);

  // Clean up expired OAuth states on app initialization
  useEffect(() => {
    cleanupExpiredOAuthState();
  }, []);

  // Redirect to sign up page if the instance needs initial setup (no users yet).
  // needsSetup is used instead of a missing admin so an instance that has lost its
  // admins isn't mistaken for a fresh install (which would create a normal user).
  // Guard with profileLoaded so a fetch failure doesn't incorrectly trigger the redirect.
  useEffect(() => {
    if (profileLoaded && instanceProfile.needsSetup) {
      navigateTo("/auth/signup");
    }
  }, [profileLoaded, instanceProfile.needsSetup, navigateTo]);

  useEffect(() => {
    if (instanceGeneralSetting.additionalStyle) {
      const styleEl = document.createElement("style");
      styleEl.innerHTML = instanceGeneralSetting.additionalStyle;
      styleEl.setAttribute("type", "text/css");
      document.body.insertAdjacentElement("beforeend", styleEl);
    }
  }, [instanceGeneralSetting.additionalStyle]);

  useEffect(() => {
    if (instanceGeneralSetting.additionalScript) {
      const scriptEl = document.createElement("script");
      scriptEl.innerHTML = instanceGeneralSetting.additionalScript;
      document.head.appendChild(scriptEl);
    }
  }, [instanceGeneralSetting.additionalScript]);

  useEffect(() => {
    const backgroundImageUrl = (instanceGeneralSetting.defaultBackgroundImageUrl ?? "").trim();
    const root = document.documentElement;
    const body = document.body;

    if (!backgroundImageUrl) {
      root.removeAttribute("data-instance-background");
      body.style.removeProperty("background-image");
      body.style.removeProperty("background-position");
      body.style.removeProperty("background-repeat");
      body.style.removeProperty("background-size");
      body.style.removeProperty("background-attachment");
      return;
    }

    root.setAttribute("data-instance-background", "true");
    body.style.backgroundImage = `url(${JSON.stringify(backgroundImageUrl)})`;
    body.style.backgroundPosition = "center";
    body.style.backgroundRepeat = "no-repeat";
    body.style.backgroundSize = "cover";
    body.style.backgroundAttachment = "fixed";

    return () => {
      root.removeAttribute("data-instance-background");
      body.style.removeProperty("background-image");
      body.style.removeProperty("background-position");
      body.style.removeProperty("background-repeat");
      body.style.removeProperty("background-size");
      body.style.removeProperty("background-attachment");
    };
  }, [instanceGeneralSetting.defaultBackgroundImageUrl]);

  // Dynamic update metadata with customized profile
  useEffect(() => {
    if (!instanceGeneralSetting.customProfile) {
      return;
    }

    document.title = instanceGeneralSetting.customProfile.title;
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    link.href = instanceGeneralSetting.customProfile.logoUrl || "/logo.webp";
  }, [instanceGeneralSetting.customProfile]);

  return (
    <DirectionProvider direction={direction}>
      <CosmicBackground />
      <Outlet />
      <ScrollRestoration />
    </DirectionProvider>
  );
};

export default App;
