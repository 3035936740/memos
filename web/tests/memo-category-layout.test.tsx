import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/contexts/ViewContext";
import MemoCategory from "@/pages/MemoCategory";

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return { ...actual, useQueries: () => [] };
});

vi.mock("@/components/BlogSidebar", () => ({
  default: ({ parentPage }: { parentPage: string }) => <div data-testid="blog-sidebar">{parentPage}</div>,
}));

vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => ({
    generalSetting: {
      memoCategoriesJson: JSON.stringify([{ slug: "music", title: "Music", description: "Sound notes", memoNames: [], access: "public" }]),
    },
  }),
}));

vi.mock("@/hooks/useCurrentUser", () => ({ default: () => undefined }));

vi.mock("@/hooks/useMemoQueries", () => ({
  useMemos: () => ({ data: { memos: [], totalSize: 0 }, isLoading: false }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isUserSettingsInitialized: true }),
}));

vi.mock("@/contexts/MemoFilterContext", () => ({
  useMemoFilterContext: () => ({ filters: [] }),
}));

vi.mock("@/contexts/NewMemoContext", () => ({
  useNewMemo: () => ({ newMemoName: undefined }),
}));

describe("MemoCategory layout", () => {
  it("shows the blog sidebar on desktop and mobile placements", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ViewProvider>
          <MemoryRouter initialEntries={["/categories/music"]}>
            <Routes>
              <Route path="/categories/:slug" element={<MemoCategory />} />
            </Routes>
          </MemoryRouter>
        </ViewProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Music" })).toBeInTheDocument();
    const sidebars = screen.getAllByTestId("blog-sidebar");
    expect(sidebars).toHaveLength(2);
    expect(sidebars.every((sidebar) => sidebar.textContent === "/categories/music")).toBe(true);
    expect(sidebars.some((sidebar) => sidebar.parentElement?.classList.contains("lg:hidden"))).toBe(true);
    expect(sidebars.some((sidebar) => sidebar.parentElement?.tagName === "ASIDE")).toBe(true);
  });
});
