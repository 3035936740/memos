import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DailyQuestion, TodayCard } from "@/components/HomeToday";
import MemoEditor from "@/components/MemoEditor";
import type { EditorController } from "@/components/MemoEditor/types/editorController";
import { deriveDefaultCreateTimeFromFilters } from "@/components/MemoEditor/utils/deriveDefaultCreateTime";
import { takeSharedNote } from "@/components/MemoEditor/utils/sharedNote";
import MemoView from "@/components/MemoView";
import PagedMemoList, { getMemoKey } from "@/components/PagedMemoList";
import { useAuth } from "@/contexts/AuthContext";
import { useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { NewMemoProvider } from "@/contexts/NewMemoContext";
import { useSpaceContext } from "@/contexts/SpaceContext";
import { useMemoFilters, useMemoSorting } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import { spaceScopedCacheKey } from "@/lib/resource-names";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { buildDailyAnswerDraft } from "@/utils/daily-question";
import { useTranslate } from "@/utils/i18n";

const Home = () => {
  const user = useCurrentUser();
  const t = useTranslate();
  const { isUserSettingsInitialized } = useAuth();
  const { filters } = useMemoFilterContext();
  const { memoFilter: contextFilter, selectedSpaceName } = useSpaceContext();
  const defaultCreateTime = useMemo(() => deriveDefaultCreateTimeFromFilters(filters), [filters]);
  // Doubles as the remount key: the draft cache only reloads on mount, so the editor
  // has to be rebuilt for the new Space rather than just re-pointed at another cache.
  const editorCacheKey = spaceScopedCacheKey("home-memo-editor", selectedSpaceName);

  const editorRef = useRef<EditorController | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const bindEditor = useCallback((controller: EditorController | null) => {
    editorRef.current = controller;
    setEditorReady(Boolean(controller));
  }, []);
  const answerDailyQuestion = (heading: string, day: string) => {
    const editor = editorRef.current;
    if (!user || !editor) return;
    const answer = buildDailyAnswerDraft(editor.getMarkdown(), heading, day);
    editor.setMarkdown(answer.content);
    editor.setCursor(answer.cursor);
    editor.focus();
    editor.scrollToCursor();
  };

  // A page shared to Memos joins the draft here; a layout effect runs before the editor's mount effect reads it.
  useLayoutEffect(() => takeSharedNote(user?.name ?? "", editorCacheKey), [editorCacheKey, user?.name]);

  const memoFilter = useMemoFilters({
    creatorName: user?.name,
    includeMemoViews: true,
    includePinned: true,
  });

  const { listSort, orderBy } = useMemoSorting({
    pinnedFirst: true,
    state: State.NORMAL,
  });

  return (
    <div data-page-shell className="w-full min-h-full bg-background text-foreground">
      <NewMemoProvider>
        <PagedMemoList
          renderer={(memo: Memo, { compact, parentPage, navigationScope }) => (
            <MemoView
              key={getMemoKey(memo)}
              memo={memo}
              parentPage={parentPage}
              navigationScope={navigationScope}
              showVisibility
              showPinned
              showSpace={!selectedSpaceName}
              compact={compact}
            />
          )}
          listSort={listSort}
          orderBy={orderBy}
          filter={memoFilter}
          contextFilter={contextFilter}
          blogHero
          selectable
          renderLeading={({ useGrid }) => {
            if (!isUserSettingsInitialized) return null;

            return (
              <>
                <TodayCard />
                <DailyQuestion onAnswer={answerDailyQuestion} disabled={!editorReady} />
                <MemoEditor
                  key={editorCacheKey}
                  className={useGrid ? undefined : "mb-2"}
                  cacheKey={editorCacheKey}
                  placeholder={t("editor.any-thoughts")}
                  defaultCreateTime={defaultCreateTime}
                  defaultSpace={selectedSpaceName}
                  onEditorReady={bindEditor}
                />
              </>
            );
          }}
        />
      </NewMemoProvider>
    </div>
  );
};

export default Home;
