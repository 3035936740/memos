import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import MemoDetail from "@/pages/MemoDetail";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

const memo = {
  name: "memos/test",
  content: "Test memo",
  creator: "users/test",
  reactions: [],
  attachments: [],
  parent: "",
} as Memo;

vi.mock("@/components/BlogSidebar", () => ({
  default: ({ parentPage }: { parentPage: string }) => <div data-testid="blog-sidebar">{parentPage}</div>,
}));

vi.mock("@/components/MemoView", () => ({ default: () => <article>Memo content</article> }));
vi.mock("@/components/MemoCommentSection", () => ({ default: () => <section>Comments</section> }));
vi.mock("@/components/MemoContent/MentionResolutionContext", () => ({
  MentionResolutionProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/contexts/AppSidebarContext", () => ({ useAppSidebar: () => ({ setMemoDetail: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isInitialized: true }) }));
vi.mock("@/contexts/InstanceContext", () => ({ useInstance: () => ({ isInitialized: true }) }));
vi.mock("@/hooks/useMemoDetailError", () => ({ default: () => undefined }));
vi.mock("@/hooks/useMemoQueries", () => ({
  useMemo: (name: string) => ({ data: name === memo.name ? memo : undefined, error: null, isLoading: false }),
  useInfiniteMemoComments: () => ({
    data: [],
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));
vi.mock("@/hooks/useMemoShareQueries", () => ({
  useSharedMemo: () => ({ data: undefined, error: null, isLoading: false }),
  withShareAttachmentLinks: (attachments: unknown[]) => attachments,
}));
vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));

describe("MemoDetail layout", () => {
  it("shows the blog sidebar in desktop and mobile placements", () => {
    render(
      <MemoryRouter initialEntries={["/memos/test"]}>
        <Routes>
          <Route path="/memos/:uid" element={<MemoDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Memo content")).toBeInTheDocument();
    const sidebars = screen.getAllByTestId("blog-sidebar");
    expect(sidebars).toHaveLength(2);
    expect(sidebars.every((sidebar) => sidebar.textContent === "/memos/test")).toBe(true);
    expect(sidebars.some((sidebar) => sidebar.parentElement?.classList.contains("lg:hidden"))).toBe(true);
    expect(sidebars.some((sidebar) => sidebar.parentElement?.tagName === "ASIDE")).toBe(true);
  });

  it("returns a direct-link memo to Explore instead of browser history", () => {
    const historyLengthSpy = vi.spyOn(window.history, "length", "get").mockReturnValue(2);

    render(
      <MemoryRouter initialEntries={["/previous-browser-page", "/memos/test"]} initialIndex={1}>
        <Routes>
          <Route path="/memos/:uid" element={<MemoDetail />} />
          <Route path="/explore" element={<div>Explore article list</div>} />
          <Route path="/previous-browser-page" element={<div>Previous browser page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "memo.back-to-list" }));
    expect(screen.getByText("Explore article list")).toBeInTheDocument();
    expect(screen.queryByText("Previous browser page")).not.toBeInTheDocument();

    historyLengthSpy.mockRestore();
  });
});
