import { describe, expect, it } from "vitest";
import { deriveBlogMemoText } from "@/components/BlogMemoView";

describe("deriveBlogMemoText", () => {
  it("uses the first heading as the title and turns the remainder into a plain-text excerpt", () => {
    expect(deriveBlogMemoText("# 我的文章\n\n这里有 **重点** 和 [链接](https://example.com)。", "我的文章")).toEqual({
      title: "我的文章",
      excerpt: "这里有 重点 和 链接。",
    });
  });

  it("falls back to the first non-empty line when a memo has no heading", () => {
    expect(deriveBlogMemoText("\n随手记录\n第二行内容")).toEqual({
      title: "随手记录",
      excerpt: "第二行内容",
    });
  });
});
