import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { routeSupportsCollectionScope } from "@/components/AppSidebar/routes";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useSpaces } from "@/hooks/useSpaceQueries";
import { buildCollectionScopeFilter, type CollectionScope } from "@/lib/cel-filter";
import { getDuplicateSpaceTitles } from "@/lib/space-display";
import { ROUTES } from "@/router/routes";
import type { Space } from "@/types/proto/api/v1/space_service_pb";

const SELECTED_SPACE_STORAGE_PREFIX = "memos-selected-space:";
const ALL_COLLECTION_SCOPE: CollectionScope = { kind: "all" };

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
  spaceByName: ReadonlyMap<string, Space>;
  duplicateSpaceTitles: ReadonlySet<string>;
  selectedSpace?: Space;
  selectedSpaceName?: string;
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
  const [selectedSpaceName, setSelectedSpaceName] = useState(() => readSelectedSpaceName(sessionKey));
  const [optimisticSpace, setOptimisticSpace] = useState<Space>();
  const spacesQuery = useSpaces(viewerName);
  const spaces = spacesQuery.data ?? NO_SPACES;
  const spaceByName = useMemo(() => new Map(spaces.map((space) => [space.name, space])), [spaces]);
  const listedSelectedSpace = spaces.find((space) => space.name === selectedSpaceName);
  const selectedSpace = listedSelectedSpace ?? (optimisticSpace?.name === selectedSpaceName ? optimisticSpace : undefined);
  const duplicateSpaceTitles = useMemo(
    () => getDuplicateSpaceTitles(selectedSpace && !spaceByName.has(selectedSpace.name) ? [...spaces, selectedSpace] : spaces),
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
    if (!selectedSpaceName || !spacesQuery.isSuccess || selectedSpace) {
      return;
    }

    writeSelectedSpaceName(sessionKey, undefined);
    setSelectedSpaceName(undefined);
  }, [selectedSpace, selectedSpaceName, sessionKey, spacesQuery.isSuccess]);

  const navigateAfterScopeChange = useCallback((destination?: string) => {
    if (destination) {
      navigateRef.current(destination, { replace: true });
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
      setOptimisticSpace(space);
      setSelectedSpaceName(space.name);
      navigateAfterScopeChange(destination);
    },
    [navigateAfterScopeChange, sessionKey],
  );

  const clearSelectedSpace = useCallback(() => {
    writeSelectedSpaceName(sessionKey, undefined);
    setOptimisticSpace(undefined);
    setSelectedSpaceName(undefined);
  }, [sessionKey]);

  const selectMemos = useCallback(() => {
    clearSelectedSpace();
    navigateAfterScopeChange();
  }, [clearSelectedSpace, navigateAfterScopeChange]);

  const value = useMemo<SpaceContextValue>(
    () => ({
      spaces,
      spaceByName,
      duplicateSpaceTitles,
      selectedSpace,
      selectedSpaceName,
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
      spaceByName,
      spaces,
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
