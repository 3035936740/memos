import { create } from "@bufbuild/protobuf";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoMarkdownRendererCore } from "@/components/MemoContent/MemoMarkdownRenderer";
import { AttachmentSchema } from "@/types/proto/api/v1/attachment_service_pb";

vi.mock("@/utils/emoji", () => ({ useEmojiPacks: () => ({ data: [] }) }));

describe("managed video Markdown", () => {
  it("renders an inserted video as a playable inline player", () => {
    const attachment = create(AttachmentSchema, {
      name: "attachments/video-one",
      filename: "intro.mp4",
      type: "video/mp4",
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoMarkdownRendererCore
          content="before\n\n[video:intro](/file/attachments/video-one)\n\nafter"
          attachments={[attachment]}
          resolvedMentionUsernames={new Set()}
        />
      </QueryClientProvider>,
    );

    const video = screen.getByLabelText("intro.mp4");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", `${window.location.origin}/file/attachments/video-one/intro.mp4`);
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("preload", "metadata");
  });

  it("keeps an ordinary attachment link as a link", () => {
    const attachment = create(AttachmentSchema, {
      name: "attachments/video-one",
      filename: "intro.mp4",
      type: "video/mp4",
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoMarkdownRendererCore
          content="[download](/file/attachments/video-one)"
          attachments={[attachment]}
          resolvedMentionUsernames={new Set()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("link", { name: "download" })).toBeInTheDocument();
    expect(screen.queryByLabelText("intro.mp4")).not.toBeInTheDocument();
  });
});
