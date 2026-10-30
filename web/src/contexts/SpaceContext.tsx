import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { routeSupportsCollectionScope } from "@/components/AppSidebar/routes";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useBatchSpaces, usePagedSpaces, useSpace, useSpaces } from "@/hooks/useSpaceQueries";
import { buildCollectionScopeFilter, type CollectionScope } from "@/lib/cel-filter";
import { getDuplicateSpaceTitles } from "@/lib/space-display";
import { getSpaceNavigationPath, getSpaceRoute, getUnscopedPath } from "@/lib/space-routes";
import { ROUTES } from "@/router/routes";
import type { Space } from "@/types/proto/api/v1/space_service_pb";
import { getInitialSpace } from "@/utils/initial-space";
import { readRecentSpaces, recordRecentSpace } from "@/utils/space-directory";

const SELECTED_SPACE_STORAGE_PREFIX = "memos-selected-space:";
const ALL_COLLECTION_SCOPE: CollectionScope = { kind: "all" };

const routeSpaceID = (pathname: string): string | undefined => {
  const route = getSpaceRoute(pathname);
  if (!route) return undefined;
  const encoded = route.basePath.slice("/space/".length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
};

export const getSelectedSpaceStorageKey = (userName: string) => `${SELECTED_SPACE_STORAGE_PREFIX}${userName}`;

const readSelectedSpaceName = (userName: string): string | undefined => {
  try {
    return sessionStorage.getItem(getSelectedSpaceStorageKey(userName)) || undefined;
  } catch {
    return undefined;
  }
};

const writeSelectedSpaceName = (userName: string, spaceName: string | undefined) => {
  try {
    const key = getSelectedSpaceStorageKey(userName);
    if (spaceName) {
      sessionStorage.setItem(key, spaceName);
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // sessionStorage can be unavailable in restricted browser contexts.
  }
};

interface SpaceContextValue {
  spaces: Space[];
  totalSpaces: number;
  spaceByName: ReadonlyMap<string, Space>;
  duplicateSpaceTitles: ReadonlySet<string>;
  selectedSpace?: Space;
  selectedSpaceName?: string;
  selectedSpacePath?: string;
  collectionScope: CollectionScope;
  memoFilter?: string;
  isLoadingSpaces: boolean;
  isSpacesError: boolean;
  /** Selects All without changing the current route. */
  clearSelectedSpace: () => void;
  selectSpace: (space: Space, destination?: string) => void;
  selectMemos: () => void;
}

const SpaceContext = createContext<SpaceContextValue | null>(null);

// Stable identity for the pre-load and error states, so the memoized context value
// below does not rebuild — and re-render every consumer — on each provider render.
const NO_SPACES: Space[] = [];
function SpaceSession({ viewerName, children }: { viewerName?: string; children: ReactNode }) {
  // Keep router values in refs so switching scope does not make the context callbacks
  // change identity whenever the user navigates.
  const location = useLocation();
  const navigate = useNavigate();
  const pathnameRef = useRef(location.pathname);
  const navigateRef = useRef(navigate);
  pathnameRef.current = location.pathname;
  navigateRef.current = navigate;

  const sessionKey = viewerName || "guest";
  const [storedSelectedSpaceName, setSelectedSpaceName] = useState(() => readSelectedSpaceName(sessionKey));
  const [optimisticSpace, setOptimisticSpace] = useState<Space>();
  const routeSpaceId = routeSpaceID(location.pathname);
  const initialSpace = getInitialSpace(routeSpaceId, viewerName);
  // The URL is authoritative from the first render, including before the page
  // chunk and its effect load. Reuse the page's query rather than fetching twice.
  const routeSpaceQuery = useSpace(viewerName, routeSpaceId ? `spaces/${routeSpaceId}` : undefined);
  const spacesQuery = useSpaces(viewerName);
  const summary = usePagedSpaces(viewerName, "", "", { enabled: true });
  const totalSpaces = summary.data?.totalSize ?? spacesQuery.data?.length ?? 0;
  const spaces = summary.data && totalSpaces <= 10 ? summary.data.spaces : (spacesQuery.data ?? NO_SPACES);
  const [recentNames, setRecentNames] = useState(() => readRecentSpaces(viewerName ?? ""));
  const selectedQuery = useBatchSpaces(viewerName, storedSelectedSpaceName ? [storedSelectedSpaceName] : []);
  const recentQuery = useBatchSpaces(viewerName, recentNames);
  const hydratedSpaces = useMemo(
    () => [
      ...(initialSpace ? [initialSpace] : []),
      ...spaces,
      ...(recentQuery.data?.spaces ?? []),
      ...(selectedQuery.data?.spaces ?? []),
      ...(routeSpaceQuery.data ? [routeSpaceQuery.data] : []),
    ],
    [spaces, recentQuery.data, selectedQuery.data, routeSpaceQuery.data, initialSpace],
  );
  const routeSpace = routeSpaceId
    ? routeSpaceQuery.data ||
      hydratedSpaces.find((space) => space.name === `spaces/${routeSpaceId}` || space.urlSlug === routeSpaceId) ||
      (optimisticSpace?.name === `spaces/${routeSpaceId}` || optimisticSpace?.urlSlug === routeSpaceId ? optimisticSpace : undefined)
    : undefined;
  const selectedSpaceName = routeSpaceId ? routeSpace?.name || `spaces/${routeSpaceId}` : storedSelectedSpaceName;
  const spaceByName = useMemo(() => new Map(hydratedSpaces.map((space) => [space.name, space])), [hydratedSpaces]);
  const listedSelectedSpace = selectedSpaceName ? spaceByName.get(selectedSpaceName) : undefined;
  const selectedSpace = listedSelectedSpace ?? (optimisticSpace?.name === selectedSpaceName ? optimisticSpace : undefined);
  const selectedSpacePath = selectedSpaceName
    ? `/space/${encodeURIComponent(selectedSpace?.urlSlug || selectedSpaceName.split("/").at(-1) || "")}`
    : undefined;

  // Normal navigation changes the lens, never the selected Space. Reuse the
  // existing page links while keeping refreshes and copied URLs Space-aware.
  useEffect(() => {
    if (!selectedSpacePath) return;
    const target = getSpaceNavigationPath(selectedSpacePath, location.pathname);
    if (target && target !== location.pathname) {
      navigateRef.current({ pathname: target, search: location.search, hash: location.hash }, { replace: true, state: location.state });
    }
  }, [selectedSpacePath, location.pathname, location.search, location.hash, location.state]);
  const duplicateSpaceTitles = useMemo(
    () =>
      getDuplicateSpaceTitles(
        selectedSpace && !spaceByName.has(selectedSpace.name) ? [...spaceByName.values(), selectedSpace] : [...spaceByName.values()],
      ),
    [selectedSpace, spaceByName, spaces],
  );
  const collectionScope = useMemo<CollectionScope>(
    () => (selectedSpaceName ? { kind: "space", name: selectedSpaceName } : ALL_COLLECTION_SCOPE),
    [selectedSpaceName],
  );

  useEffect(() => {
    if (listedSelectedSpace && optimisticSpace?.name === listedSelectedSpace.name) {
      setOptimisticSpace(undefined);
    }
  }, [listedSelectedSpace, optimisticSpace]);

  useEffect(() => {
    if (!routeSpaceId && selectedSpaceName && selectedQuery.isSuccess && selectedQuery.data.spaces.length === 0) {
      writeSelectedSpaceName(sessionKey, undefined);
      setSelectedSpaceName(undefined);
      setOptimisticSpace(undefined);
    }
  }, [selectedSpaceName, selectedQuery.isSuccess, selectedQuery.data, sessionKey, routeSpaceId]);

  const navigateAfterScopeChange = useCallback((destination?: string) => {
    if (destination) {
      navigateRef.current(destination);
      return;
    }
    // Scope and collection lens are independent. Preserve the active lens when
    // switching All/Space; global and resource routes fall back to My memos.
    if (!routeSupportsCollectionScope(pathnameRef.current)) {
      navigateRef.current(ROUTES.HOME);
    }
  }, []);

  const selectSpace = useCallback(
    (space: Space, destination?: string) => {
      writeSelectedSpaceName(sessionKey, space.name);
      recordRecentSpace(viewerName ?? "", space.name);
      setRecentNames(readRecentSpaces(viewerName ?? ""));
      setOptimisticSpace(space);
      setSelectedSpaceName(space.name);
      const basePath = `/space/${encodeURIComponent(space.urlSlug || space.name.split("/").at(-1) || "")}`;
      const path = destination || getSpaceNavigationPath(basePath, getUnscopedPath(pathnameRef.current)) || basePath;
      if (pathnameRef.current !== path) navigateRef.current(path);
    },
    [sessionKey, viewerName],
  );

  const clearSelectedSpace = useCallback(() => {
    writeSelectedSpaceName(sessionKey, undefined);
    setOptimisticSpace(undefined);
    setSelectedSpaceName(undefined);
  }, [sessionKey]);

  const selectMemos = useCallback(() => {
    clearSelectedSpace();
    navigateAfterScopeChange(getSpaceRoute(pathnameRef.current)?.pathname);
  }, [clearSelectedSpace, navigateAfterScopeChange]);

  const value = useMemo<SpaceContextValue>(
    () => ({
      spaces,
      totalSpaces,
      spaceByName,
      duplicateSpaceTitles,
      selectedSpace,
      selectedSpaceName,
      selectedSpacePath,
      collectionScope,
      memoFilter: buildCollectionScopeFilter(collectionScope),
      isLoadingSpaces: spacesQuery.isPending,
      isSpacesError: spacesQuery.isError,
      clearSelectedSpace,
      selectSpace,
      selectMemos,
    }),
    [
      clearSelectedSpace,
      collectionScope,
      duplicateSpaceTitles,
      selectMemos,
      selectSpace,
      selectedSpace,
      selectedSpaceName,
      selectedSpacePath,
      spaceByName,
      spaces,
      totalSpaces,
      spacesQuery.isError,
      spacesQuery.isPending,
    ],
  );

  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}

export function SpaceProvider({ children }: { children: ReactNode }) {
  const currentUserName = useCurrentUser()?.name;

  return (
    <SpaceSession key={currentUserName || "guest"} viewerName={currentUserName}>
      {children}
    </SpaceSession>
  );
}

export function useSpaceContext() {
  const context = useContext(SpaceContext);
  if (!context) {
    throw new Error("useSpaceContext must be used within SpaceProvider");
  }
  return context;
}
