import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PagedMemoList from "@/components/PagedMemoList";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

const view = vi.hoisted(() => ({ maxColumns: 1 as 0 | 1 | 2 | 3, compactMode: false, feedLayout: "memo" as "memo" | "blog" }));
const feed = vi.hoisted(() => ({
  memos: [] as unknown[],
  totalSize: 0,
  isLoading: false,
  request: {} as Record<string, unknown>,
}));
const readiness = vi.hoisted(() => ({ userSettings: true }));
const instance = vi.hoisted(() => ({ memoPageSize: 10 }));

vi.mock("@/hooks/useMemoQueries", () => ({
  useMemos: (request: Record<string, unknown>) => {
    feed.request = request;
    return {
      data: { memos: feed.memos, totalSize: feed.totalSize },
      isLoading: feed.isLoading,
    };
  },
}));

vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => ({
    generalSetting: { memoPageSize: instance.memoPageSize },
  }),
}));

vi.mock("@/contexts/MemoFilterContext", () => ({
  useMemoFilterContext: () => ({ filters: [] }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isUserSettingsInitialized: readiness.userSettings }),
}));

vi.mock("@/contexts/ViewContext", () => ({
  useView: () => view,
}));

vi.mock("@/utils/i18n", () => ({
  findNearestMatchedLanguage: (language: string) => language || "en",
  useTranslate: () => (key: string, params?: Record<string, number>) => {
    if (key === "message.no-data") return "No data found.";
    if (key === "memo.pagination-summary") return `Page ${params?.current} of ${params?.total}`;
    return key;
  },
}));

vi.mock("@/components/MemoContent/MentionResolutionContext", () => ({
  MentionResolutionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/MemoFilters", () => ({
  default: () => <div data-testid="memo-filters" />,
}));

vi.mock("@/components/BlogMemoView", () => ({
  default: ({ memo: blogMemo }: { memo: Memo }) => <article data-testid={`blog-${blogMemo.name}`} />,
}));

vi.mock("@/components/BlogSidebar", () => ({
  default: () => <div data-testid="blog-sidebar" />,
}));

const memo = { name: "memos/1", content: "hello", updateTime: undefined } as unknown as Memo;

const renderList = (
  renderer: (memo: Memo, options: { compact: boolean; parentPage: string }) => React.ReactElement = () => <div />,
  options: { leading?: React.ReactNode } = {},
) =>
  render(
    <MemoryRouter initialEntries={["/explore"]}>
      <QueryClientProvider client={new QueryClient()}>
        <PagedMemoList renderer={renderer} renderLeading={options.leading ? () => options.leading : undefined} />
      </QueryClientProvider>
    </MemoryRouter>,
  );

describe("<PagedMemoList>", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    view.maxColumns = 1;
    view.compactMode = false;
    view.feedLayout = "memo";
    feed.memos = [];
    feed.totalSize = 0;
    feed.isLoading = false;
    feed.request = {};
    readiness.userSettings = true;
    instance.memoPageSize = 10;
  });

  it("keeps fetched memo content hidden until privacy settings settle", () => {
    feed.memos = [memo];
    readiness.userSettings = false;
    const renderer = vi.fn((m: Memo) => <div key={m.name}>{m.content}</div>);

    renderList(renderer);

    expect(renderer).not.toHaveBeenCalled();
    expect(screen.queryByText("hello")).not.toBeInTheDocument();
  });

  it("renders fetched memo content once privacy settings settle", () => {
    feed.memos = [memo];
    const renderer = vi.fn((m: Memo) => <div key={m.name}>{m.content}</div>);

    renderList(renderer);

    expect(renderer).toHaveBeenCalled();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("uses the instance page size and requests the selected numbered page", () => {
    instance.memoPageSize = 10;
    feed.memos = [memo];
    feed.totalSize = 30;

    renderList();
    expect(feed.request).toEqual(expect.objectContaining({ pageSize: 10, pageOffset: 0, showTotalSize: true }));

    fireEvent.click(screen.getByRole("button", { name: "Page 2 of 3" }));
    expect(feed.request).toEqual(expect.objectContaining({ pageSize: 10, pageOffset: 10, showTotalSize: true }));
  });

  it("delays the initial loading spinner to avoid flashing on fast loads", async () => {
    vi.useFakeTimers();
    try {
      feed.isLoading = true;
      const { container } = renderList();

      expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
      await act(async () => vi.advanceTimersByTimeAsync(249));
      expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps route-owned leading content visible while memos load", () => {
    feed.isLoading = true;

    renderList(undefined, { leading: <div data-testid="leading-content" /> });

    expect(screen.getByTestId("leading-content")).toBeInTheDocument();
  });

  it("uses the tile sprite Placeholder for the empty state", () => {
    renderList();

    expect(screen.getByText("No data found.")).toBeInTheDocument();
    expect(screen.getByTestId("placeholder-sprite")).toBeInTheDocument();
  });

  it("shows the empty state below route-owned leading content", () => {
    renderList(undefined, { leading: <div data-testid="leading-content" /> });

    expect(screen.getByTestId("leading-content")).toBeInTheDocument();
    expect(screen.getByText("No data found.")).toBeInTheDocument();
    expect(screen.getByTestId("placeholder-sprite")).toBeInTheDocument();
  });

  it("places the blog sidebar beside the feed on desktop and after pagination on narrow screens", () => {
    view.feedLayout = "blog";
    feed.memos = [memo];
    feed.totalSize = 20;

    renderList();

    const sidebars = screen.getAllByTestId("blog-sidebar");
    expect(sidebars).toHaveLength(2);
    expect(sidebars.some((sidebar) => sidebar.closest("aside")?.classList.contains("lg:block"))).toBe(true);
    const mobileSidebar = sidebars.find((sidebar) => sidebar.parentElement?.classList.contains("lg:hidden"));
    const pagination = screen.getByRole("navigation", { name: "Page 1 of 2" });
    expect(mobileSidebar).toBeDefined();
    expect(pagination.compareDocumentPosition(mobileSidebar as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("places leading content and the empty state in the first grid column", () => {
    view.maxColumns = 0;
    const widthSpy = vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(1200);
    try {
      renderList(undefined, { leading: <div data-testid="leading-content" /> });

      const leadingTile = screen.getByText("No data found.").closest(".absolute");
      expect(leadingTile).not.toBeNull();
      expect(leadingTile).toContainElement(screen.getByTestId("leading-content"));
    } finally {
      widthSpy.mockRestore();
    }
  });

  describe("compact policy", () => {
    beforeEach(() => {
      feed.memos = [memo];
    });

    it("threads compact=false at one column with compact mode off", () => {
      const renderer = vi.fn((m: Memo) => <div key={m.name} />);
      renderList(renderer);
      expect(renderer).toHaveBeenCalledWith(
        expect.objectContaining({ name: "memos/1" }),
        expect.objectContaining({ compact: false, parentPage: "/explore" }),
      );
    });

    it("threads compact=true at one column with compact mode on", () => {
      view.compactMode = true;
      const renderer = vi.fn((m: Memo) => <div key={m.name} />);
      renderList(renderer);
      expect(renderer).toHaveBeenCalledWith(expect.objectContaining({ name: "memos/1" }), expect.objectContaining({ compact: true }));
    });

    it("respects the compact setting in the narrow-width fallback even when columns are allowed", () => {
      // jsdom measures 0px, so the flow fallback renders and behaves exactly like maxColumns = 1.
      view.maxColumns = 0;
      const renderer = vi.fn((m: Memo) => <div key={m.name} />);
      renderList(renderer);
      expect(renderer).toHaveBeenCalledWith(expect.objectContaining({ name: "memos/1" }), expect.objectContaining({ compact: false }));
    });

    it("forces compact once the width fits the grid", () => {
      view.maxColumns = 0;
      const widthSpy = vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(1200);
      try {
        const renderer = vi.fn((m: Memo) => <div key={m.name} />);
        renderList(renderer);
        expect(renderer).toHaveBeenCalledWith(expect.objectContaining({ name: "memos/1" }), expect.objectContaining({ compact: true }));
      } finally {
        widthSpy.mockRestore();
      }
    });
  });
});
