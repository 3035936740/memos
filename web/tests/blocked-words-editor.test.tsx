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
      words: ["existing word"],
      count: 1,
      sourceType: "manual",
      updatedAt: "2026-08-15T12:00:00Z",
    });
  });

  it("loads and wholly replaces manually edited words", async () => {
    getBlockedWordsSetting.mockResolvedValue({ words: [], count: 0, sourceType: "manual" });
    replaceBlockedWords.mockResolvedValue({ words: ["new word", "blocked phrase"], count: 2, sourceType: "manual" });
    render(<BlockedWordsEditor />);

    const editor = await screen.findByPlaceholderText(/blocked word one/);
    await waitFor(() => expect(editor).toBeEnabled());
    fireEvent.change(editor, { target: { value: "new word\nblocked phrase" } });
    const saveButton = screen.getByRole("button", { name: "Save and replace all" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(replaceBlockedWords).toHaveBeenCalledWith("new word\nblocked phrase", "manual"));
    expect(await screen.findByText("Current list: 2 words")).toBeInTheDocument();
  });

  it("imports a URL as a replacement", async () => {
    importBlockedWordsFromURL.mockResolvedValue({
      words: ["remote word"],
      count: 1,
      sourceType: "url",
      sourceUrl: "https://example.com/words.txt",
    });
    render(<BlockedWordsEditor />);
    await screen.findByText(/Current list: 1 word/);

    fireEvent.change(screen.getByPlaceholderText("https://example.com/blocked-words.txt"), {
      target: { value: "https://example.com/words.txt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import and replace" }));

    await waitFor(() => expect(importBlockedWordsFromURL).toHaveBeenCalledWith("https://example.com/words.txt"));
  });

  it("requires confirmation before clearing the database word list", async () => {
    clearBlockedWords.mockResolvedValue({ words: [], count: 0 });
    render(<BlockedWordsEditor />);
    await screen.findByText(/Current list: 1 word/);

    fireEvent.click(screen.getByRole("button", { name: "Clear blocked words" }));
    expect(screen.getByText("Clear all blocked words?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    await waitFor(() => expect(clearBlockedWords).toHaveBeenCalledOnce());
    expect(await screen.findByText("Current list: 0 words")).toBeInTheDocument();
  });
});
