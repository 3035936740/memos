import { type InstanceBrand, readInstanceBrand, rememberInstanceBrand } from "./brand-cache";
import { isDefaultBrandLogo } from "./brand-logo";

export type InitialBranding = InstanceBrand;

/** Server-rendered public branding is available before React or any API request. */
export const initialBranding: InitialBranding | undefined = (() => {
  try {
    const bootstrap = document.getElementById("memos-branding");
    const value = JSON.parse(bootstrap?.textContent || "null");
    if (
      !bootstrap?.hasAttribute("data-unavailable") &&
      value &&
      ["title", "description", "logoUrl", "defaultAvatarUrl"].every((key) => typeof value[key] === "string")
    ) {
      return rememberInstanceBrand(value);
    }
  } catch {
    // Fall through to the last successful public instance brand.
  }
  const cached = readInstanceBrand();
  if (cached) {
    // Restore presentation immediately, without waiting for API initialization.
    document.title = cached.title || "Memos Plus";
    const icon = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (icon) icon.href = !cached.logoUrl || isDefaultBrandLogo(cached.logoUrl) ? "/favicon.ico" : cached.logoUrl;
  }
  return cached;
})();
