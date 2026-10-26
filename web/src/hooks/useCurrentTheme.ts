import { useEffect, useState } from "react";

const readTheme = () => document.documentElement.dataset.theme ?? "default";

/** The resolved colour theme on <html>. Themes are switched outside React (loadTheme), so this watches the attribute. */
const useCurrentTheme = () => {
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return theme;
};

export default useCurrentTheme;
