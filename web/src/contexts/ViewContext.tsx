import { createContext, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { StylePack } from "@/types/proto/api/v1/instance_service_pb";
import { type BlogStyle, DEFAULT_BLOG_STYLE, isBlogStyle } from "@/utils/blog-style";
import type { PostLook } from "@/utils/post-look";
import { isStylePackId, stylePackBase } from "@/utils/style-packs";
import { setThemeOverride, THEME_CHOSEN_EVENT } from "@/utils/theme";

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
  /** A community style pack chosen over the built-in style; blogStyle keeps the last built-in choice. */
  stylePack?: string;
}

interface ViewContextValue {
  orderByTimeAsc: boolean;
  timeBasis: MemoTimeBasis;
  compactMode: boolean;
  linkPreview: boolean;
  maxColumns: MemoMaxColumns;
  feedLayout: MemoFeedLayout;
  /**
   * The built-in style showing now (the post's own while one is open with a look of its own, otherwise the
   * visitor's), or while a style pack shows, the built-in style it behaves like. Reactions, music and easter eggs
   * key on this.
   */
  blogStyle: BlogStyle;
  /** What <html data-style> carries: a built-in style, or a style pack's id while one shows. */
  styleId: string;
  /** The style pack showing now, if any. */
  stylePack?: StylePack;
  /** The enabled style packs, empty until StylePackLoader has fetched them. */
  stylePacks: StylePack[];
  /** Hands over the enabled packs (StylePackLoader); a saved pack that is no longer there falls back to default. */
  setStylePacks: (packs: StylePack[]) => void;
  /** Wears a style pack, the way setBlogStyle wears a built-in style. */
  setStylePack: (id: string) => void;
  /** The look the open post's author chose, while it is showing. */
  postLook?: PostLook;
  /** Shows a post's look without saving it; undefined goes back to the visitor's own. */
  setPostLook: (look: PostLook | undefined) => void;
  setOrderByTimeAsc: (value: boolean) => void;
  setTimeBasis: (field: MemoTimeBasis) => void;
  setCompactMode: (value: boolean) => void;
  setLinkPreview: (value: boolean) => void;
  setMaxColumns: (value: MemoMaxColumns) => void;
  setFeedLayout: (value: MemoFeedLayout) => void;
  setBlogStyle: (value: BlogStyle) => void;
  /** Shows the admin's first-visit style (built-in or pack) when this browser has never saved a view; never persisted. */
  applyFirstVisitStyle: (value: string) => void;
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

const NO_STYLE_PACKS: StylePack[] = [];

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
          stylePack: feedLayout === "blog2" && isStylePackId(data.stylePack) ? data.stylePack : undefined,
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
  const [postLook, setPostLookState] = useState<PostLook>();
  const [loadedStylePacks, setLoadedStylePacks] = useState<StylePack[]>();
  const stylePacks = loadedStylePacks ?? NO_STYLE_PACKS;
  const findPack = (id: string | undefined) => (id ? stylePacks.find((pack) => pack.id === id) : undefined);

  // Styles only dress Blog 2, the visitor's own and a post's alike; a post's theme applies in every layout. A post's
  // built-in style or pack comes first, then the visitor's pack, then their built-in style. Until the packs have
  // loaded, a saved pack keeps its place on <html> so the page does not flash another style first.
  const blog2 = viewState.feedLayout === "blog2";
  const postPack = blog2 && !postLook?.style ? findPack(postLook?.stylePack) : undefined;
  const savedPackId =
    blog2 && !postLook?.style && !postPack && viewState.stylePack && (!loadedStylePacks || findPack(viewState.stylePack))
      ? viewState.stylePack
      : undefined;
  const stylePack = postPack ?? findPack(savedPackId);
  const styleId = blog2 && postLook?.style ? postLook.style : (stylePack?.id ?? savedPackId ?? viewState.blogStyle);
  const blogStyle = blog2 && postLook?.style ? postLook.style : savedPackId || postPack ? stylePackBase(stylePack) : viewState.blogStyle;
  // Whether this browser had saved view settings when the app started; first-visit defaults only apply when not.
  const hadSavedViewRef = useRef(hasSavedView());
  const timeBasis = viewState.timeBasis ?? "create_time";

  // The style also dresses the app frame (rail, top bar, page background), which sits outside the
  // feed, so it is mirrored onto <html>. It only applies to Blog 2; other layouts, Blog 1 included, keep the default.
  useLayoutEffect(() => {
    if (viewState.feedLayout === "blog2") document.documentElement.dataset.style = styleId;
    else delete document.documentElement.dataset.style;
  }, [styleId, viewState.feedLayout]);

  const setPostLook = useCallback((look: PostLook | undefined) => {
    setPostLookState(look);
    setThemeOverride(look?.theme);
  }, []);

  // Picking a theme in a menu takes the look back from the post, as picking a style does.
  useEffect(() => {
    const handleChosen = () => setPostLook(undefined);
    window.addEventListener(THEME_CHOSEN_EVENT, handleChosen);
    return () => window.removeEventListener(THEME_CHOSEN_EVENT, handleChosen);
  }, [setPostLook]);

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
    updateState(value === "blog2" ? { feedLayout: value } : { feedLayout: value, blogStyle: DEFAULT_BLOG_STYLE, stylePack: undefined });
  // Picking a style is taking the look back from the post.
  const setBlogStyle = (value: BlogStyle) => {
    setPostLook(undefined);
    updateState({ blogStyle: value, stylePack: undefined });
  };
  const setStylePack = (id: string) => {
    setPostLook(undefined);
    updateState({ stylePack: id });
  };
  const setStylePacks = useCallback((packs: StylePack[]) => setLoadedStylePacks(packs), []);

  // A saved pack the admin has since disabled or removed gives way to the default style. Only a choice this
  // browser saved is saved again; a first-visit pack is simply dropped.
  useEffect(() => {
    if (!loadedStylePacks || !viewState.stylePack || loadedStylePacks.some((pack) => pack.id === viewState.stylePack)) return;
    const fallback = { stylePack: undefined, blogStyle: DEFAULT_BLOG_STYLE };
    if (hadSavedViewRef.current) updateState(fallback);
    else setViewState((prev) => ({ ...prev, ...fallback }));
    // updateState is recreated every render; the check above keeps this to once per vanished pack.
  }, [loadedStylePacks, viewState.stylePack]);
  const resetToDefaults = () => {
    setPostLook(undefined);
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {
      // Nothing saved to forget.
    }
    hadSavedViewRef.current = false;
    setViewState({ ...DEFAULT_VIEW_STATE });
  };
  // The admin's first-visit style, shown without saving it, so a later change by the admin still reaches this browser.
  const applyFirstVisitStyle = (value: string) => {
    if (hadSavedViewRef.current) return;
    if (isBlogStyle(value)) {
      setViewState((prev) => (prev.blogStyle === value && !prev.stylePack ? prev : { ...prev, blogStyle: value, stylePack: undefined }));
    } else if (isStylePackId(value)) {
      setViewState((prev) => (prev.stylePack === value ? prev : { ...prev, stylePack: value }));
    }
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
        blogStyle,
        styleId,
        stylePack,
        stylePacks,
        setStylePacks,
        setStylePack,
        postLook,
        setPostLook,
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

/** The enabled style packs, or none outside a ViewProvider (tests, isolated settings panels). */
export function useStylePackList() {
  return useContext(ViewContext)?.stylePacks ?? NO_STYLE_PACKS;
}

// Read the link-preview preference from deep inside the markdown renderer, which
// can render outside a ViewProvider (tests, isolated previews). Defaults to
// enabled when no provider is present, preserving the historical behavior.
export function useLinkPreviewEnabled() {
  return useContext(ViewContext)?.linkPreview ?? DEFAULT_VIEW_STATE.linkPreview;
}
