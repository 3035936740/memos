import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type InitialEntry, MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MemoCommentSection from "@/components/MemoCommentSection";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

const auth = vi.hoisted(() => ({ currentUser: undefined as { name: string } | undefined }));
const navigateTo = vi.hoisted(() => vi.fn());
const repliesByMemo = vi.hoisted(() => new Map<string, Memo[]>());

vi.mock("@/hooks/useCurrentUser", () => ({ default: () => auth.currentUser }));
vi.mock("@/hooks/useNavigateTo", () => ({ default: () => navigateTo }));
vi.mock("@/hooks/useMemoQueries", () => ({
  useInfiniteMemoComments: (name: string) => ({
    data: repliesByMemo.get(name) ?? [],
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));
vi.mock("@/components/MemoView", () => ({
  default: ({ memo: comment }: { memo: Memo }) => <div data-testid={`comment-${comment.name}`} />,
}));
vi.mock("@/components/MemoEditor/loader", () => ({
  loadMemoEditor: async () => ({
    default: ({ parentMemoName }: { parentMemoName?: string }) => <div data-testid="comment-editor" data-parent={parentMemoName} />,
  }),
}));
vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string, params?: Record<string, unknown>) => {
    const labels: Record<string, string> = {
      "memo.comment.self": "Comments",
      "memo.comment.guest-description": "Please sign in to comment.",
      "memo.comment.guest-prefix": "Please",
      "memo.comment.guest-suffix": "to comment",
      "memo.comment.floor": "Floor {{floor}}",
      "memo.comment.reply-floor": "Floor {{floor}} · Reply {{reply}}",
      "memo.comment.sign-in-to-comment": "Sign in to comment",
      "memo.comment.sort-ascending": "Oldest",
      "memo.comment.sort-descending": "Newest",
      "memo.comment.sort-order": "Comment order",
      "memo.comment.write-a-comment": "Write a comment",
    };
    return (labels[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(params?.[name] ?? ""));
  },
}));

const memo = { name: "memos/abc", content: "Article" } as Memo;

const renderSection = (comments: Memo[] = [], entry: InitialEntry = "/memos/abc") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <MemoCommentSection memo={memo} comments={comments} />
    </MemoryRouter>,
  );

describe("MemoCommentSection", () => {
  beforeEach(() => {
    auth.currentUser = undefined;
    navigateTo.mockClear();
    repliesByMemo.clear();
  });

  it("keeps the editor collapsed until an authenticated user asks to comment", async () => {
    auth.currentUser = { name: "users/1" };
    renderSection();

    expect(screen.queryByTestId("comment-editor")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Write a comment" }));

    await waitFor(() => expect(screen.getByTestId("comment-editor")).toBeInTheDocument());
  });

  it("shows the comment action to visitors and sends them to sign in", () => {
    renderSection();

    expect(screen.getByText("Please")).toBeInTheDocument();
    expect(screen.getByText("to comment")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to comment" }));

    expect(navigateTo).toHaveBeenCalledWith("/auth?redirect=%2Fmemos%2Fabc");
    expect(screen.queryByTestId("comment-editor")).not.toBeInTheDocument();
  });

  it("renders a reply directly under its parent comment", () => {
    const secondFloor = { name: "memos/comment-2", content: "Second floor" } as Memo;
    const firstFloor = { name: "memos/comment-1", content: "First floor" } as Memo;
    const reply = { name: "memos/reply-2", content: "Reply", parent: secondFloor.name } as Memo;
    repliesByMemo.set(secondFloor.name, [reply]);

    renderSection([secondFloor, firstFloor]);

    const secondFloorView = screen.getByTestId(`comment-${secondFloor.name}`);
    const replyView = screen.getByTestId(`comment-${reply.name}`);
    const firstFloorView = screen.getByTestId(`comment-${firstFloor.name}`);
    expect(secondFloorView.compareDocumentPosition(replyView) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(replyView.compareDocumentPosition(firstFloorView) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(replyView.closest(".border-l")).not.toBeNull();
  });

  it("flattens historical nested replies into one visual reply level", () => {
    const root = { name: "memos/comment-root", content: "Root" } as Memo;
    const replyA = { name: "memos/reply-a", content: "A", parent: root.name } as Memo;
    const replyB = { name: "memos/reply-b", content: "B", parent: replyA.name } as Memo;
    const replyC = { name: "memos/reply-c", content: "C", parent: replyB.name } as Memo;
    repliesByMemo.set(root.name, [replyA]);
    repliesByMemo.set(replyA.name, [replyB]);
    repliesByMemo.set(replyB.name, [replyC]);

    const { container } = renderSection([root]);

    const replyRail = screen.getByTestId(`comment-${replyA.name}`).closest(".border-l");
    expect(replyRail).not.toBeNull();
    expect(screen.getByTestId(`comment-${replyB.name}`).closest(".border-l")).toBe(replyRail);
    expect(screen.getByTestId(`comment-${replyC.name}`).closest(".border-l")).toBe(replyRail);
    expect(screen.getByTestId(`comment-floor-${root.name}`)).toHaveTextContent("Floor 1");
    expect(screen.getByTestId(`comment-floor-${replyA.name}`)).toHaveTextContent("Floor 1 · Reply 1");
    expect(screen.getByTestId(`comment-floor-${replyB.name}`)).toHaveTextContent("Floor 1 · Reply 1.1");
    expect(screen.getByTestId(`comment-floor-${replyC.name}`)).toHaveTextContent("Floor 1 · Reply 1.1.1");
    expect(container.querySelectorAll(".border-l")).toHaveLength(1);
  });

  it("numbers floors from oldest to newest and requests descending order", () => {
    const first = { name: "memos/comment-1", content: "First" } as Memo;
    const second = { name: "memos/comment-2", content: "Second" } as Memo;
    const onSortOrderChange = vi.fn();
    const { rerender } = render(
      <MemoryRouter initialEntries={["/memos/abc"]}>
        <MemoCommentSection memo={memo} comments={[first, second]} sortOrder="asc" onSortOrderChange={onSortOrderChange} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId(`comment-floor-${first.name}`)).toHaveTextContent("Floor 1");
    expect(screen.getByTestId(`comment-floor-${second.name}`)).toHaveTextContent("Floor 2");
    fireEvent.click(screen.getByRole("button", { name: "Newest" }));
    expect(onSortOrderChange).toHaveBeenCalledWith("desc");

    rerender(
      <MemoryRouter initialEntries={["/memos/abc"]}>
        <MemoCommentSection memo={memo} comments={[second, first]} sortOrder="desc" onSortOrderChange={onSortOrderChange} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId(`comment-floor-${second.name}`)).toHaveTextContent("Floor 2");
    expect(screen.getByTestId(`comment-floor-${first.name}`)).toHaveTextContent("Floor 1");
  });

  it("opens a reply editor below the target and creates a real nested comment", async () => {
    auth.currentUser = { name: "users/1" };
    const target = { name: "memos/comment-2", content: "Second floor" } as Memo;
    renderSection([target], {
      pathname: "/memos/abc",
      state: {
        quickReplyMemo: memo.name,
        replyToMemo: target.name,
        quickReplyContent: "@bing ",
        quickReplyRequest: 1,
      },
    });

    const editor = await screen.findByTestId("comment-editor");
    const targetView = screen.getByTestId(`comment-${target.name}`);
    expect(editor).toHaveAttribute("data-parent", target.name);
    expect(targetView.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
