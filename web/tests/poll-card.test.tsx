import { create } from "@bufbuild/protobuf";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import PollCard from "@/components/MemoView/components/PollCard";
import i18n from "@/i18n";
import { AttachmentSchema } from "@/types/proto/api/v1/attachment_service_pb";
import { MemoSchema, type Poll, PollSchema, PollVoterSchema, VoterType } from "@/types/proto/api/v1/memo_service_pb";

const mocks = vi.hoisted(() => ({ currentUser: undefined as { name: string } | undefined, voteMemo: vi.fn(), getMemoPoll: vi.fn() }));
vi.mock("@/hooks/useCurrentUser", () => ({ default: () => mocks.currentUser }));
vi.mock("@/connect", () => ({ pollServiceClient: mocks }));
vi.mock("@/hooks/useMediaQuery", () => ({ default: () => false }));

const renderPoll = (voterType = VoterType.AUTHENTICATED, ended = false, fields: Partial<Omit<Poll, "$typeName" | "$unknown">> = {}) => {
  const poll = create(PollSchema, {
    question: "Choose",
    voterType,
    options: [
      { id: "a", text: "Option A" },
      { id: "b", text: "Option B" },
    ],
    endTime: ended ? { seconds: 1n } : undefined,
    ...fields,
  });
  let serverPoll = poll;
  mocks.getMemoPoll.mockImplementation(async () => serverPoll);
  mocks.voteMemo.mockImplementation(async () => {
    serverPoll = create(PollSchema, { ...poll, resultsHidden: false, selectedOptionIds: ["a"] });
    return serverPoll;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/memos/example?from=explore#poll"]}>
        <PollCard memo={create(MemoSchema, { name: "memos/example", poll })} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
};

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("poll participation prompts", () => {
  beforeEach(() => {
    mocks.currentUser = undefined;
    mocks.voteMemo.mockReset();
    mocks.getMemoPoll.mockReset();
    localStorage.clear();
  });

  it("explains the login requirement before voting and links back to the current page", () => {
    renderPoll();
    expect(screen.getByText("Only signed-in users can participate in this poll. Please sign in first.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Option A/ })).toBeDisabled();
    const login = screen.getByRole("link", { name: "Sign in to vote" });
    const url = new URL(login.getAttribute("href") ?? "", "https://memos.test");
    expect(url.pathname).toBe("/auth");
    expect(url.searchParams.get("redirect")).toBe("/memos/example?from=explore#poll");
    expect(screen.queryByRole("button", { name: "Vote" })).not.toBeInTheDocument();
    expect(mocks.voteMemo).not.toHaveBeenCalled();
  });

  it("still lets guests vote when the poll allows anyone", async () => {
    renderPoll(VoterType.ANYONE);
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Vote" }));
    await screen.findByText("Voted");
    expect(mocks.voteMemo).toHaveBeenCalledWith(expect.objectContaining({ optionIds: ["a"], deviceId: expect.any(String) }));
    expect(screen.queryByText("Sign in to vote")).not.toBeInTheDocument();
  });

  it("lets signed-in users vote in restricted polls", async () => {
    mocks.currentUser = { name: "users/alice" };
    renderPoll();
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Vote" }));
    await waitFor(() => expect(mocks.voteMemo).toHaveBeenCalledWith(expect.objectContaining({ optionIds: ["a"], deviceId: "" })));
    await screen.findByText("Voted");
  });

  it("does not invite guests to log in to vote after a poll ends", () => {
    renderPoll(VoterType.AUTHENTICATED, true);
    expect(screen.getByText("Ended")).toBeInTheDocument();
    expect(screen.queryByText("Sign in to vote")).not.toBeInTheDocument();
  });

  it("hides counts and percentages until the viewer votes", async () => {
    mocks.currentUser = { name: "users/alice" };
    renderPoll(VoterType.AUTHENTICATED, false, { hideResultsUntilVoted: true, resultsHidden: true });
    await waitFor(() => expect(mocks.getMemoPoll).toHaveBeenCalled());
    expect(screen.getByText("Vote to see counts and percentages")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.queryByText("0 votes")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Vote" }));
    await screen.findByText("Voted");
    expect(screen.getAllByText("0%")).toHaveLength(2);
  });

  it("shows participant avatars with hover names and click details", async () => {
    const { client } = renderPoll(VoterType.AUTHENTICATED, false, {
      votersVisible: true,
      voters: [create(PollVoterSchema, { name: "users/alice", username: "alice", displayName: "Alice", avatarUrl: "/alice.png" })],
    });
    const avatar = screen.getByRole("button", { name: "Alice (@alice)" });
    expect(avatar).toHaveAttribute("title", "Alice (@alice)");
    expect(avatar.querySelector("img")).toHaveAttribute("src", "/alice.png");
    fireEvent.click(avatar);
    expect(await screen.findByText("@alice")).toBeInTheDocument();
    mocks.getMemoPoll.mockResolvedValue(create(PollSchema, { question: "Choose", voterType: VoterType.AUTHENTICATED }));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["memos", "poll"] });
    });
    expect(screen.queryByRole("button", { name: "Alice (@alice)" })).not.toBeInTheDocument();
    expect(screen.queryByText("@alice")).not.toBeInTheDocument();
  });

  it.each([false, true])("shows sampled users' choices only when enabled (%s)", async (showVoterChoices) => {
    renderPoll(VoterType.AUTHENTICATED, false, {
      showVoterChoices,
      votersVisible: true,
      hasMoreVoters: true,
      voters: Array.from({ length: 10 }, (_, i) =>
        create(PollVoterSchema, {
          name: `users/person${i}`,
          username: `person${i}`,
          selectedOptionIds: ["a", "b"],
        }),
      ),
    });
    expect(screen.getAllByRole("button", { name: /@person/ })).toHaveLength(10);
    expect(screen.getByLabelText("More voters; showing only 10 at random")).toHaveTextContent("…");
    fireEvent.click(screen.getByRole("button", { name: "person0 (@person0)" }));
    await screen.findByText("@person0");
    if (showVoterChoices) {
      expect(screen.getByText("Selected options")).toBeInTheDocument();
      expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Option A", "Option B"]);
    } else {
      expect(screen.queryByText("Selected options")).not.toBeInTheDocument();
    }
  });

  it.each([false, true])("previews cover and option images without changing the ballot (already voted: %s)", async (voted) => {
    mocks.currentUser = { name: "users/alice" };
    renderPoll(VoterType.AUTHENTICATED, false, {
      image: create(AttachmentSchema, { name: "attachments/cover", filename: "cover.png", type: "image/png" }),
      options: [
        {
          $typeName: "memos.api.v1.PollOption",
          id: "a",
          text: "Option A",
          voteCount: 0,
          image: create(AttachmentSchema, { name: "attachments/option", filename: "option.png", type: "image/png" }),
        },
        { $typeName: "memos.api.v1.PollOption", id: "b", text: "Option B", voteCount: 0 },
      ],
      selectedOptionIds: voted ? ["b"] : [],
    });
    fireEvent.click(screen.getByRole("button", { name: "View poll image" }));
    expect(await screen.findByAltText("Preview image 1 of 2")).toHaveAttribute("src", expect.stringContaining("cover"));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "View image for option: Option A" }));
    expect(await screen.findByAltText("Preview image 2 of 2")).toHaveAttribute("src", expect.stringContaining("option"));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Option A" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Option B" })).toHaveAttribute("aria-pressed", String(voted));
    expect(mocks.voteMemo).not.toHaveBeenCalled();
    if (!voted) {
      fireEvent.click(screen.getByRole("button", { name: "Option A" }));
      expect(screen.getByRole("button", { name: "Option A" })).toHaveAttribute("aria-pressed", "true");
    }
  });
});
