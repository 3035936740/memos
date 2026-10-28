import { beforeEach, describe, expect, it } from "vitest";
import {
  buildBookmarklet,
  buildSharedNote,
  readSharedNote,
  takeSharedNote,
  withoutShareParams,
} from "@/components/MemoEditor/utils/sharedNote";

describe("shared notes", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("reads the share parameters and leaves the rest of the query", () => {
    const search = "?share_title=Hi&share_url=https%3A%2F%2Fa.com&tab=1";
    expect(readSharedNote(search)).toEqual({ title: "Hi", text: "", url: "https://a.com" });
    expect(readSharedNote("?tab=1")).toBeUndefined();
    expect(withoutShareParams(search)).toBe("?tab=1");
    expect(withoutShareParams("?share_text=x")).toBe("");
  });

  it("quotes the text and links its source once", () => {
    expect(buildSharedNote({ title: "A [b] page", text: "line one\n\nline two", url: "https://a.com/x(1)" })).toBe(
      "> line one\n>\n> line two\n\n[A \\[b\\] page](https://a.com/x%281%29)",
    );
    expect(buildSharedNote({ title: "", text: "Look at this https://a.com/y", url: "" })).toBe("> Look at this\n\nhttps://a.com/y");
    expect(buildSharedNote({ title: "Title", text: "Title", url: "https://a.com" })).toBe("[Title](https://a.com)");
  });

  it("adds the shared page after the existing draft and clears the address", () => {
    localStorage.setItem("users/1-home-memo-editor", "half-written thought");
    window.history.replaceState(null, "", "/home?share_title=T&share_url=https%3A%2F%2Fa.com&tab=1");

    takeSharedNote("users/1", "home-memo-editor");

    expect(localStorage.getItem("users/1-home-memo-editor")).toBe("half-written thought\n\n[T](https://a.com)");
    expect(window.location.search).toBe("?tab=1");
    takeSharedNote("users/1", "home-memo-editor");
    expect(localStorage.getItem("users/1-home-memo-editor")).toBe("half-written thought\n\n[T](https://a.com)");
  });

  it("builds a bookmarklet that opens Home with the page", () => {
    const bookmarklet = buildBookmarklet("https://memos.example/home");
    expect(bookmarklet.startsWith("javascript:")).toBe(true);
    const code = decodeURIComponent(bookmarklet.slice("javascript:".length));
    expect(code).toContain('new URL("https://memos.example/home")');
    expect(code).toContain('"share_text"');
  });
});
