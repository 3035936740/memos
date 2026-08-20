import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BlockedWordsEditor from "@/components/Settings/BlockedWordsEditor";

const { getBlockedWordsSetting, replaceBlockedWords, importBlockedWordsFromURL, clearBlockedWords } = vi.hoisted(() => ({
  getBlockedWordsSetting: vi.fn(),
  replaceBlockedWords: vi.fn(),
  importBlockedWordsFromURL: vi.fn(),
  clearBlockedWords: vi.fn(),
}));

vi.mock("@/utils/content-moderation", () => ({
  getBlockedWordsSetting,
  replaceBlockedWords,
  importBlockedWordsFromURL,
  clearBlockedWords,
}));

describe("BlockedWordsEditor", () => {
  beforeEach(() => {
    getBlockedWordsSetting.mockReset();
    replaceBlockedWords.mockReset();
    importBlockedWordsFromURL.mockReset();
    clearBlockedWords.mockReset();
    getBlockedWordsSetting.mockResolvedValue({
      words: ["旧词"],
      count: 1,
      sourceType: "manual",
      updatedAt: "2026-08-15T12:00:00Z",
    });
  });

  it("loads and wholly replaces manually edited words", async () => {
    getBlockedWordsSetting.mockResolvedValue({ words: [], count: 0, sourceType: "manual" });
    replaceBlockedWords.mockResolvedValue({ words: ["新词", "短语"], count: 2, sourceType: "manual" });
    render(<BlockedWordsEditor />);

    const editor = await screen.findByPlaceholderText(/违规词一/);
    fireEvent.change(editor, { target: { value: "新词\n短语" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并整体替换" }));

    await waitFor(() => expect(replaceBlockedWords).toHaveBeenCalledWith("新词\n短语", "manual"));
    expect(await screen.findByText("当前词库：2 个词")).toBeInTheDocument();
  });

  it("imports a URL as a replacement", async () => {
    importBlockedWordsFromURL.mockResolvedValue({
      words: ["远程词"],
      count: 1,
      sourceType: "url",
      sourceUrl: "https://example.com/words.txt",
    });
    render(<BlockedWordsEditor />);
    await screen.findByText("当前词库：1 个词");

    fireEvent.change(screen.getByPlaceholderText("https://example.com/blocked-words.txt"), {
      target: { value: "https://example.com/words.txt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "导入并替换" }));

    await waitFor(() => expect(importBlockedWordsFromURL).toHaveBeenCalledWith("https://example.com/words.txt"));
  });

  it("requires confirmation before clearing the database word list", async () => {
    clearBlockedWords.mockResolvedValue({ words: [], count: 0 });
    render(<BlockedWordsEditor />);
    await screen.findByText("当前词库：1 个词");

    fireEvent.click(screen.getByRole("button", { name: "清空屏蔽词" }));
    expect(screen.getByText("清空全部屏蔽词？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认清空" }));

    await waitFor(() => expect(clearBlockedWords).toHaveBeenCalledOnce());
    expect(await screen.findByText("当前词库：0 个词")).toBeInTheDocument();
  });
});
