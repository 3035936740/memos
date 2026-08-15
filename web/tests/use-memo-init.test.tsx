import { create } from "@bufbuild/protobuf";
import { render, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMemoInit } from "@/components/MemoEditor/hooks/useMemoInit";
import { cacheService } from "@/components/MemoEditor/services/cacheService";
import { EditorProvider, useEditorContext } from "@/components/MemoEditor/state";
import type { EditorController } from "@/components/MemoEditor/types/editorController";
import { AttachmentSchema } from "@/types/proto/api/v1/attachment_service_pb";

const editorRef = { current: null } as RefObject<EditorController | null>;
let getEditorState: ReturnType<typeof useEditorContext>["getState"];

function Probe({ initialContent, autoFocus }: { initialContent?: string; autoFocus?: boolean } = {}) {
  getEditorState = useEditorContext().getState;
  useMemoInit({
    editorRef,
    username: "users/steven",
    cacheKey: "restored-draft",
    initialContent,
    autoFocus,
  });
  return null;
}

describe("useMemoInit", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
    });
    editorRef.current = null;
    cacheService.clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("restores uploaded attachment bindings with a new memo draft", async () => {
    const attachment = create(AttachmentSchema, {
      name: "attachments/image-one",
      filename: "image.png",
      type: "image/png",
    });
    cacheService.saveNow(cacheService.key("users/steven", "restored-draft"), "![image](/file/attachments/image-one)", [attachment]);

    render(
      <EditorProvider>
        <Probe />
      </EditorProvider>,
    );

    await waitFor(() => {
      expect(getEditorState().content).toBe("![image](/file/attachments/image-one)");
      expect(getEditorState().metadata.attachments).toEqual([attachment]);
    });
  });

  it("places the cursor after prefilled reply text before focusing", async () => {
    vi.useFakeTimers();
    const setCursor = vi.fn();
    const focus = vi.fn();
    editorRef.current = { setCursor, focus } as unknown as EditorController;

    render(
      <EditorProvider>
        <Probe initialContent="@bing " autoFocus />
      </EditorProvider>,
    );

    await vi.advanceTimersByTimeAsync(100);

    expect(setCursor).toHaveBeenCalledWith(6);
    expect(focus).toHaveBeenCalledOnce();
  });
});
