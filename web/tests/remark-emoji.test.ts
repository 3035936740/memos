import type { Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, test } from "vitest";
import type { CustomEmoji } from "@/utils/emoji";
import { remarkEmoji } from "@/utils/remark-plugins/remark-emoji";

const emoji: CustomEmoji = {
  id: 1,
  name: "哭脸",
  token: "[金馆长_哭脸]",
  url: "/emoji/%E9%87%91%E9%A6%86%E9%95%BF_%E5%93%AD%E8%84%B8.png",
  type: "image/png",
  size: 1,
  storageType: "DATABASE",
};

const parse = (markdown: string) => {
  const processor = unified().use(remarkParse).use(remarkEmoji, [emoji]);
  return processor.runSync(processor.parse(markdown)) as Root;
};

describe("remarkEmoji", () => {
  test("replaces only exact plain-text emoji shortcodes", () => {
    const paragraph = parse(`before ${emoji.token} after`).children[0];
    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type !== "paragraph") return;
    expect(paragraph.children.map((node) => node.type)).toEqual(["text", "image", "text"]);
    expect(paragraph.children[1]).toMatchObject({ type: "image", url: emoji.url, alt: emoji.token });
  });

  test("does not reinterpret markdown links or inline code", () => {
    const paragraph = parse(`[label](https://example.com) \`${emoji.token}\``).children[0];
    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type !== "paragraph") return;
    expect(paragraph.children.map((node) => node.type)).toEqual(["link", "text", "inlineCode"]);
  });

  test("renders a shortcode on a later line", () => {
    const paragraph = parse(`first line\n${emoji.token}\nlast line`).children[0];
    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type !== "paragraph") return;
    expect(paragraph.children.map((node) => node.type)).toEqual(["text", "image", "text"]);
    expect(paragraph.children[1]).toMatchObject({ type: "image", url: emoji.url, alt: emoji.token });
  });

  test("repairs the legacy markdown-image marker before an emoji shortcode", () => {
    const paragraph = parse(`first line\n!${emoji.token}\nlast line`).children[0];
    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type !== "paragraph") return;
    expect(paragraph.children.map((node) => node.type)).toEqual(["text", "image", "text"]);
    expect(paragraph.children.some((node) => node.type === "text" && node.value.includes("!"))).toBe(false);
  });
});
