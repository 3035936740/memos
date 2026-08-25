import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { deriveBlogMemoText } from "@/components/BlogMemoView";
import { AttachmentSchema } from "@/types/proto/api/v1/attachment_service_pb";
import { buildAttachmentVisualItems, selectBlogCoverMedia } from "@/utils/media-item";

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

  it("removes custom memo presentation markers from card excerpts", () => {
    expect(
      deriveBlogMemoText(
        "# 标题\n\n[color=rgba(134, 29, 29, 1)]娃娃[/color]\n\n:::align right\n\n右对齐内容\n\n:::\n\n[size=28px]大字[/size]",
        "标题",
      ),
    ).toEqual({
      title: "标题",
      excerpt: "娃娃 右对齐内容 大字",
    });
  });
});

describe("selectBlogCoverMedia", () => {
  const image = create(AttachmentSchema, {
    name: "attachments/image-one",
    filename: "image.png",
    type: "image/png",
  });
  const video = create(AttachmentSchema, {
    name: "attachments/video-one",
    filename: "video.mp4",
    type: "video/mp4",
  });
  const items = buildAttachmentVisualItems([image, video]);

  it("uses a video when it occurs before an image in the article body", () => {
    const content = ["[video:video](/file/attachments/video-one)", "![image](/file/attachments/image-one)"].join("\n\n");
    expect(selectBlogCoverMedia(content, items)?.kind).toBe("video");
  });

  it("uses an image when it occurs before a video in the article body", () => {
    const content = ["![image](/file/attachments/image-one)", "[video:video](/file/attachments/video-one)"].join("\n\n");
    expect(selectBlogCoverMedia(content, items)?.kind).toBe("image");
  });
});
