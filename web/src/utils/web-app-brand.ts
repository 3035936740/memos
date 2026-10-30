import { isDefaultBrandLogo } from "./brand-logo";

/** Refresh install metadata only when the administrator's public brand changes. */
export const setWebAppBrand = (title: string, logoUrl: string, description: string) => {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(`${title}\0${logoUrl}\0${description}`)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  const version = hash.toString(16).padStart(8, "0");
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  const manifestPath = `/site.webmanifest?v=${version}`;
  if (manifest && manifest.getAttribute("href") !== manifestPath) manifest.href = manifestPath;

  for (const name of ["application-name", "apple-mobile-web-app-title"]) {
    let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = name;
      document.head.appendChild(meta);
    }
    meta.content = title;
  }

  const touchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (touchIcon) touchIcon.href = isDefaultBrandLogo(logoUrl) ? "/apple-touch-icon.png" : logoUrl;
};
