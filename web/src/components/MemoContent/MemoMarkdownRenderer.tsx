import type { Element } from "hast";
import { type ComponentProps, memo, type ReactNode, Suspense, useMemo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { buildRehypePlugins, buildRemarkPlugins } from "@/components/MemoContent/pipeline";
import { tagStyles } from "@/lib/markdownStyles";
import { cn } from "@/lib/utils";
import { isMentionElement, isTagElement, isTaskListItemElement } from "@/types/markdown";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { useEmojiPacks } from "@/utils/emoji";
import { lazyWithReload } from "@/utils/lazy";
import { resolveManagedAttachmentImageSource } from "@/utils/managed-attachment";
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
  /** Whether the memo is rendered as a collapsed feed card. */
  compact?: boolean;
  /** Render outside MemoViewContext, for instance pages and editor previews. */
  standalone?: boolean;
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

export const MemoMarkdownRendererCore = ({
  content,
  attachments = [],
  resolvedMentionUsernames,
  memoName,
  compact,
  standalone = false,
  mathRemarkPlugins = [],
  mathRehypePlugins = [],
}: MemoMarkdownRendererCoreProps) => {
  const { data: emojiGroups = [] } = useEmojiPacks();
  const emojis = useMemo(() => emojiGroups.flatMap((group) => group.emojis), [emojiGroups]);
  const markdownComponents: Components = {
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
      return <span {...spanProps} />;
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
      // In-page anchors (footnote refs/backrefs, heading links) navigate within the memo rather
      // than opening a new tab; everything else is treated as an external link.
      if (typeof href === "string" && href.startsWith("#")) {
        return (
          <AnchorLink href={href} memoName={memoName} compact={compact} {...props}>
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
        <Image {...props} src={resolveManagedAttachmentImageSource(src, attachments)} />
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
        rehypePlugins={buildRehypePlugins(mathRehypePlugins)}
        components={markdownComponents}
      >
        {content}
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
    previous.compact === next.compact &&
    previous.standalone === next.standalone &&
    haveEqualResolvedMentions(previous.resolvedMentionUsernames, next.resolvedMentionUsernames),
);
