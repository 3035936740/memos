import { create } from "@bufbuild/protobuf";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { EditorMetadata } from "@/components/MemoEditor/components/EditorMetadata";
import PollDialog from "@/components/MemoEditor/components/PollDialog";
import { memoService } from "@/components/MemoEditor/services/memoService";
import { createInitialState, EditorProvider, useEditorContext } from "@/components/MemoEditor/state";
import type { LocalFile } from "@/components/MemoEditor/types/attachment";
import { type Attachment, AttachmentSchema } from "@/types/proto/api/v1/attachment_service_pb";
import { MemoSchema, PollSchema, PollVoterSchema, VoterType } from "@/types/proto/api/v1/memo_service_pb";

const api = vi.hoisted(() => ({ getMemo: vi.fn(), updateMemo: vi.fn(), uploadFiles: vi.fn() }));
vi.mock("@/connect", () => ({ memoServiceClient: api }));
vi.mock("@/components/MemoEditor/services/uploadService", () => ({ uploadService: { uploadFiles: api.uploadFiles } }));
vi.mock("@/components/MemoMetadata", () => ({
  AttachmentListEditor: ({
    attachments,
    localFiles,
    onAttachmentsChange,
    onLocalFilesChange,
  }: {
    attachments: Attachment[];
    localFiles: LocalFile[];
    onAttachmentsChange: (next: Attachment[]) => void;
    onLocalFilesChange: (next: LocalFile[]) => void;
  }) => (
    <div data-testid="attachments">
      {attachments.map((item) => (
        <span key={item.name}>{item.filename}</span>
      ))}
      {localFiles.map((item) => (
        <span key={item.previewUrl}>{item.file.name}</span>
      ))}
      <button type="button" onClick={() => onAttachmentsChange([])}>
        Remove ordinary attachments
      </button>
      <button type="button" onClick={() => onLocalFilesChange([])}>
        Remove ordinary files
      </button>
    </div>
  ),
  RelationListEditor: () => null,
  LocationDisplayEditor: () => null,
}));

const image = (id: string) => create(AttachmentSchema, { name: `attachments/${id}`, filename: `${id}.png`, type: "image/png" });
const cover = image("cover");
const option = image("option");
const ordinary = image("ordinary");
const memo = create(MemoSchema, {
  name: "memos/poll",
  content: "Choose",
  attachments: [ordinary, cover, option],
  poll: create(PollSchema, {
    question: "Choose",
    image: cover,
    options: [
      { id: "a", text: "A", image: option },
      { id: "b", text: "B" },
    ],
  }),
});

function Harness({ save }: { save: (state: ReturnType<typeof createInitialState>) => void }) {
  const [open, setOpen] = useState(false);
  const { getState } = useEditorContext();
  return (
    <>
      <EditorMetadata uploadingLocalFileURLs={new Set()} onInsertAttachments={vi.fn()} onInsertLocalFiles={vi.fn()} />
      <button type="button" onClick={() => setOpen(true)}>
        Edit poll
      </button>
      <button type="button" onClick={() => save(getState())}>
        Publish
      </button>
      <PollDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

describe("poll editor attachments", () => {
  it("saves visibility settings independently and retains their values when reopened", () => {
    const state = { ...createInitialState(), ...memoService.fromMemo(memo) };
    const save = vi.fn();
    render(
      <EditorProvider initialEditorState={state}>
        <Harness save={save} />
      </EditorProvider>,
    );
    fireEvent.click(screen.getByText("Edit poll"));
    const countSwitch = screen.getByRole("switch", { name: "投票后才显示票数" });
    expect(countSwitch).not.toBeChecked();
    fireEvent.click(countSwitch);
    fireEvent.click(screen.getByRole("switch", { name: "投票后显示投票用户" }));
    expect(screen.getByRole("switch", { name: "显示用户所选选项" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("switch", { name: "显示用户所选选项" }));
    fireEvent.click(screen.getByText("保存投票"));
    fireEvent.click(screen.getByText("Publish"));
    expect(save.mock.calls[0][0].content).toBe("Choose\n\n[[vote]]");
    expect(save.mock.calls[0][0].metadata.poll).toEqual(
      expect.objectContaining({
        hideResultsUntilVoted: true,
        showVotersBeforeVoting: false,
        showVotersAfterVoting: true,
        showVoterChoices: true,
      }),
    );
    fireEvent.click(screen.getByText("Edit poll"));
    expect(screen.getByRole("switch", { name: "投票后才显示票数" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "投票后显示投票用户" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "显示用户所选选项" })).toBeChecked();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: String(VoterType.ANYONE) } });
    expect(screen.queryByRole("switch", { name: "投票后显示投票用户" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("保存投票"));
    fireEvent.click(screen.getByText("Publish"));
    expect(save.mock.calls[1][0].metadata.poll.showVotersAfterVoting).toBe(false);
    expect(save.mock.calls[1][0].metadata.poll.showVoterChoices).toBe(false);
    expect(save.mock.calls[1][0].content).toBe("Choose\n\n[[vote]]");
  });

  it("does not send a poll edit just because the server returned newer results or participants", async () => {
    const state = { ...createInitialState(), ...memoService.fromMemo(memo) };
    const latest = create(MemoSchema, {
      ...memo,
      poll: create(PollSchema, {
        ...(memo.poll ?? create(PollSchema)),
        totalVotes: 1,
        votersVisible: true,
        hasMoreVoters: true,
        voters: [create(PollVoterSchema, { name: "users/alice", username: "alice" })],
      }),
    });
    api.getMemo.mockResolvedValue(latest);
    api.uploadFiles.mockResolvedValue([]);
    api.updateMemo.mockClear();
    api.updateMemo.mockResolvedValue(latest);
    await memoService.save(state, { memoName: memo.name });
    for (const [request] of api.updateMemo.mock.calls) {
      expect(request.updateMask.paths).not.toContain("poll");
    }
  });
  it("hides poll images, preserves them while editing ordinary attachments, and restores them on deletion", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const state = { ...createInitialState(), ...memoService.fromMemo(memo) };
    state.localFiles = [
      { file: new File(["image"], "local-cover.png"), previewUrl: "blob:cover" },
      { file: new File(["image"], "local-option.png"), previewUrl: "blob:option" },
      { file: new File(["image"], "local-ordinary.png"), previewUrl: "blob:ordinary" },
    ];
    state.metadata.pollOptionImageLocalFileURLs = { b: "blob:option" };
    state.metadata.pollImageLocalFileURL = "blob:cover";
    const save = vi.fn();
    render(
      <EditorProvider initialEditorState={state}>
        <Harness save={save} />
      </EditorProvider>,
    );
    expect(screen.getByTestId("attachments")).toHaveTextContent("ordinary.png");
    expect(screen.getByTestId("attachments")).not.toHaveTextContent("cover.png");
    expect(screen.getByTestId("attachments")).not.toHaveTextContent("option.png");
    expect(screen.getByTestId("attachments")).not.toHaveTextContent("local-cover.png");
    fireEvent.click(screen.getByText("Remove ordinary attachments"));
    fireEvent.click(screen.getByText("Remove ordinary files"));
    fireEvent.click(screen.getByText("Edit poll"));
    fireEvent.click(screen.getByText("删除投票"));
    expect(screen.getByTestId("attachments")).toHaveTextContent("cover.png");
    expect(screen.getByTestId("attachments")).toHaveTextContent("option.png");
    expect(screen.getByTestId("attachments")).toHaveTextContent("local-option.png");
    expect(screen.getByTestId("attachments")).toHaveTextContent("local-cover.png");
    expect(revoke).not.toHaveBeenCalledWith("blob:cover");
    expect(revoke).not.toHaveBeenCalledWith("blob:option");
    fireEvent.click(screen.getByText("Publish"));
    const next = save.mock.calls[0][0];
    expect(next.metadata.poll).toBeUndefined();
    expect(next.content).not.toContain("[[vote]]");
    const uploaded = image("uploaded-option");
    const uploadedCover = image("uploaded-cover");
    api.uploadFiles.mockResolvedValue([uploadedCover, uploaded]);
    api.getMemo.mockResolvedValue(memo);
    api.updateMemo.mockResolvedValue(memo);
    await memoService.save(next, { memoName: memo.name });
    const request = api.updateMemo.mock.calls[0][0];
    expect(request.updateMask.paths).toContain("poll");
    expect(request.memo.poll).toBeUndefined();
    expect(request.memo.attachments.map((item: Attachment) => item.name)).toEqual([
      cover.name,
      option.name,
      uploadedCover.name,
      uploaded.name,
    ]);
  });
});
