import { createContext, type ReactNode, useContext, useLayoutEffect, useRef, useState } from "react";
import { type BlogStyle, DEFAULT_BLOG_STYLE, isBlogStyle } from "@/utils/blog-style";

export type MemoTimeBasis = "create_time" | "update_time";
export type MemoFeedLayout = "memo" | "blog-classic" | "blog2";

/** Upper bound on feed columns, in display order. 1 = single reading column; 0 = as many as fit. */
export const MAX_COLUMNS_VALUES = [1, 2, 3, 0] as const;
export type MemoMaxColumns = (typeof MAX_COLUMNS_VALUES)[number];

interface ViewState {
  orderByTimeAsc: boolean;
  timeBasis?: MemoTimeBasis;
  sortTimeField?: MemoTimeBasis;
  compactMode: boolean;
  linkPreview: boolean;
  maxColumns: MemoMaxColumns;
  feedLayout: MemoFeedLayout;
  blogStyle: BlogStyle;
}

interface ViewContextValue {
  orderByTimeAsc: boolean;
  timeBasis: MemoTimeBasis;
  compactMode: boolean;
  linkPreview: boolean;
  maxColumns: MemoMaxColumns;
  feedLayout: MemoFeedLayout;
  blogStyle: BlogStyle;
  setOrderByTimeAsc: (value: boolean) => void;
  setTimeBasis: (field: MemoTimeBasis) => void;
  setCompactMode: (value: boolean) => void;
  setLinkPreview: (value: boolean) => void;
  setMaxColumns: (value: MemoMaxColumns) => void;
  setFeedLayout: (value: MemoFeedLayout) => void;
  setBlogStyle: (value: BlogStyle) => void;
  /** Shows the admin's first-visit style when this browser has never saved a view; never persisted. */
  applyFirstVisitStyle: (value: BlogStyle) => void;
  /** Forgets this browser's view settings, back to the site defaults (the admin reset everyone's preferences). */
  resetToDefaults: () => void;
}

const ViewContext = createContext<ViewContextValue | null>(null);

const LOCAL_STORAGE_KEY = "memos-view-setting";

const hasSavedView = () => {
  try {
    return localStorage.getItem(LOCAL_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
};

const DEFAULT_VIEW_STATE: ViewState = {
  orderByTimeAsc: false,
  compactMode: true,
  linkPreview: true,
  maxColumns: 1,
  feedLayout: "blog2",
  blogStyle: DEFAULT_BLOG_STYLE,
};

export function ViewProvider({ children }: { children: ReactNode }) {
  const getInitialState = (): ViewState => {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        const data = JSON.parse(cached) as Omit<Partial<ViewState>, "feedLayout"> & { feedLayout?: string };
        const cachedTimeBasis = data.timeBasis ?? data.sortTimeField;
        const timeBasis = cachedTimeBasis === "create_time" || cachedTimeBasis === "update_time" ? cachedTimeBasis : undefined;
        const maxColumns = MAX_COLUMNS_VALUES.includes(data.maxColumns as MemoMaxColumns)
          ? (data.maxColumns as MemoMaxColumns)
          : DEFAULT_VIEW_STATE.maxColumns;
        const feedLayout: MemoFeedLayout =
          // `blog` was the original storage value. Blog 2 is now the main blog
          // experience, so existing installations transparently move to it. The
          // original blog renderer remains available under its new canonical id.
          data.feedLayout === "blog"
            ? "blog2"
            : data.feedLayout === "memo" || data.feedLayout === "blog-classic" || data.feedLayout === "blog2"
              ? data.feedLayout
              : DEFAULT_VIEW_STATE.feedLayout;
        const normalizedState: ViewState = {
          orderByTimeAsc: Boolean(data.orderByTimeAsc ?? DEFAULT_VIEW_STATE.orderByTimeAsc),
          timeBasis,
          compactMode: Boolean(data.compactMode ?? DEFAULT_VIEW_STATE.compactMode),
          linkPreview: Boolean(data.linkPreview ?? DEFAULT_VIEW_STATE.linkPreview),
          maxColumns,
          feedLayout,
          blogStyle: feedLayout === "blog2" && isBlogStyle(data.blogStyle) ? data.blogStyle : DEFAULT_BLOG_STYLE,
        };
        if (data.feedLayout === "blog" || data.blogStyle !== normalizedState.blogStyle) {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalizedState));
        }
        return normalizedState;
      }
    } catch (error) {
      console.warn("Failed to load view settings from localStorage:", error);
    }
    return { ...DEFAULT_VIEW_STATE };
  };

  const [viewState, setViewState] = useState(getInitialState);
  // Whether this browser had saved view settings when the app started; first-visit defaults only apply when not.
  const hadSavedViewRef = useRef(hasSavedView());
  const timeBasis = viewState.timeBasis ?? "create_time";

  // The style also dresses the app frame (rail, top bar, page background), which sits outside the
  // feed, so it is mirrored onto <html>. It only applies to Blog 2; other layouts, Blog 1 included, keep the default.
  useLayoutEffect(() => {
    if (viewState.feedLayout === "blog2") document.documentElement.dataset.style = viewState.blogStyle;
    else delete document.documentElement.dataset.style;
  }, [viewState.blogStyle, viewState.feedLayout]);

  const persistToStorage = (newState: ViewState) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newState));
    } catch (error) {
      console.warn("Failed to persist view settings:", error);
    }
  };

  const updateState = (patch: Partial<ViewState> | ((prev: ViewState) => Partial<ViewState>)) => {
    // Once the visitor sets anything, first-visit defaults stop applying.
    hadSavedViewRef.current = true;
    setViewState((prev) => {
      const newState = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
      persistToStorage(newState);
      return newState;
    });
  };

  const setOrderByTimeAsc = (value: boolean) => updateState({ orderByTimeAsc: value });
  const setTimeBasis = (field: MemoTimeBasis) => updateState({ timeBasis: field });
  const setCompactMode = (value: boolean) => updateState({ compactMode: value });
  const setLinkPreview = (value: boolean) => updateState({ linkPreview: value });
  const setMaxColumns = (value: MemoMaxColumns) => updateState({ maxColumns: value });
  const setFeedLayout = (value: MemoFeedLayout) =>
    updateState(value === "blog2" ? { feedLayout: value } : { feedLayout: value, blogStyle: DEFAULT_BLOG_STYLE });
  const setBlogStyle = (value: BlogStyle) => updateState({ blogStyle: value });
  const resetToDefaults = () => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {
      // Nothing saved to forget.
    }
    hadSavedViewRef.current = false;
    setViewState({ ...DEFAULT_VIEW_STATE });
  };
  // The admin's first-visit style, shown without saving it, so a later change by the admin still reaches this browser.
  const applyFirstVisitStyle = (value: BlogStyle) => {
    if (hadSavedViewRef.current) return;
    setViewState((prev) => (prev.blogStyle === value ? prev : { ...prev, blogStyle: value }));
  };

  return (
    <ViewContext.Provider
      value={{
        orderByTimeAsc: viewState.orderByTimeAsc,
        timeBasis,
        compactMode: viewState.compactMode,
        linkPreview: viewState.linkPreview,
        maxColumns: viewState.maxColumns,
        feedLayout: viewState.feedLayout,
        blogStyle: viewState.blogStyle,
        setOrderByTimeAsc,
        setTimeBasis,
        setCompactMode,
        setLinkPreview,
        setMaxColumns,
        setFeedLayout,
        setBlogStyle,
        applyFirstVisitStyle,
        resetToDefaults,
      }}
    >
      {children}
    </ViewContext.Provider>
  );
}

export function useView() {
  const context = useContext(ViewContext);
  if (!context) {
    throw new Error("useView must be used within ViewProvider");
  }
  return context;
}

// Read the link-preview preference from deep inside the markdown renderer, which
// can render outside a ViewProvider (tests, isolated previews). Defaults to
// enabled when no provider is present, preserving the historical behavior.
export function useLinkPreviewEnabled() {
  return useContext(ViewContext)?.linkPreview ?? DEFAULT_VIEW_STATE.linkPreview;
}
