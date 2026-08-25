import type { Definition, Html, Image, ImageReference, Link, LinkReference, Root } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { normalizeIdentifier } from "micromark-util-normalize-identifier";
import { visit } from "unist-util-visit";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { getAttachmentMotionGroupId, getAttachmentType, getAttachmentUrl, isImage } from "@/utils/attachment";

const ATTACHMENT_NAME_PREFIX = "attachments/";
const MANAGED_ATTACHMENT_PATH_PREFIX = "/file/attachments/";
const UID_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,34}[a-zA-Z0-9])?$/;

interface ManagedImageNode {
  uid: string;
  kind: "image" | "video";
  start?: number;
  end?: number;
}

interface ManagedImageIndex {
  nodes: ManagedImageNode[];
  uids: ReadonlySet<string>;
  /** Destinations the server will reject on save (see `findInvalidManagedAttachmentReferences`). */
  invalidReferences: readonly string[];
}

/**
 * Mirrors the server's three-way classification in `internal/markdown`: a URL is
 * either none of our business, a managed reference, or a managed reference the
 * API refuses. Collapsing the last two would leave the editor unable to warn
 * about content that cannot be saved.
 */
type ManagedImageURL = { kind: "unmanaged" } | { kind: "invalid" } | { kind: "managed"; uid: string };

const UNMANAGED: ManagedImageURL = { kind: "unmanaged" };
const INVALID: ManagedImageURL = { kind: "invalid" };

const parseMarkdown = (source: string): Root =>
  fromMarkdown(source, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });

export const extractAttachmentUIDFromName = (name: string): string | undefined => {
  if (!name.startsWith(ATTACHMENT_NAME_PREFIX)) return undefined;
  const uid = name.slice(ATTACHMENT_NAME_PREFIX.length);
  return UID_PATTERN.test(uid) ? uid : undefined;
};

// The API resolves absolute managed URLs against the configured instance URL, not
// against whatever host the browser happens to be on, so the client has to know
// the same value or the two disagree about which attachments are inline.
let instanceOrigin: string | undefined;
let instanceHost: string | undefined;

/** Publishes the instance profile's URL to this module; clears the parse cache since results depend on it. */
export const setManagedAttachmentInstanceUrl = (instanceUrl: string | undefined): void => {
  let nextOrigin: string | undefined;
  let nextHost: string | undefined;
  if (instanceUrl?.trim()) {
    try {
      const parsed = new URL(instanceUrl.trim());
      nextOrigin = parsed.origin;
      nextHost = parsed.host;
    } catch {
      // A malformed instance URL is a server-side misconfiguration; treat it as unset.
    }
  }
  if (nextOrigin === instanceOrigin && nextHost === instanceHost) return;
  instanceOrigin = nextOrigin;
  instanceHost = nextHost;
  indexCache.clear();
};

const hasScheme = (raw: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(raw);

/**
 * Classifies an image destination the way the memo API does. Stored Markdown is
 * expected to be origin-independent; an absolute URL is only a managed reference
 * when it matches the configured instance URL, and is rejected outright when no
 * instance URL is configured.
 */
export const classifyManagedAttachmentImageURL = (raw: string): ManagedImageURL => {
  // The API accepts only root-relative managed paths. Do not let URL
  // normalization turn `file/attachments/...` into a different contract.
  if (!raw.startsWith("/") && !hasScheme(raw)) return UNMANAGED;

  let parsed: URL;
  try {
    parsed = new URL(raw, window.location.origin);
  } catch {
    return UNMANAGED;
  }
  if (!parsed.pathname.startsWith(MANAGED_ATTACHMENT_PATH_PREFIX)) return UNMANAGED;

  const isProtocolRelative = raw.startsWith("//");
  if (isProtocolRelative) {
    // Rejected whenever it could address this instance; otherwise it is someone else's URL.
    return !instanceHost || parsed.host === instanceHost ? INVALID : UNMANAGED;
  }
  if (hasScheme(raw)) {
    if (!instanceOrigin) return INVALID;
    if (parsed.origin !== instanceOrigin) return UNMANAGED;
  }

  if (parsed.search || parsed.hash || parsed.pathname.includes("%")) return INVALID;

  const parts = parsed.pathname.slice(MANAGED_ATTACHMENT_PATH_PREFIX.length).split("/");
  if ((parts.length !== 1 && parts.length !== 2) || !UID_PATTERN.test(parts[0] ?? "") || (parts.length === 2 && !parts[1])) {
    return INVALID;
  }
  return { kind: "managed", uid: parts[0]! };
};

export const parseManagedAttachmentImageURL = (raw: string): string | undefined => {
  const classified = classifyManagedAttachmentImageURL(raw);
  return classified.kind === "managed" ? classified.uid : undefined;
};

const EMPTY_INDEX: ManagedImageIndex = { nodes: [], uids: new Set(), invalidReferences: [] };
/**
 * Memo bodies are re-scanned on hot paths (every editor keystroke, every card
 * relayout, every render of a memo view), so the mdast parse is cached by source
 * text. The cache is bounded and also keeps the derived `uids` set referentially
 * stable, which is what lets callers memoize on it.
 */
const INDEX_CACHE_LIMIT = 128;
const indexCache = new Map<string, ManagedImageIndex>();

const buildManagedImageIndex = (source: string): ManagedImageIndex => {
  const tree = parseMarkdown(source);
  const definitions = new Map<string, string>();
  visit(tree, "definition", (node: Definition) => {
    const identifier = normalizeIdentifier(node.identifier);
    // CommonMark and the API's Goldmark parser resolve duplicate definitions
    // to the first occurrence, so the client must not overwrite it here.
    if (!definitions.has(identifier)) definitions.set(identifier, node.url);
  });

  const nodes: ManagedImageNode[] = [];
  const invalidReferences: string[] = [];
  visit(tree, (node) => {
    // The API accepts managed URLs only through Markdown image nodes and rejects
    // any raw HTML mentioning the route, rather than running a second HTML parser.
    if (node.type === "html") {
      const raw = (node as Html).value;
      if (raw.includes(MANAGED_ATTACHMENT_PATH_PREFIX)) invalidReferences.push(raw);
      return;
    }

    let destination: string | undefined;
    let kind: ManagedImageNode["kind"] | undefined;
    if (node.type === "image") {
      destination = (node as Image).url;
      kind = "image";
    } else if (node.type === "imageReference") {
      destination = definitions.get(normalizeIdentifier((node as ImageReference).identifier));
      kind = "image";
    } else if (node.type === "link") {
      const link = node as Link;
      const label = link.children.map((child) => (child.type === "text" ? child.value : "")).join("");
      if (label.startsWith("video:")) {
        destination = link.url;
        kind = "video";
      }
    } else if (node.type === "linkReference") {
      const link = node as LinkReference;
      const label = link.children.map((child) => (child.type === "text" ? child.value : "")).join("");
      if (label.startsWith("video:")) {
        destination = definitions.get(normalizeIdentifier(link.identifier));
        kind = "video";
      }
    }
    if (!destination || !kind) return;

    const classified = classifyManagedAttachmentImageURL(destination);
    if (classified.kind === "invalid" && kind === "image") {
      invalidReferences.push(destination);
      return;
    }
    if (classified.kind !== "managed") return;
    nodes.push({ uid: classified.uid, kind, start: node.position?.start.offset, end: node.position?.end.offset });
  });
  return { nodes, uids: new Set(nodes.map((node) => node.uid)), invalidReferences };
};

const managedImageIndex = (source: string): ManagedImageIndex => {
  if (!source.includes(MANAGED_ATTACHMENT_PATH_PREFIX)) return EMPTY_INDEX;

  const cached = indexCache.get(source);
  if (cached) return cached;

  const index = buildManagedImageIndex(source);
  if (indexCache.size >= INDEX_CACHE_LIMIT) indexCache.delete(indexCache.keys().next().value!);
  indexCache.set(source, index);
  return index;
};

export const extractManagedAttachmentUIDs = (source: string): ReadonlySet<string> => managedImageIndex(source).uids;

export interface ManagedAttachmentReference {
  uid: string;
  kind: "image" | "video";
  position: number;
}

/** Ordered, parsed body references; code spans/fences and unrelated links are excluded. */
export const extractManagedAttachmentReferences = (source: string): ManagedAttachmentReference[] =>
  managedImageIndex(source)
    .nodes.filter((node) => node.start !== undefined)
    .map((node) => ({ uid: node.uid, kind: node.kind, position: node.start! }));

/**
 * Managed image URLs the API will reject (`InvalidArgument`) if this content is
 * saved — a query or fragment on the route, percent-encoding, a malformed UID, a
 * protocol-relative or unrecognized absolute URL, or a raw HTML `<img>`.
 */
export const findInvalidManagedAttachmentReferences = (source: string): readonly string[] => managedImageIndex(source).invalidReferences;

const escapeMarkdownAlt = (value: string): string => value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/]/g, "\\]");

const filenameStem = (filename: string): string => {
  const normalized = filename.replace(/[\r\n]+/g, " ").trim();
  const lastDot = normalized.lastIndexOf(".");
  return lastDot > 0 ? normalized.slice(0, lastDot) : normalized || "image";
};

export const buildManagedAttachmentMarkdown = (attachment: Attachment): string => {
  const uid = extractAttachmentUIDFromName(attachment.name);
  if (!uid) throw new Error(`Invalid attachment resource name: ${attachment.name}`);
  return `![${escapeMarkdownAlt(filenameStem(attachment.filename))}](${MANAGED_ATTACHMENT_PATH_PREFIX}${uid})`;
};

/** Videos use a normal Markdown link so the server never mistakes them for managed image nodes. */
export const buildManagedVideoMarkdown = (attachment: Attachment): string => {
  const uid = extractAttachmentUIDFromName(attachment.name);
  if (!uid) throw new Error(`Invalid attachment resource name: ${attachment.name}`);
  return `[video:${escapeMarkdownAlt(filenameStem(attachment.filename))}](${MANAGED_ATTACHMENT_PATH_PREFIX}${uid})`;
};

/** Whether an attachment can be referenced inline; mirrors the server-side rule for managed images. */
export const canInlineAttachment = (attachment: Attachment): boolean => isImage(attachment.type) && !attachment.externalLink;

/** Images and videos that the editor can place into the Markdown body. */
export const canInlineMediaAttachment = (attachment: Attachment): boolean =>
  (isImage(attachment.type) || getAttachmentType(attachment) === "video/*") && !attachment.externalLink;

export const removeManagedAttachmentReferences = (source: string, uids: ReadonlySet<string>): string => {
  const ranges = managedImageIndex(source)
    .nodes.filter((node) => uids.has(node.uid) && node.start !== undefined && node.end !== undefined)
    .map((node) => ({ start: node.start!, end: node.end! }))
    .sort((left, right) => right.start - left.start);

  let result = source;
  for (const range of ranges) {
    const lineStart = result.lastIndexOf("\n", range.start - 1) + 1;
    const nextNewline = result.indexOf("\n", range.end);
    const lineEnd = nextNewline === -1 ? result.length : nextNewline;
    const before = result.slice(lineStart, range.start);
    const after = result.slice(range.end, lineEnd);
    const removeWholeLine = before.trim() === "" && after.trim() === "";
    const start = removeWholeLine ? lineStart : range.start;
    let end = removeWholeLine && nextNewline !== -1 ? nextNewline + 1 : removeWholeLine ? lineEnd : range.end;
    if (removeWholeLine && result.slice(0, start).endsWith("\n\n") && result.startsWith("\n", end)) end += 1;
    result = result.slice(0, start) + result.slice(end);
  }
  return result;
};

export const filterInlineManagedAttachments = (content: string, attachments: Attachment[]): Attachment[] => {
  const referencedUIDs = extractManagedAttachmentUIDs(content);
  if (referencedUIDs.size === 0) return attachments;

  const inlineGroups = new Set<string>();
  const inlineNames = new Set<string>();
  for (const attachment of attachments) {
    const uid = extractAttachmentUIDFromName(attachment.name);
    if (!uid || !referencedUIDs.has(uid)) continue;
    inlineNames.add(attachment.name);
    const groupID = getAttachmentMotionGroupId(attachment);
    if (groupID) inlineGroups.add(groupID);
  }

  return attachments.filter(
    (attachment) => !inlineNames.has(attachment.name) && !inlineGroups.has(getAttachmentMotionGroupId(attachment) ?? ""),
  );
};

export const resolveManagedAttachmentImageSource = (source: string | undefined, attachments: Attachment[]): string | undefined => {
  if (!source) return source;
  const uid = parseManagedAttachmentImageURL(source);
  if (!uid) return source;
  const attachment = attachments.find((candidate) => extractAttachmentUIDFromName(candidate.name) === uid);
  return attachment ? getAttachmentUrl(attachment) : source;
};

export interface ManagedVideoAttachmentSource {
  sourceUrl: string;
  filename: string;
  mimeType: string;
}

/** Resolves an editor-generated `[video:…]` link to its bound video attachment. */
export const resolveManagedAttachmentVideoSource = (
  source: string | undefined,
  attachments: Attachment[],
): ManagedVideoAttachmentSource | undefined => {
  if (!source) return undefined;
  const uid = parseManagedAttachmentImageURL(source);
  if (!uid) return undefined;
  const attachment = attachments.find(
    (candidate) => extractAttachmentUIDFromName(candidate.name) === uid && getAttachmentType(candidate) === "video/*",
  );
  return attachment ? { sourceUrl: getAttachmentUrl(attachment), filename: attachment.filename, mimeType: attachment.type } : undefined;
};
