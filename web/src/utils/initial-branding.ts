export interface InitialBranding {
  title: string;
  description: string;
  logoUrl: string;
  defaultAvatarUrl: string;
}

/** Server-rendered public branding is available before React or any API request. */
export const initialBranding: InitialBranding | undefined = (() => {
  try {
    const value = JSON.parse(document.getElementById("memos-branding")?.textContent || "null");
    if (!value || !["title", "description", "logoUrl", "defaultAvatarUrl"].every((key) => typeof value[key] === "string")) return undefined;
    return value as InitialBranding;
  } catch {
    return undefined;
  }
})();
