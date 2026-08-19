import { DirectionProvider } from "@base-ui/react/direction-provider";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SIDEBAR_SECTION_ACTION_BUTTON_CLASSES, SIDEBAR_SECTION_ACTION_ICON_CLASSES } from "@/components/AppSidebar/SidebarSection";
import MemoDisplaySettingMenu from "@/components/MemoDisplaySettingMenu";
import { ViewProvider } from "@/contexts/ViewContext";

vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string, params?: Record<string, number>) => {
    const labels: Record<string, string> = {
      "common.created-at": "Created",
      "common.last-updated-at": "Last updated",
      "memo.compact-mode": "Compact mode",
      "memo.blog-compact-hint": "Blog layout already uses article previews.",
      "memo.direction": "Direction",
      "memo.grid-compact-hint": "Grid layouts always use compact cards.",
      "memo.layout": "Layout",
      "memo.layout-auto": "Auto",
      "memo.layout-auto-description": "As many columns as fit",
      "memo.layout-columns-description": `Up to ${params?.n ?? ""} columns`,
      "memo.layout-list": "List",
      "memo.layout-list-description": "A single column",
      "memo.layout-blog": "Blog",
      "memo.layout-blog-description": "Article previews",
      "memo.link-preview": "Link preview",
      "memo.newest-first": "Newest first",
      "memo.oldest-first": "Oldest first",
      "memo.order": "Order",
      "memo.order-by": "Order by",
      "memo.view-options": "View options",
    };
    if (key === "memo.layout-columns") return `${params?.n ?? ""} columns`;
    return labels[key] ?? key;
  },
}));

describe("MemoDisplaySettingMenu", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("opens from an accessible trigger and explains the compact grid constraint", () => {
    render(
      <ViewProvider>
        <MemoDisplaySettingMenu />
      </ViewProvider>,
    );

    const trigger = screen.getByRole("button", { name: "View options" });
    expect(trigger).toHaveClass(...SIDEBAR_SECTION_ACTION_BUTTON_CLASSES.split(" "));
    expect(trigger.querySelector("svg")).toHaveClass(SIDEBAR_SECTION_ACTION_ICON_CLASSES);

    fireEvent.click(trigger);

    const compactMode = screen.getByRole("switch", { name: "Compact mode" });
    expect(compactMode).toBeChecked();
    expect(compactMode).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("radio", { name: "memo.layout-blog-2" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    expect(compactMode).toBeEnabled();

    fireEvent.click(screen.getByRole("radio", { name: "2 columns" }));

    expect(compactMode).toBeChecked();
    expect(compactMode).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Grid layouts always use compact cards.")).toBeInTheDocument();
  });

  it("selects and persists the blog layout", () => {
    render(
      <ViewProvider>
        <MemoDisplaySettingMenu />
      </ViewProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "View options" }));
    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    fireEvent.click(screen.getByRole("radio", { name: "Blog" }));

    expect(screen.getByRole("radio", { name: "Blog" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Compact mode" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Blog layout already uses article previews.")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("memos-view-setting") ?? "{}").feedLayout).toBe("blog-classic");
  });

  it("moves horizontally in the visual direction for RTL layouts", () => {
    render(
      <DirectionProvider direction="rtl">
        <ViewProvider>
          <MemoDisplaySettingMenu />
        </ViewProvider>
      </DirectionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "View options" }));
    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    fireEvent.keyDown(screen.getByRole("radiogroup", { name: "Layout" }), { key: "ArrowLeft" });

    expect(screen.getByRole("radio", { name: "2 columns" })).toBeChecked();
  });
});
