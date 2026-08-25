import type { Image, Parent, Root, Text } from "mdast";
import type { Plugin } from "unified";
import type { CustomEmoji } from "@/utils/emoji";

const SKIPPED_PARENT_TYPES = new Set(["link", "linkReference", "image", "imageReference", "code", "inlineCode"]);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const transformParent = (parent: Parent, byToken: Map<string, CustomEmoji>, matcher: RegExp) => {
  if (SKIPPED_PARENT_TYPES.has(parent.type)) return;
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index];
    if (child.type === "text") {
      const text = child as Text;
      matcher.lastIndex = 0;
      if (!matcher.test(text.value)) continue;
      matcher.lastIndex = 0;
      const replacements: (Text | Image)[] = [];
      let cursor = 0;
      for (const match of text.value.matchAll(matcher)) {
        const offset = match.index ?? 0;
        if (offset > cursor) replacements.push({ type: "text", value: text.value.slice(cursor, offset) });
        // Older editor builds could leave a Markdown image marker immediately
        // before a custom emoji token (`![group_name]`). Treat that legacy form
        // as the same emoji instead of leaving a literal `!` in the document.
        const matchedToken = match[0].startsWith("!") ? match[0].slice(1) : match[0];
        const emoji = byToken.get(matchedToken);
        if (emoji) replacements.push({ type: "image", url: emoji.url, alt: emoji.token, title: emoji.name });
        cursor = offset + match[0].length;
      }
      if (cursor < text.value.length) replacements.push({ type: "text", value: text.value.slice(cursor) });
      parent.children.splice(index, 1, ...replacements);
      index += replacements.length - 1;
      continue;
    }
    if ("children" in child && Array.isArray(child.children)) transformParent(child as Parent, byToken, matcher);
  }
};

export const remarkEmoji: Plugin<[CustomEmoji[]], Root> = (emojis = []) => {
  const byToken = new Map(emojis.map((emoji) => [emoji.token, emoji]));
  const alternatives = Array.from(byToken.keys())
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  if (alternatives.length === 0) return () => undefined;
  const matcher = new RegExp(`!?(?:${alternatives.join("|")})`, "gu");
  return (tree) => transformParent(tree, byToken, matcher);
};
