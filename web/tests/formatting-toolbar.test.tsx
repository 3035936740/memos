import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { type ActiveFormatState, EMPTY_ACTIVE_FORMATS } from "@/components/MemoEditor/formatting/commands";
import { FormattingToolbar } from "@/components/MemoEditor/Toolbar/FormattingToolbar";
import type { EditorController } from "@/components/MemoEditor/types/editorController";

// Match the repo convention: t echoes the i18n key (no i18next backend in tests),
// so accessible names below are the keys themselves.
vi.mock("@/utils/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/i18n")>()),
  useTranslate: () => (key: string) => key,
}));

// Base UI menus reach for layout/pointer APIs jsdom doesn't implement.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

function makeController(opts: { active?: Partial<ActiveFormatState> } = {}) {
  const run = vi.fn();
  const activeFormats: ActiveFormatState = { ...EMPTY_ACTIVE_FORMATS, ...opts.active };
  const controller: EditorController = {
    focus: () => {},
    hasFocus: () => false,
    isEmpty: () => true,
    getMarkdown: () => "",
    setMarkdown: () => {},
    insertMarkdown: vi.fn(),
    insertInlineMarkdown: vi.fn(),
    getCursor: () => 0,
    setCursor: vi.fn(),
    scrollToCursor: () => {},
    selectAll: () => {},
    createUploadAnchor: vi.fn(),
    updateUploadAnchor: vi.fn(),
    resolveUploadAnchor: vi.fn(),
    cancelUploadAnchor: vi.fn(),
    formatting: {
      run,
      getActiveFormats: () => activeFormats,
      subscribe: () => () => {},
    },
  };
  return { controller, run };
}

function renderToolbar(controller: EditorController, action: "minimize" | "close" = "minimize") {
  const ref = createRef<EditorController>();
  ref.current = controller;
  const onExit = vi.fn();
  render(<FormattingToolbar controllerRef={ref} exit={{ action, onExit }} />);
  return { onExit };
}

describe("FormattingToolbar", () => {
  it("does not expose a transient scrollbar before its width is measured", () => {
    const { controller } = makeController();
    renderToolbar(controller);

    expect(screen.getByRole("toolbar")).toHaveClass("overflow-x-hidden");
    expect(screen.getByRole("toolbar")).not.toHaveClass("overflow-x-auto");
  });

  it("runs the bold command when the bold button is clicked", () => {
    const { controller, run } = makeController();
    renderToolbar(controller);
    fireEvent.click(screen.getByRole("button", { name: "editor.format.bold" }));
    expect(run).toHaveBeenCalledWith("bold");
  });

  it("runs the heading command when a heading level is chosen", () => {
    const { controller, run } = makeController();
    renderToolbar(controller);
    fireEvent.click(screen.getByRole("button", { name: "editor.format.heading" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "editor.format.heading-2" }));
    expect(run).toHaveBeenCalledWith("heading2");
  });

  it("reflects active marks via aria-pressed", () => {
    const { controller } = makeController({ active: { bold: true } });
    renderToolbar(controller);
    expect(screen.getByRole("button", { name: "editor.format.bold" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "editor.format.italic" })).toHaveAttribute("aria-pressed", "false");
  });

  it("runs alignment and hidden-text commands", () => {
    const { controller, run } = makeController();
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "editor.format.align-center" }));
    fireEvent.click(screen.getByRole("button", { name: "editor.format.spoiler" }));

    expect(run).toHaveBeenCalledWith("alignCenter");
    expect(run).toHaveBeenCalledWith("spoiler");
  });

  it("applies a validated RGBA text color", () => {
    const { controller, run } = makeController();
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "editor.format.text-color" }));
    fireEvent.change(screen.getByRole("textbox", { name: "editor.format.text-color" }), { target: { value: "12, 34, 56, 0.7" } });
    fireEvent.click(screen.getByRole("button", { name: "common.confirm" }));

    expect(run).toHaveBeenCalledWith("textColor", { color: "rgba(12, 34, 56, 0.7)" });
  });

  it("uses the color picker while preserving the current alpha", () => {
    const { controller, run } = makeController({ active: { textColor: "rgba(100, 110, 120, 0.6)" } });
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "editor.format.text-color" }));
    fireEvent.change(screen.getByLabelText("editor.format.text-color-picker"), { target: { value: "#0c2238" } });
    expect(screen.getByRole("textbox", { name: "editor.format.text-color" })).toHaveValue("rgba(12, 34, 56, 0.6)");
    fireEvent.click(screen.getByRole("button", { name: "common.confirm" }));

    expect(run).toHaveBeenCalledWith("textColor", { color: "rgba(12, 34, 56, 0.6)" });
  });

  it("applies a validated custom font size", () => {
    const { controller, run } = makeController();
    renderToolbar(controller);

    fireEvent.click(screen.getByRole("button", { name: "editor.format.font-size" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "editor.format.font-size" }), { target: { value: "28" } });
    fireEvent.click(screen.getByRole("button", { name: "common.confirm" }));

    expect(run).toHaveBeenCalledWith("fontSize", { fontSize: "28px" });
  });

  it("calls onExit when the exit button is clicked", () => {
    const { controller } = makeController();
    const { onExit } = renderToolbar(controller);
    fireEvent.click(screen.getByRole("button", { name: "editor.exit-focus-mode" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("labels the exit button as close when a host owns the frame", () => {
    const { controller } = makeController();
    const { onExit } = renderToolbar(controller, "close");

    expect(screen.queryByRole("button", { name: "editor.exit-focus-mode" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "common.close" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
