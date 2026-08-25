import type { Data, Paragraph, Parent, PhrasingContent, Root, RootContent, Text } from "mdast";
import type { Plugin } from "unified";
import { isMemoTextAlignment, normalizeMemoTextColor, normalizeMemoTextSize } from "@/utils/memo-rich-text";

interface MemoNodeData extends Data {
  hName: "div" | "span";
  hProperties: Record<string, string>;
}

interface MemoAlignmentNode extends Parent {
  type: "memoAlignment";
  children: RootContent[];
  data: MemoNodeData;
}

interface MemoColorNode extends Parent {
  type: "memoColor";
  children: PhrasingContent[];
  data: MemoNodeData;
}

interface MemoSpoilerNode extends Parent {
  type: "memoSpoiler";
  children: PhrasingContent[];
  data: MemoNodeData;
}

interface MemoSizeNode extends Parent {
  type: "memoSize";
  children: PhrasingContent[];
  data: MemoNodeData;
}

declare module "mdast" {
  interface RootContentMap {
    memoAlignment: MemoAlignmentNode;
    memoColor: MemoColorNode;
    memoSize: MemoSizeNode;
    memoSpoiler: MemoSpoilerNode;
  }

  interface PhrasingContentMap {
    memoColor: MemoColorNode;
    memoSize: MemoSizeNode;
    memoSpoiler: MemoSpoilerNode;
  }
}

const INLINE_PARENT_TYPES = new Set(["paragraph", "heading", "emphasis", "strong", "delete", "link", "linkReference"]);
const LEGACY_MEMO_HTML = /data-memo-(?:align|color|size|spoiler)\s*=/i;
const COLOR_MARKER = /\[color=([^\]\r\n]{1,96})\]|\[\/color\]/giu;
const SIZE_MARKER = /\[size=([^\]\r\n]{1,24})\]|\[\/size\]/giu;
const ALIGNMENT_OPEN_MARKER = /^:::align[ \t]+(center|right)[ \t]*$/iu;
const ALIGNMENT_CLOSE_MARKER = /^:::[ \t]*$/u;

const textNode = (value: string): Text => ({ type: "text", value });

function appendText(children: PhrasingContent[], value: string) {
  if (!value) return;
  const previous = children.at(-1);
  if (previous?.type === "text") previous.value += value;
  else children.push(textNode(value));
}

function createColorNode(color: string, children: PhrasingContent[]): MemoColorNode {
  return {
    type: "memoColor",
    children,
    data: {
      hName: "span",
      hProperties: { dataMemoColor: color },
    },
  };
}

function createSpoilerNode(children: PhrasingContent[]): MemoSpoilerNode {
  return {
    type: "memoSpoiler",
    children,
    data: {
      hName: "span",
      hProperties: { dataMemoSpoiler: "true" },
    },
  };
}

function createSizeNode(size: string, children: PhrasingContent[]): MemoSizeNode {
  return {
    type: "memoSize",
    children,
    data: {
      hName: "span",
      hProperties: { dataMemoSize: size },
    },
  };
}

type ColorToken =
  | { type: "node"; node: PhrasingContent }
  | { type: "open"; color: string; source: string }
  | { type: "close"; source: string };

function tokenizeColorMarkers(children: PhrasingContent[]): ColorToken[] {
  const tokens: ColorToken[] = [];
  for (const child of children) {
    if (child.type !== "text") {
      tokens.push({ type: "node", node: child });
      continue;
    }

    let cursor = 0;
    COLOR_MARKER.lastIndex = 0;
    for (const match of child.value.matchAll(COLOR_MARKER)) {
      const index = match.index ?? 0;
      if (index > cursor) tokens.push({ type: "node", node: textNode(child.value.slice(cursor, index)) });
      if (match[1] === undefined) {
        tokens.push({ type: "close", source: match[0] });
      } else {
        const color = normalizeMemoTextColor(match[1]);
        if (color) tokens.push({ type: "open", color, source: match[0] });
        else tokens.push({ type: "node", node: textNode(match[0]) });
      }
      cursor = index + match[0].length;
    }
    if (cursor < child.value.length) tokens.push({ type: "node", node: textNode(child.value.slice(cursor)) });
  }
  return tokens;
}

function transformColorMarkers(children: PhrasingContent[]): PhrasingContent[] {
  const output: PhrasingContent[] = [];
  const stack: { color: string; source: string; children: PhrasingContent[] }[] = [];
  const target = () => stack.at(-1)?.children ?? output;

  for (const token of tokenizeColorMarkers(children)) {
    if (token.type === "node") {
      target().push(token.node);
    } else if (token.type === "open") {
      stack.push({ color: token.color, source: token.source, children: [] });
    } else {
      const frame = stack.pop();
      if (!frame) appendText(target(), token.source);
      else target().push(createColorNode(frame.color, frame.children));
    }
  }

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) break;
    const restored: PhrasingContent[] = [textNode(frame.source), ...frame.children];
    target().push(...restored);
  }
  return output;
}

type SizeToken =
  | { type: "node"; node: PhrasingContent }
  | { type: "open"; size: string; source: string }
  | { type: "close"; source: string };

function tokenizeSizeMarkers(children: PhrasingContent[]): SizeToken[] {
  const tokens: SizeToken[] = [];
  for (const child of children) {
    if (child.type !== "text") {
      tokens.push({ type: "node", node: child });
      continue;
    }

    let cursor = 0;
    SIZE_MARKER.lastIndex = 0;
    for (const match of child.value.matchAll(SIZE_MARKER)) {
      const index = match.index ?? 0;
      if (index > cursor) tokens.push({ type: "node", node: textNode(child.value.slice(cursor, index)) });
      if (match[1] === undefined) {
        tokens.push({ type: "close", source: match[0] });
      } else {
        const size = normalizeMemoTextSize(match[1]);
        if (size) tokens.push({ type: "open", size, source: match[0] });
        else tokens.push({ type: "node", node: textNode(match[0]) });
      }
      cursor = index + match[0].length;
    }
    if (cursor < child.value.length) tokens.push({ type: "node", node: textNode(child.value.slice(cursor)) });
  }
  return tokens;
}

function transformSizeMarkers(children: PhrasingContent[]): PhrasingContent[] {
  const output: PhrasingContent[] = [];
  const stack: { size: string; source: string; children: PhrasingContent[] }[] = [];
  const target = () => stack.at(-1)?.children ?? output;

  for (const token of tokenizeSizeMarkers(children)) {
    if (token.type === "node") {
      target().push(token.node);
    } else if (token.type === "open") {
      stack.push({ size: token.size, source: token.source, children: [] });
    } else {
      const frame = stack.pop();
      if (!frame) appendText(target(), token.source);
      else target().push(createSizeNode(frame.size, frame.children));
    }
  }

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) break;
    target().push(textNode(frame.source), ...frame.children);
  }
  return output;
}

function transformSizeMarkersDeep(children: PhrasingContent[]): PhrasingContent[] {
  const output = transformSizeMarkers(children);
  for (const child of output) {
    if (child.type === "memoColor" || child.type === "memoSize") {
      child.children = transformSizeMarkersDeep(child.children);
    }
  }
  return output;
}

function transformSpoilerMarkers(children: PhrasingContent[]): PhrasingContent[] {
  const output: PhrasingContent[] = [];
  let hidden: PhrasingContent[] | undefined;

  const append = (node: PhrasingContent) => (hidden ?? output).push(node);
  for (const child of children) {
    if (child.type !== "text") {
      append(child);
      continue;
    }

    const pieces = child.value.split("||");
    for (let index = 0; index < pieces.length; index += 1) {
      appendText(hidden ?? output, pieces[index]);
      if (index === pieces.length - 1) continue;
      if (hidden) {
        output.push(createSpoilerNode(hidden));
        hidden = undefined;
      } else {
        hidden = [];
      }
    }
  }

  if (hidden) {
    appendText(output, "||");
    output.push(...hidden);
  }
  return output;
}

function transformSpoilerMarkersDeep(children: PhrasingContent[]): PhrasingContent[] {
  const output = transformSpoilerMarkers(children);
  for (const child of output) {
    if (child.type === "memoColor" || child.type === "memoSize" || child.type === "memoSpoiler") {
      child.children = transformSpoilerMarkersDeep(child.children);
    }
  }
  return output;
}

function isParent(node: RootContent): node is RootContent & Parent {
  return "children" in node && Array.isArray(node.children);
}

function transformInlineParent(parent: Parent) {
  for (const child of parent.children) {
    if (isParent(child)) transformTree(child);
  }
  if (!INLINE_PARENT_TYPES.has(parent.type)) return;

  const withColors = transformColorMarkers(parent.children as PhrasingContent[]);
  const withSizes = transformSizeMarkersDeep(withColors);
  parent.children = transformSpoilerMarkersDeep(withSizes);
}

function paragraphMarker(node: RootContent): string | undefined {
  if (node.type !== "paragraph") return undefined;
  const paragraph = node as Paragraph;
  return paragraph.children.length === 1 && paragraph.children[0].type === "text" ? paragraph.children[0].value.trim() : undefined;
}

function createAlignmentNode(alignment: "center" | "right", children: RootContent[]): MemoAlignmentNode {
  return {
    type: "memoAlignment",
    children,
    data: {
      hName: "div",
      hProperties: { dataMemoAlign: alignment },
    },
  };
}

function transformAlignmentBlocks(parent: Parent) {
  for (let index = 0; index < parent.children.length; index += 1) {
    const marker = paragraphMarker(parent.children[index]);
    const open = marker ? ALIGNMENT_OPEN_MARKER.exec(marker) : null;
    if (!open || !isMemoTextAlignment(open[1]) || open[1] === "left") continue;

    const closeIndex = parent.children.findIndex(
      (child, candidate) => candidate > index && ALIGNMENT_CLOSE_MARKER.test(paragraphMarker(child) ?? ""),
    );
    if (closeIndex < 0) continue;

    const content = parent.children.slice(index + 1, closeIndex);
    parent.children.splice(index, closeIndex - index + 1, createAlignmentNode(open[1], content));
  }
}

/** Make the removed HTML-backed beta syntax visible as ordinary source text. */
function escapeLegacyMemoHtml(parent: Parent) {
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index];
    if (child.type !== "html" || !LEGACY_MEMO_HTML.test(child.value)) continue;
    const tag = /^<(div|span)\b/i.exec(child.value)?.[1];
    parent.children[index] = textNode(child.value);
    if (!tag) continue;
    const closing = new RegExp(`^<\/${tag}\\s*>$`, "i");
    for (let candidate = index + 1; candidate < parent.children.length; candidate += 1) {
      const possibleClose = parent.children[candidate];
      if (possibleClose.type === "html" && closing.test(possibleClose.value.trim())) {
        parent.children[candidate] = textNode(possibleClose.value);
        break;
      }
    }
  }
}

function transformTree(parent: Parent) {
  escapeLegacyMemoHtml(parent);
  transformAlignmentBlocks(parent);
  transformInlineParent(parent);
}

/** Parse Memos presentation syntax without storing raw HTML in memo Markdown. */
export const remarkMemoRichText: Plugin<[], Root> = () => (tree) => transformTree(tree);
