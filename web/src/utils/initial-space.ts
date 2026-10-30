import { create } from "@bufbuild/protobuf";
import { type Space, SpaceSchema } from "@/types/proto/api/v1/space_service_pb";

const initialSpace = (() => {
  try {
    const value = JSON.parse(document.getElementById("memos-space-branding")?.textContent || "null");
    if (!value || typeof value.routeId !== "string" || typeof value.viewerName !== "string" || typeof value.public !== "boolean") return;
    if (!value.space || !["name", "urlSlug", "title", "avatarUrl"].every((key) => typeof value.space[key] === "string")) return;
    return { routeId: value.routeId, viewerName: value.viewerName, public: value.public, space: create(SpaceSchema, value.space) };
  } catch {
    return;
  }
})();

/** Presentation metadata only; API queries still verify access and load full data. */
export const getInitialSpace = (routeId: string | undefined, viewerName: string | undefined): Space | undefined =>
  initialSpace?.routeId === routeId && (initialSpace?.public || initialSpace?.viewerName === (viewerName || ""))
    ? initialSpace?.space
    : undefined;
