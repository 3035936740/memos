/** Recognize only bundled, same-origin logos; never recolor uploaded images. */
export const isDefaultBrandLogo = (source: string) => {
  try {
    const url = new URL(source, window.location.origin);
    return url.origin === window.location.origin && ["/logo.webp", "/full-logo.webp", "/logo.svg"].includes(url.pathname);
  } catch {
    return false;
  }
};

let logoSource: Promise<string> | undefined;
let faviconRevision = 0;

/** Reuse the white SVG for the browser icon; an SVG image cannot inherit page CSS. */
export const setBrandFavicon = async (source: string) => {
  const icon = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!icon) return;
  const revision = ++faviconRevision;
  icon.dataset.brandSource = source;
  icon.removeAttribute("type");
  if (!isDefaultBrandLogo(source)) {
    icon.href = source;
    return;
  }

  try {
    logoSource ??= fetch("/logo.svg?v=mplus-white-1").then(async (response) => {
      if (!response.ok) throw new Error("Logo unavailable");
      const svg = await response.text();
      if (!svg.trimStart().startsWith("<svg")) throw new Error("Invalid logo response");
      return svg;
    });
    const svg = await logoSource;
    if (revision !== faviconRevision) return;
    const color = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#FFFFFF";
    const safeColor = color.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
    icon.href = `data:image/svg+xml,${encodeURIComponent(svg.replaceAll("#FFFFFF", safeColor))}`;
  } catch {
    // Retry on the next theme/brand change instead of keeping a rejected promise.
    if (revision === faviconRevision) logoSource = undefined;
  }
};

/** Attribute changes only: no animation loop or recurring colour sampling. */
export const watchBrandFaviconTheme = () => {
  const observer = new MutationObserver(() => {
    const source = document.querySelector<HTMLLinkElement>("link[rel~='icon']")?.dataset.brandSource;
    if (source && isDefaultBrandLogo(source)) void setBrandFavicon(source);
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-style", "data-style-pack", "class", "style"],
  });
  return () => observer.disconnect();
};
