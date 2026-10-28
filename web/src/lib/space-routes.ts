import { ROUTES } from "@/router/routes";

/** Separate the selected Space from the page being viewed within it. */
export const getSpaceRoute = (pathname: string): { basePath: string; pathname: string } | undefined => {
  const match = /^\/space\/([^/]+)(\/.*)?$/i.exec(pathname.replace(/\/+$/, ""));
  return match ? { basePath: `/space/${match[1]}`, pathname: match[2] || ROUTES.EXPLORE } : undefined;
};

export const getUnscopedPath = (pathname: string): string => getSpaceRoute(pathname)?.pathname ?? pathname;

/** Only collection links get a Space prefix; account, auth and external links keep their own routes. */
export const getSpaceNavigationPath = (basePath: string, pathname: string): string | undefined => {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/" || path === ROUTES.EXPLORE) return basePath;
  if (
    path === ROUTES.HOME ||
    path === ROUTES.ATTACHMENTS ||
    path === ROUTES.READ_LATER ||
    path === ROUTES.ARCHIVED ||
    /^\/categories\/[^/]+$/.test(path)
  ) {
    return `${basePath}${path}`;
  }
  return undefined;
};
