import type { Element } from "hast";
import { type ComponentProps, memo, type ReactNode, Suspense, useMemo, useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { buildRehypePlugins, buildRemarkPlugins } from "@/components/MemoContent/pipeline";
import { tagStyles } from "@/lib/markdownStyles";
import { cn } from "@/lib/utils";
import { isMentionElement, isTagElement, isTaskListItemElement } from "@/types/markdown";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { useEmojiPacks } from "@/utils/emoji";
import { useTranslate } from "@/utils/i18n";
import { lazyWithReload } from "@/utils/lazy";
import { resolveManagedAttachmentImageSource, resolveManagedAttachmentVideoSource } from "@/utils/managed-attachment";
import { isMemoTextAlignment, normalizeMemoAlignmentBlocks, normalizeMemoTextColor, normalizeMemoTextSize } from "@/utils/memo-rich-text";
import type { MemoOriginScope } from "../MemoView/navigation";
import { CodeBlock } from "./CodeBlock";
import { MarkdownRenderContext, rootMarkdownRenderContext } from "./MarkdownRenderContext";
import { Mention } from "./Mention";
import { AnchorLink, Blockquote, Heading, HorizontalRule, Image, InlineCode, Link, List, ListItem, Paragraph } from "./markdown";
import { hasMathSyntax } from "./math";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "./Table";
import { Tag } from "./Tag";
import { TaskListItem } from "./TaskListItem";
import { TrustedIframe } from "./TrustedIframe";

export interface MemoMarkdownRendererProps {
  content: string;
  attachments?: Attachment[];
  resolvedMentionUsernames: Set<string>;
  /** Resource name of the memo (e.g. `memos/abc123`), used to target footnote links at the detail page. */
  memoName?: string;
  /** Collection page that opened the memo detail. */
  parentPage?: string;
  parentScope?: MemoOriginScope;
  /** Whether the memo is rendered as a collapsed feed card. */
  compact?: boolean;
  /** Render outside MemoViewContext, for instance pages and editor previews. */
  standalone?: boolean;
  allowLocalScripts?: boolean;
}

type RemarkPlugins = NonNullable<ComponentProps<typeof ReactMarkdown>["remarkPlugins"]>;
type RehypePlugins = NonNullable<ComponentProps<typeof ReactMarkdown>["rehypePlugins"]>;

interface MemoMarkdownRendererCoreProps extends MemoMarkdownRendererProps {
  /** Math plugins injected by MathMarkdownRenderer; the remark ones must run before remarkGfm. */
  mathRemarkPlugins?: RemarkPlugins;
  mathRehypePlugins?: RehypePlugins;
}

const MathMarkdownRenderer = lazyWithReload(() => import("./MathMarkdownRenderer"));

function getMentionUsername(node: Element, children?: ReactNode): string {
  const dataMention = node.properties?.["data-mention"];
  if (typeof dataMention === "string" && dataMention !== "") {
    return dataMention;
  }

  const camelDataMention = (node.properties as Record<string, unknown> | undefined)?.dataMention;
  if (typeof camelDataMention === "string" && camelDataMention !== "") {
    return camelDataMention;
  }

  const text = Array.isArray(children) ? children.join("") : children;
  if (typeof text === "string" && text.startsWith("@")) {
    return text.slice(1);
  }

  return "";
}

function elementDataAttribute(node: Element | undefined, dashedName: string, camelName: string): string | undefined {
  const properties = node?.properties as Record<string, unknown> | undefined;
  const value = properties?.[dashedName] ?? properties?.[camelName];
  return typeof value === "string" ? value : undefined;
}

interface MemoSpoilerProps extends ComponentProps<"span"> {
  color?: string;
}

const MemoSpoiler = ({ children, className, color, style, ...props }: MemoSpoilerProps) => {
  const t = useTranslate();
  const [revealed, setRevealed] = useState(false);
  const toggle = () => setRevealed((current) => !current);
  return (
    <span
      {...props}
      role="button"
      tabIndex={0}
      aria-expanded={revealed}
      aria-label={t(revealed ? "memo.spoiler.hide" : "memo.spoiler.reveal")}
      title={t(revealed ? "memo.spoiler.hide" : "memo.spoiler.reveal")}
      className={cn(
        "inline cursor-pointer rounded-sm px-0.5 box-decoration-clone transition-colors",
        revealed
          ? "bg-muted/60"
          : "select-none bg-foreground/85 text-transparent hover:bg-muted/60 hover:text-inherit focus-visible:bg-muted/60 focus-visible:text-inherit",
        className,
      )}
      style={{ ...style, color: revealed ? color : undefined }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggle();
      }}
    >
      {children}
    </span>
  );
};

export const MemoMarkdownRendererCore = ({
  content,
  attachments = [],
  resolvedMentionUsernames,
  memoName,
  parentPage,
  parentScope,
  compact,
  standalone = false,
  allowLocalScripts = false,
  mathRemarkPlugins = [],
  mathRehypePlugins = [],
}: MemoMarkdownRendererCoreProps) => {
  const { data: emojiGroups = [] } = useEmojiPacks();
  const emojis = useMemo(() => emojiGroups.flatMap((group) => group.emojis), [emojiGroups]);
  const normalizedContent = useMemo(() => normalizeMemoAlignmentBlocks(content), [content]);
  const markdownComponents: Components = {
    div: ({ node, className, ...divProps }) => {
      const alignment = elementDataAttribute(node, "data-memo-align", "dataMemoAlign");
      if (!isMemoTextAlignment(alignment) || alignment === "left") return <div {...divProps} className={className} />;
      return (
        <div
          {...divProps}
          data-memo-align={alignment}
          className={cn("w-full", alignment === "center" ? "text-center" : "text-right", className)}
        />
      );
    },
    input: ({ node, ...inputProps }) => {
      if (node && isTaskListItemElement(node)) {
        if (standalone) {
          return (
            <input
              {...inputProps}
              type="checkbox"
              checked={Boolean(inputProps.checked)}
              readOnly
              disabled
              className={cn("mt-1 size-4", inputProps.className)}
            />
          );
        }
        return <TaskListItem {...inputProps} node={node} />;
      }
      return <input {...inputProps} />;
    },
    span: ({ node, ...spanProps }) => {
      if (node && isMentionElement(node)) {
        const username = getMentionUsername(node, spanProps.children);
        return <Mention {...spanProps} node={node} data-mention={username} resolved={resolvedMentionUsernames.has(username)} />;
      }
      if (node && isTagElement(node)) {
        if (standalone) {
          return (
            <span {...spanProps} className={cn(tagStyles.base, tagStyles.defaultColor, spanProps.className)}>
              {spanProps.children}
            </span>
          );
        }
        return <Tag {...spanProps} node={node} />;
      }
      const color = normalizeMemoTextColor(elementDataAttribute(node, "data-memo-color", "dataMemoColor"));
      const fontSize = normalizeMemoTextSize(elementDataAttribute(node, "data-memo-size", "dataMemoSize"));
      const spoiler = elementDataAttribute(node, "data-memo-spoiler", "dataMemoSpoiler") === "true";
      if (spoiler) return <MemoSpoiler {...spanProps} color={color} />;
      return (
        <span
          {...spanProps}
          style={{
            ...spanProps.style,
            color,
            fontSize,
            // A custom size must expand its own line box. Without this, very
            // large glyphs (for example 96px) paint over the author/header row.
            lineHeight: fontSize ? 1.2 : spanProps.style?.lineHeight,
            overflowWrap: fontSize ? "anywhere" : spanProps.style?.overflowWrap,
          }}
        />
      );
    },
    h1: ({ children, ...props }) => (
      <Heading level={1} {...props}>
        {children}
      </Heading>
    ),
    h2: ({ children, ...props }) => (
      <Heading level={2} {...props}>
        {children}
      </Heading>
    ),
    h3: ({ children, ...props }) => (
      <Heading level={3} {...props}>
        {children}
      </Heading>
    ),
    h4: ({ children, ...props }) => (
      <Heading level={4} {...props}>
        {children}
      </Heading>
    ),
    h5: ({ children, ...props }) => (
      <Heading level={5} {...props}>
        {children}
      </Heading>
    ),
    h6: ({ children, ...props }) => (
      <Heading level={6} {...props}>
        {children}
      </Heading>
    ),
    p: ({ children, ...props }) => <Paragraph {...props}>{children}</Paragraph>,
    blockquote: ({ children, ...props }) => <Blockquote {...props}>{children}</Blockquote>,
    hr: (props) => <HorizontalRule {...props} />,
    ul: ({ children, ...props }) => <List {...props}>{children}</List>,
    ol: ({ children, ...props }) => (
      <List ordered {...props}>
        {children}
      </List>
    ),
    li: ({ children, ...props }) => <ListItem {...props}>{children}</ListItem>,
    a: ({ children, href, ...props }) => {
      const videoLabel =
        typeof children === "string"
          ? children
          : Array.isArray(children)
            ? children.filter((child): child is string | number => typeof child === "string" || typeof child === "number").join("")
            : "";
      const managedVideo = videoLabel.startsWith("video:") ? resolveManagedAttachmentVideoSource(href, attachments) : undefined;
      if (managedVideo) {
        return (
          <video
            src={managedVideo.sourceUrl}
            aria-label={managedVideo.filename}
            className="my-3 inline-block max-h-[32rem] max-w-full rounded-md bg-black align-middle"
            controls
            playsInline
            preload="metadata"
          />
        );
      }
      // In-page anchors (footnote refs/backrefs, heading links) navigate within the memo rather
      // than opening a new tab; everything else is treated as an external link.
      if (typeof href === "string" && href.startsWith("#")) {
        return (
          <AnchorLink href={href} memoName={memoName} parentPage={parentPage} parentScope={parentScope} compact={compact} {...props}>
            {children}
          </AnchorLink>
        );
      }
      return (
        <Link href={href} {...props}>
          {children}
        </Link>
      );
    },
    code: ({ children, ...props }) => <InlineCode {...props}>{children}</InlineCode>,
    iframe: TrustedIframe,
    img: ({ src, ...props }) =>
      typeof src === "string" && src.startsWith("/emoji/") ? (
        <img {...props} src={src} loading="lazy" className="my-1 inline-block max-h-28 max-w-full object-contain align-text-bottom" />
      ) : (
        <Image {...props} data-memo-image="" src={resolveManagedAttachmentImageSource(src, attachments)} />
      ),
    pre: CodeBlock,
    table: ({ children, ...props }) => <Table {...props}>{children}</Table>,
    thead: ({ children, ...props }) => <TableHead {...props}>{children}</TableHead>,
    tbody: ({ children, ...props }) => <TableBody {...props}>{children}</TableBody>,
    tr: ({ children, ...props }) => <TableRow {...props}>{children}</TableRow>,
    th: ({ children, ...props }) => <TableHeaderCell {...props}>{children}</TableHeaderCell>,
    td: ({ children, ...props }) => <TableCell {...props}>{children}</TableCell>,
  };

  return (
    <MarkdownRenderContext.Provider value={rootMarkdownRenderContext}>
      <ReactMarkdown
        remarkPlugins={buildRemarkPlugins(mathRemarkPlugins, emojis)}
        rehypePlugins={buildRehypePlugins(mathRehypePlugins, allowLocalScripts)}
        components={markdownComponents}
      >
        {normalizedContent}
      </ReactMarkdown>
    </MarkdownRenderContext.Provider>
  );
};

const MemoMarkdownRendererComponent = (props: MemoMarkdownRendererProps) => {
  if (!hasMathSyntax(props.content)) {
    return <MemoMarkdownRendererCore {...props} />;
  }

  return (
    <Suspense fallback={<MemoMarkdownRendererCore {...props} />}>
      <MathMarkdownRenderer {...props} />
    </Suspense>
  );
};

const haveEqualResolvedMentions = (left: Set<string>, right: Set<string>) => {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  return Array.from(left).every((username) => right.has(username));
};

export const MemoMarkdownRenderer = memo(
  MemoMarkdownRendererComponent,
  (previous, next) =>
    previous.content === next.content &&
    previous.attachments === next.attachments &&
    previous.memoName === next.memoName &&
    previous.parentPage === next.parentPage &&
    previous.parentScope === next.parentScope &&
    previous.compact === next.compact &&
    previous.standalone === next.standalone &&
    previous.allowLocalScripts === next.allowLocalScripts &&
    haveEqualResolvedMentions(previous.resolvedMentionUsernames, next.resolvedMentionUsernames),
);
