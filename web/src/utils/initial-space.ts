import { create } from "@bufbuild/protobuf";
import { getSpaceRoute } from "@/lib/space-routes";
import { type Space, SpaceSchema } from "@/types/proto/api/v1/space_service_pb";
import { rememberSpaceBrand } from "./brand-cache";

const initialRouteId = (() => {
  try {
    return decodeURIComponent(getSpaceRoute(window.location.pathname)?.basePath.slice("/space/".length) || "");
  } catch {
    return undefined;
  }
})();

const initialSpace = (() => {
  try {
    const value = JSON.parse(document.getElementById("memos-space-branding")?.textContent || "null");
    if (!value || typeof value.routeId !== "string" || typeof value.viewerName !== "string" || typeof value.public !== "boolean") return;
    if (!value.space || !["name", "urlSlug", "title", "avatarUrl"].every((key) => typeof value.space[key] === "string")) return;
    rememberSpaceBrand(value.space, value.viewerName);
    return { routeId: value.routeId, viewerName: value.viewerName, public: value.public, space: create(SpaceSchema, value.space) };
  } catch {
    return;
  }
})();

/** A server-denied initial route must not resurrect an old cached Space brand. */
export const isInitialSpaceUnavailable = (routeId: string) =>
  initialRouteId === routeId && !!document.getElementById("memos-branding") && !initialSpace;

/** Presentation metadata only; API queries still verify access and load full data. */
export const getInitialSpace = (routeId: string | undefined, viewerName: string | undefined): Space | undefined =>
  initialSpace?.routeId === routeId && (initialSpace?.public || initialSpace?.viewerName === (viewerName || ""))
    ? initialSpace?.space
    : undefined;
