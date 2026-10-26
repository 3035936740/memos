import { matchPath, useLocation } from "react-router-dom";
import { useAppSidebar } from "@/contexts/AppSidebarContext";
import { useAuth } from "@/contexts/AuthContext";
import { useInstance } from "@/contexts/InstanceContext";
import { useSpaceContext } from "@/contexts/SpaceContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { type MemoStatsContext, useFilteredMemoStats } from "@/hooks/useFilteredMemoStats";
import useMediaQuery from "@/hooks/useMediaQuery";
import { useUser } from "@/hooks/useUserQueries";
import { isMemoScopeRoute } from "@/lib/memo-views";
import { ROUTES } from "@/router/routes";

/** Calendar statistics and tags for a collection route, shared by the sidebar, the Blog 2 widgets and the toolbar calendar. */
/** `always` loads regardless of whether a sidebar is showing, for panels that mount only when opened. */
const useCollectionSidebarData = (context: MemoStatsContext, { always = false }: { always?: boolean } = {}) => {
  const location = useLocation();
  const currentUser = useCurrentUser();
  const { memoFilter, selectedSpaceName } = useSpaceContext();
  const md = useMediaQuery("md");
  const { mobileOpen } = useAppSidebar();
  const { isInitialized: authInitialized } = useAuth();
  const { isInitialized: instanceInitialized } = useInstance();
  const profileMatch = matchPath("/u/:username", location.pathname);
  const { data: profileUser } = useUser(profileMatch?.params.username ? `users/${profileMatch.params.username}` : "", {
    enabled: context === "profile" && !!profileMatch?.params.username,
  });
  const statsUserName = context === "home" ? currentUser?.name : context === "profile" ? profileUser?.name : undefined;
  // User-level collections stay aligned with their unscoped feeds even when a Space is remembered.
  const isUserLevelCollection = context === "profile" || context === "archived";
  const statsFilter = isUserLevelCollection ? undefined : memoFilter;
  const { statistics, tags } = useFilteredMemoStats({
    context,
    userName: statsUserName,
    filter: statsFilter,
    enabled: authInitialized && instanceInitialized && (always || md || mobileOpen),
  });

  // Off the collection routes (the library shown as fallback content), calendar and tag
  // clicks must land somewhere that renders the filtered feed.
  const onCollectionRoute = isMemoScopeRoute(location.pathname) || !!profileMatch;
  const filterTarget = onCollectionRoute ? undefined : context === "explore" ? ROUTES.EXPLORE : ROUTES.HOME;
  const tagStateScope = isUserLevelCollection
    ? (statsUserName ?? context)
    : `${statsUserName ?? context}${selectedSpaceName ? `:${selectedSpaceName}` : ""}`;

  return { statistics, tags, filterTarget, tagStateScope };
};

export default useCollectionSidebarData;
