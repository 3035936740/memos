import { useMemo } from "react";
import GuestMemoComposer from "@/components/GuestMemoComposer";
import MemoEditor from "@/components/MemoEditor";
import { deriveDefaultCreateTimeFromFilters } from "@/components/MemoEditor/utils/deriveDefaultCreateTime";
import MemoView from "@/components/MemoView";
import PagedMemoList, { getMemoKey } from "@/components/PagedMemoList";
import { useAuth } from "@/contexts/AuthContext";
import { useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { NewMemoProvider } from "@/contexts/NewMemoContext";
import { useSpaceContext } from "@/contexts/SpaceContext";
import { useMemoFilters, useMemoSorting } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo, Visibility } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";

const Explore = () => {
  const currentUser = useCurrentUser();
  const t = useTranslate();
  const { isUserSettingsInitialized } = useAuth();
  const { filters } = useMemoFilterContext();
  const defaultCreateTime = useMemo(() => deriveDefaultCreateTimeFromFilters(filters), [filters]);
  const { memoFilter: contextFilter, selectedSpaceName } = useSpaceContext();

  // Determine visibility filter based on authentication status
  // - Logged-in users: Can see every audience the backend authorizes, including SPACE memos
  // - Visitors: Can see PUBLIC memos globally and the SPACE audience inside a
  //   selected public Space. The backend validates that Space access mode.
  // Note: The backend is responsible for filtering stats based on visibility permissions.
  const visibilities = currentUser
    ? [Visibility.PUBLIC, Visibility.PROTECTED, Visibility.SPACE]
    : selectedSpaceName
      ? [Visibility.PUBLIC, Visibility.SPACE]
      : [Visibility.PUBLIC];

  const memoFilter = useMemoFilters({
    includeMemoViews: true,
    includePinned: false,
    visibilities,
  });

  // Get sorting logic using unified hook (no pinned sorting)
  const { listSort, orderBy } = useMemoSorting({
    pinnedFirst: false,
    state: State.NORMAL,
  });

  return (
    <div data-page-shell className="min-h-full w-full bg-background text-foreground">
      <NewMemoProvider>
        <PagedMemoList
          renderer={(memo: Memo, { compact, parentPage, navigationScope }) => (
            <MemoView
              key={getMemoKey(memo)}
              memo={memo}
              parentPage={parentPage}
              navigationScope={navigationScope}
              showCreator
              showVisibility
              showSpace={!selectedSpaceName}
              compact={compact}
            />
          )}
          listSort={listSort}
          orderBy={orderBy}
          filter={memoFilter}
          contextFilter={contextFilter}
          showCreator
          renderLeading={({ useGrid }) => {
            if (!isUserSettingsInitialized) return null;

            if (!currentUser) {
              return <GuestMemoComposer className={useGrid ? undefined : "mb-2"} />;
            }

            return (
              <MemoEditor
                className={useGrid ? undefined : "mb-2"}
                cacheKey="explore-memo-editor"
                placeholder={t("editor.any-thoughts")}
                defaultCreateTime={defaultCreateTime}
                defaultSpace={selectedSpaceName}
              />
            );
          }}
        />
      </NewMemoProvider>
    </div>
  );
};

export default Explore;
