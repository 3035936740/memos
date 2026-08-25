import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoMarkdownRendererCore } from "@/components/MemoContent/MemoMarkdownRenderer";
import { normalizeMemoAlignmentBlocks, normalizeMemoTextColor, normalizeMemoTextSize } from "@/utils/memo-rich-text";

vi.mock("@/utils/emoji", () => ({ useEmojiPacks: () => ({ data: [] }) }));
vi.mock("@/utils/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/i18n")>()),
  useTranslate: () => (key: string) => key,
}));

const renderMarkdown = (content: string) =>
  render(<MemoMarkdownRendererCore content={content} resolvedMentionUsernames={new Set()} standalone />);

describe("memo rich text rendering", () => {
  it("renders aligned content from custom Markdown syntax", () => {
    const { container } = renderMarkdown(":::align center\n\nCentered **text**\n\n:::");

    const block = container.querySelector('[data-memo-align="center"]');
    expect(block).toHaveClass("w-full", "text-center");
    expect(block).toHaveTextContent("Centered text");
    expect(block?.querySelector("strong")).toHaveTextContent("text");
  });

  it.each([
    ":::align center\nCentered content\n:::\nFollowing text",
    ":::align center\n\nCentered content\n\n:::\nFollowing text",
    ":::align center\nCentered content\n:::\n\nFollowing text",
  ])("does not require blank lines around alignment markers", (content) => {
    const { container } = renderMarkdown(content);

    const block = container.querySelector('[data-memo-align="center"]');
    expect(block).toHaveTextContent("Centered content");
    expect(block).not.toHaveTextContent("Following text");
    expect(container).toHaveTextContent("Following text");
  });

  it("keeps a video-style link inside an alignment block without blank lines", () => {
    const { container } = renderMarkdown(":::align center\n[video:夏美的一步](/file/attachments/example)\n:::\n只能传10MiB以内的视频哦");

    const block = container.querySelector('[data-memo-align="center"]');
    expect(block?.querySelector("a")).toHaveTextContent("video:夏美的一步");
    expect(block).not.toHaveTextContent("只能传10MiB以内的视频哦");
  });

  it("does not interpret alignment markers inside fenced code", () => {
    const source = "```text\n:::align center\nliteral\n:::\n```";
    expect(normalizeMemoAlignmentBlocks(source)).toBe(source);
  });

  it("aligns block markdown images instead of only their surrounding text", () => {
    const { container, rerender } = renderMarkdown(":::align center\n\n![centered](/center.png)\n\n:::");

    let block = container.querySelector('[data-memo-align="center"]');
    expect(block).toHaveClass("text-center");
    expect(block?.querySelector('img[data-memo-image=""]')).toBeInTheDocument();

    rerender(
      <MemoMarkdownRendererCore
        content={":::align right\n\n![right](/right.png)\n\n:::"}
        resolvedMentionUsernames={new Set()}
        standalone
      />,
    );
    block = container.querySelector('[data-memo-align="right"]');
    expect(block).toHaveClass("text-right");
    expect(block?.querySelector('img[data-memo-image=""]')).toBeInTheDocument();
  });

  it("applies only validated RGBA text colors", () => {
    renderMarkdown("[color=rgba(12, 34, 56, 0.7)]**safe**[/color] [color=red;position:fixed]unsafe[/color]");

    expect(screen.getByText("safe")).toHaveStyle({ color: "rgba(12, 34, 56, 0.7)" });
    expect(screen.getByText(/\[color=red;position:fixed\]unsafe\[\/color\]/)).not.toHaveAttribute("style");
  });

  it("applies only bounded whole-pixel font sizes while preserving nested Markdown", () => {
    const { container } = renderMarkdown("[size=96px]**large**[/size] [size=999px]unsafe[/size]");

    const sized = container.querySelector('[data-memo-size="96px"]');
    expect(sized).toHaveStyle({ fontSize: "96px", lineHeight: "1.2", overflowWrap: "anywhere" });
    expect(sized?.querySelector("strong")).toHaveTextContent("large");
    expect(screen.getByText(/\[size=999px\]unsafe\[\/size\]/)).not.toHaveAttribute("style");
  });

  it("reveals spoiler text by click while retaining inline flow", () => {
    renderMarkdown("before ||secret|| after");

    const spoiler = screen.getByRole("button", { name: "memo.spoiler.reveal" });
    expect(spoiler.tagName).toBe("SPAN");
    expect(spoiler).toHaveAttribute("aria-expanded", "false");
    expect(spoiler).toHaveClass("inline", "text-transparent");

    fireEvent.click(spoiler);
    expect(spoiler).toHaveAttribute("aria-expanded", "true");
    expect(spoiler).not.toHaveClass("text-transparent");
  });

  it("renders the removed HTML-backed beta syntax as literal source", () => {
    const legacy = [
      '<div data-memo-align="center">',
      "legacy alignment",
      "</div>",
      "",
      '<span data-memo-color="rgba(12, 34, 56, 0.7)">legacy color</span>',
      "",
      '<span data-memo-size="28px">legacy size</span>',
      "",
      '<span data-memo-spoiler="true">legacy spoiler</span>',
    ].join("\n");
    const { container } = renderMarkdown(legacy);

    expect(container.textContent).toContain('<div data-memo-align="center">');
    expect(container.textContent).toContain("legacy alignment");
    expect(container.textContent).toContain("</div>");
    expect(container.textContent).toContain('<span data-memo-color="rgba(12, 34, 56, 0.7)">legacy color</span>');
    expect(container.textContent).toContain('<span data-memo-size="28px">legacy size</span>');
    expect(container.textContent).toContain('<span data-memo-spoiler="true">legacy spoiler</span>');
    expect(container.querySelector("[data-memo-align]")).toBeNull();
    expect(container.querySelector("[data-memo-color]")).toBeNull();
    expect(container.querySelector("[data-memo-size]")).toBeNull();
    expect(container.querySelector("[data-memo-spoiler]")).toBeNull();
  });
});

describe("RGBA normalization", () => {
  it("normalizes valid values and rejects CSS injection or invalid channels", () => {
    expect(normalizeMemoTextColor("255, 80, 40, 0.5")).toBe("rgba(255, 80, 40, 0.5)");
    expect(normalizeMemoTextColor("rgb(1, 2, 3)")).toBe("rgba(1, 2, 3, 1)");
    expect(normalizeMemoTextColor("rgba(999, 2, 3, 1)")).toBeUndefined();
    expect(normalizeMemoTextColor("red; position: fixed")).toBeUndefined();
  });

  it("normalizes bounded whole-pixel font sizes", () => {
    expect(normalizeMemoTextSize("28")).toBe("28px");
    expect(normalizeMemoTextSize("96px")).toBe("96px");
    expect(normalizeMemoTextSize("7px")).toBeUndefined();
    expect(normalizeMemoTextSize("97px")).toBeUndefined();
    expect(normalizeMemoTextSize("12px; position: fixed")).toBeUndefined();
  });
});
