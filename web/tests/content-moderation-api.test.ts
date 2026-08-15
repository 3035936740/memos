import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBlockedWords, importBlockedWordsFromURL, replaceBlockedWords } from "@/utils/content-moderation";

const { getRequestToken } = vi.hoisted(() => ({
  getRequestToken: vi.fn(async () => "admin-token"),
}));

vi.mock("@/connect", () => ({
  getRequestToken,
}));

describe("content moderation API", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replaces the database word list instead of appending", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ words: ["one", "two"], count: 2, sourceType: "manual" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await replaceBlockedWords("one\ntwo", "manual");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/v1/admin/blocked-words");
    expect(init.method).toBe("PUT");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer admin-token");
    expect(JSON.parse(init.body as string)).toEqual({ content: "one\ntwo", sourceType: "manual", sourceName: "" });
  });

  it("uses dedicated URL import and clear endpoints", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ words: [], count: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await importBlockedWordsFromURL("https://example.com/words.txt");
    await clearBlockedWords();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/admin/blocked-words/import", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/admin/blocked-words", expect.objectContaining({ method: "DELETE" }));
  });

  it("surfaces the server error message", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "word list is empty" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(replaceBlockedWords("", "manual")).rejects.toThrow("word list is empty");
  });
});
