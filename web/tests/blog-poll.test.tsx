import { create } from "@bufbuild/protobuf";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Blog2MemoView from "@/components/Blog2MemoView";
import BlogMemoView from "@/components/BlogMemoView";
import { AttachmentSchema } from "@/types/proto/api/v1/attachment_service_pb";
import { MemoSchema, PollSchema, VoterType } from "@/types/proto/api/v1/memo_service_pb";

const api = vi.hoisted(() => ({ getMemoPoll: vi.fn(), voteMemo: vi.fn() }));
vi.mock("@/connect", () => ({ pollServiceClient: api }));
vi.mock("@/hooks/useCurrentUser", () => ({ default: () => ({ name: "users/alice", role: 2 }) }));
vi.mock("@/components/MemoContent/MentionResolutionContext", () => ({ useResolvedUser: () => undefined }));

function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

describe.each([
  ["blog", BlogMemoView],
  ["blog2", Blog2MemoView],
] as const)("%s list poll", (_name, Card) => {
  it("shows and submits a poll directly in the list without opening the article", async () => {
    const image = create(AttachmentSchema, { name: "attachments/poll-cover", filename: "cover.png", type: "image/png" });
    const poll = create(PollSchema, {
      question: "What do you prefer?",
      voterType: VoterType.AUTHENTICATED,
      image,
      options: [
        { id: "a", text: "First choice" },
        { id: "b", text: "Second choice" },
      ],
    });
    api.getMemoPoll.mockResolvedValue(poll);
    api.voteMemo.mockReset().mockResolvedValue(create(PollSchema, { ...poll, selectedOptionIds: ["b"] }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/explore"]}>
          <Card memo={create(MemoSchema, { name: "memos/list-poll", content: "List poll", attachments: [image], poll })} />
          <CurrentPath />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("region", { name: "Poll" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "List poll" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "List poll" })).toHaveAttribute("href", "/memos/list-poll");
    await waitFor(() => expect(api.getMemoPoll).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Second choice" }));
    fireEvent.click(screen.getByRole("button", { name: "投票" }));
    await screen.findByText("已投票");
    expect(api.voteMemo).toHaveBeenCalledWith(expect.objectContaining({ name: "memos/list-poll", optionIds: ["b"] }));
    expect(screen.getByTestId("path")).toHaveTextContent("/explore");
  });
});
