import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { createInitialState, EditorProvider, useEditorSelector } from "@/components/MemoEditor/state";
import { EditorToolbar } from "@/components/MemoEditor/Toolbar/EditorToolbar";
import InsertMenu from "@/components/MemoEditor/Toolbar/InsertMenu";
import { User_Role } from "@/types/proto/api/v1/user_service_pb";

const authState = vi.hoisted(() => ({
  currentUser: undefined as { name: string; role: User_Role } | undefined,
}));

vi.mock("@/utils/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/i18n")>()),
  useTranslate: () => (key: string) => key,
}));
vi.mock("@/hooks/useCurrentUser", () => ({ default: () => authState.currentUser }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ userGeneralSetting: undefined }) }));
vi.mock("@/contexts/InstanceContext", () => ({ useInstance: () => ({ generalSetting: { memoCategoriesJson: "" } }) }));
vi.mock("@/contexts/SpaceContext", () => ({ useSpaceContext: () => ({ selectedSpaceName: undefined }) }));
vi.mock("@/components/map/useReverseGeocoding", () => ({ useReverseGeocoding: () => ({ data: undefined }) }));
vi.mock("@/components/MemoEditor/components/EmojiPickerDialog", () => ({ default: () => null }));
vi.mock("@/components/MemoEditor/components/AIGenerateDialog", () => ({ default: () => null }));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

beforeEach(() => {
  authState.currentUser = undefined;
});

const HiddenStateProbe = () => {
  const hidden = useEditorSelector((state) => state.metadata.hidden);
  return <output aria-label="hidden-state">{String(hidden)}</output>;
};

const viewToggles = {
  onToggleFocusMode: vi.fn(),
  isFormattingToolbarVisible: false,
  onToggleFormattingToolbar: vi.fn(),
};

/** `hosted` mirrors an editor whose presentation belongs to a host (the global composer). */
const renderMenu = (onInsertImages = vi.fn(), isSaving = false, onInsertVideos = vi.fn(), hosted = false) =>
  render(
    <EditorProvider>
      <InsertMenu
        isSaving={isSaving}
        onLocationChange={vi.fn()}
        onInsertImages={onInsertImages}
        onInsertVideos={onInsertVideos}
        onInsertEmoji={vi.fn()}
        onInsertAIText={vi.fn()}
        onAudioRecorderClick={vi.fn()}
        viewToggles={hosted ? undefined : viewToggles}
      />
    </EditorProvider>,
  );

describe("InsertMenu", () => {
  test("shows attachment and inline-image actions in the intended order", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "common.add" });
    expect(trigger).toHaveAttribute("tabindex", "0");

    fireEvent.click(trigger);

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "editor.insert-menu.add-attachment",
      "editor.insert-menu.insert-image",
      "editor.insert-menu.insert-video",
      "editor.insert-menu.insert-emoji",
      "editor.insert-menu.ai-assistant",
      "editor.audio-recorder.trigger",
      "editor.insert-menu.link-memo",
      "editor.insert-menu.add-location",
      "添加投票",
      "editor.focus-mode",
      "editor.formatting-toolbar",
    ]);
  });

  test("drops the view toggles when a host owns the editor's presentation", () => {
    renderMenu(vi.fn(), false, vi.fn(), true);

    fireEvent.click(screen.getByRole("button", { name: "common.add" }));

    const labels = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(labels).not.toContain("editor.focus-mode");
    expect(labels).not.toContain("editor.formatting-toolbar");
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  test("uses separate unrestricted, image, and video file inputs", () => {
    const onInsertImages = vi.fn();
    const onInsertVideos = vi.fn();
    const { container } = renderMenu(onInsertImages, false, onInsertVideos);
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    const attachmentInput = inputs.find((input) => input.accept === "");
    const inlineImageInput = inputs.find((input) => input.accept === "image/*");
    const inlineVideoInput = inputs.find((input) => input.accept === "video/*");

    expect(attachmentInput).toBeDefined();
    expect(attachmentInput).toHaveAttribute("multiple");
    expect(inlineImageInput).toBeDefined();
    expect(inlineImageInput).toHaveAttribute("multiple");
    expect(inlineVideoInput).toBeDefined();
    expect(inlineVideoInput).toHaveAttribute("multiple");

    const image = new File(["image"], "photo.png", { type: "image/png" });
    fireEvent.change(inlineImageInput!, { target: { files: [image] } });
    expect(onInsertImages).toHaveBeenCalledWith([image]);

    const video = new File(["video"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(inlineVideoInput!, { target: { files: [video] } });
    expect(onInsertVideos).toHaveBeenCalledWith([video]);
  });

  test("disables insertion controls while saving", () => {
    const { container } = renderMenu(vi.fn(), true);

    expect(screen.getByRole("button", { name: "common.add" })).toBeDisabled();
    for (const input of container.querySelectorAll('input[type="file"]')) {
      expect(input).toBeDisabled();
    }
  });

  test("exposes a localized save-blocking reason from a focusable wrapper", () => {
    const state = createInitialState();
    state.content = "memo";
    state.ui.pendingInlineImageInsertions = 1;

    render(
      <EditorProvider initialEditorState={state}>
        <EditorToolbar
          onSave={vi.fn()}
          onAudioRecorderClick={vi.fn()}
          viewToggles={viewToggles}
          onInsertImages={vi.fn()}
          onInsertVideos={vi.fn()}
          onInsertEmoji={vi.fn()}
          onInsertAIText={vi.fn()}
        />
      </EditorProvider>,
    );

    expect(screen.getByRole("button", { name: "editor.save" })).toBeDisabled();
    expect(screen.getByLabelText("editor.validation.resolve-image-uploads")).toHaveAttribute("tabindex", "0");
  });

  test("keeps save actions inside the editor on narrow screens", () => {
    const state = createInitialState();
    state.content = "memo";

    const { container } = render(
      <EditorProvider initialEditorState={state}>
        <EditorToolbar
          onSave={vi.fn()}
          onCancel={vi.fn()}
          onAudioRecorderClick={vi.fn()}
          viewToggles={viewToggles}
          onInsertImages={vi.fn()}
          onInsertVideos={vi.fn()}
          onInsertEmoji={vi.fn()}
          onInsertAIText={vi.fn()}
        />
      </EditorProvider>,
    );

    const toolbar = container.querySelector("[data-editor-toolbar]");
    const options = container.querySelector("[data-editor-toolbar-options]");
    const actions = container.querySelector("[data-editor-toolbar-actions]");

    expect(toolbar).toHaveClass("flex-row", "min-w-0", "items-center");
    expect(toolbar).not.toHaveClass("flex-col");
    expect(options).toHaveClass("min-w-0", "flex-1", "overflow-x-auto", "overflow-y-hidden");
    expect(actions).toHaveClass("shrink-0", "justify-end");
    expect(actions).not.toHaveClass("w-full");
  });

  test("lets only an administrator enable direct-link-only publishing", () => {
    authState.currentUser = { name: "users/admin", role: User_Role.ADMIN };
    const state = createInitialState();
    state.content = "hidden memo";

    render(
      <EditorProvider initialEditorState={state}>
        <EditorToolbar
          onSave={vi.fn()}
          onAudioRecorderClick={vi.fn()}
          viewToggles={viewToggles}
          onInsertImages={vi.fn()}
          onInsertVideos={vi.fn()}
          onInsertEmoji={vi.fn()}
          onInsertAIText={vi.fn()}
        />
        <HiddenStateProbe />
      </EditorProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "memo.visibility.public" }));
    fireEvent.click(screen.getByText("memo.hidden.label"));

    expect(screen.getByLabelText("hidden-state")).toHaveTextContent("true");
    expect(screen.getByRole("button", { name: "memo.hidden.label" })).toBeInTheDocument();
  });
});
