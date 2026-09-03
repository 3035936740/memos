import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoMarkdownRendererCore } from "@/components/MemoContent/MemoMarkdownRenderer";
import { ensureMemoPollMarker, findMemoPollMarkers, prepareMemoPollContent, removeMemoPollMarkers } from "@/utils/memo-poll";

vi.mock("@/utils/emoji", () => ({ useEmojiPacks: () => ({ data: [] }) }));
vi.mock("@/utils/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/i18n")>()),
  useTranslate: () => (key: string) => key,
}));

describe("poll Markdown markers", () => {
  it.each([
    "```text\n[[vote]]\n```",
    "~~~\n[[vote]]\n~~~",
    "    [[vote]]",
    "`[[vote]]`",
    "`before\n[[vote]]\nafter`",
    "\\[[vote]]",
    "> [[vote]]",
    "- [[vote]]",
    "<div>\n[[vote]]\n</div>",
    "before [[vote]] after",
  ])("leaves literal examples unchanged: %s", (content) => {
    expect(findMemoPollMarkers(content)).toHaveLength(0);
    expect(prepareMemoPollContent(content).content).toBe(content);
    expect(removeMemoPollMarkers(content)).toBe(content);
  });

  it("adds one marker and retains an existing placement", () => {
    expect(ensureMemoPollMarker("")).toBe("[[vote]]");
    expect(ensureMemoPollMarker("Introduction")).toBe("Introduction\n\n[[vote]]");
    const source = "Introduction\n[[vote]]\nConclusion";
    expect(ensureMemoPollMarker(source)).toBe(source);
    expect(removeMemoPollMarkers(source)).toBe("Introduction\n\nConclusion");
    expect(ensureMemoPollMarker("`[[vote]]`")).toBe("`[[vote]]`\n\n[[vote]]");
  });

  it("renders one interactive poll at its marker while retaining references across it", () => {
    const onMouseUp = vi.fn();
    const onDoubleClick = vi.fn();
    const vote = vi.fn();
    render(
      <div onMouseUp={onMouseUp} onDoubleClick={onDoubleClick}>
        <MemoMarkdownRendererCore
          content={"Before [reference][target]\n[[vote]]\nAfter\n\n[[vote]]\n\n[target]: https://example.com"}
          resolvedMentionUsernames={new Set()}
          standalone
          pollContent={
            <button type="button" onClick={vote}>
              Cast vote
            </button>
          }
        />
      </div>,
    );
    const poll = screen.getByRole("button", { name: "Cast vote" });
    expect(screen.getByRole("link", { name: "reference" })).toHaveAttribute("href", "https://example.com");
    expect(screen.getByText(/Before/).compareDocumentPosition(poll) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(poll.compareDocumentPosition(screen.getByText("After")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("[[vote]]")).not.toBeInTheDocument();
    fireEvent.mouseUp(poll);
    fireEvent.doubleClick(poll);
    fireEvent.click(poll);
    expect(vote).toHaveBeenCalledOnce();
    expect(onMouseUp).not.toHaveBeenCalled();
    expect(onDoubleClick).not.toHaveBeenCalled();
  });
});
