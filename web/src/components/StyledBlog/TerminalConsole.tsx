import { timestampDate } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deriveBlogMemoText } from "@/components/BlogMemoView";
import { useInstance } from "@/contexts/InstanceContext";
import { stringifyFilters } from "@/contexts/MemoFilterContext";
import { useView } from "@/contexts/ViewContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useMemos } from "@/hooks/useMemoQueries";
import { useAllUserStats } from "@/hooks/useUserQueries";
import { canAccessInstanceContent, parseInstanceCategories } from "@/lib/instance-content";
import { mergeTagCounts } from "@/lib/tag";
import { ROUTES } from "@/router/routes";
import { State } from "@/types/proto/api/v1/common_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { BLOG_STYLES, isBlogStyle } from "@/utils/blog-style";

const BANNER = ["memos tty  —  type `help` for commands, Esc to leave", ""];

const HELP = [
  "ls                 list the latest posts",
  "ls tags            list tags by use",
  "ls cats            list categories",
  "cat <n>            open post n from `ls`",
  "cd ~ | explore     go home or to explore",
  "cd <category>      open a category",
  "cd ..              go back",
  "grep <words>       search posts",
  "style <name>       switch the Blog 2 style",
  "whoami | date      who and when",
  "clear | exit       wipe the screen | leave",
];

const titleOf = (memo: Memo) => deriveBlogMemoText(memo.content, memo.property?.title).title || "(untitled)";

/** A pretend shell for the developer style: browse posts, tags and categories with a few commands. */
const TerminalConsole = ({ onClose }: { onClose: () => void }) => {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const { generalSetting } = useInstance();
  const { setBlogStyle, setStylePack, stylePacks } = useView();
  const { data: recentData } = useMemos({ state: State.NORMAL, orderBy: "create_time desc", pageSize: 10 });
  const { data: stats = [] } = useAllUserStats({ state: State.NORMAL });
  const [lines, setLines] = useState<string[]>(BANNER);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyCursor, setHistoryCursor] = useState<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const prompt = `${currentUser?.username ?? "visitor"}@memos:~$`;
  const recent = recentData?.memos ?? [];
  const categories = parseInstanceCategories(generalSetting.memoCategoriesJson).filter((category) =>
    canAccessInstanceContent(category.access, currentUser),
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the newest output in view.
  useEffect(() => {
    const output = outputRef.current;
    if (output && lines.length > 0) output.scrollTop = output.scrollHeight;
  }, [lines]);

  const run = (raw: string) => {
    const command = raw.trim();
    const [name = "", ...args] = command.split(/\s+/);
    const output: string[] = [];
    let leave = false;

    switch (name) {
      case "":
        break;
      case "help":
        output.push(...HELP);
        break;
      case "ls": {
        if (args[0] === "tags") {
          const tags = Object.entries(mergeTagCounts(...stats.map((item) => item.tagCount))).sort((a, b) => b[1] - a[1]);
          output.push(...(tags.length > 0 ? tags.slice(0, 40).map(([tag, count]) => `#${tag}  (${count})`) : ["(no tags)"]));
        } else if (args[0] === "cats" || args[0] === "categories") {
          const rows = categories.map((category) => `${category.slug}/  ${category.title}`);
          output.push(...(rows.length > 0 ? rows : ["(no categories)"]));
        } else if (recent.length === 0) {
          output.push("(still loading, try again in a moment)");
        } else {
          output.push(
            ...recent.map((memo, index) => {
              const date = memo.createTime ? dayjs(timestampDate(memo.createTime)).format("YYYY-MM-DD") : "----------";
              return `${String(index + 1).padStart(2, "0")}  ${date}  ${titleOf(memo)}`;
            }),
          );
        }
        break;
      }
      case "cat":
      case "open": {
        const memo = recent[Number(args[0]) - 1];
        if (memo) {
          navigate(`/${memo.name}`);
          leave = true;
        } else {
          output.push(`${name}: ${args[0] ?? ""}: no such post (run \`ls\` first)`);
        }
        break;
      }
      case "cd": {
        const target = (args[0] ?? "~").replace(/\/$/, "");
        const category = categories.find((item) => item.slug === target);
        if (target === "~" || target === "home") {
          navigate(currentUser ? "/" : ROUTES.EXPLORE);
          leave = true;
        } else if (target === "explore") {
          navigate(ROUTES.EXPLORE);
          leave = true;
        } else if (target === "..") {
          navigate(-1);
          leave = true;
        } else if (category) {
          navigate(`/categories/${category.slug}`);
          leave = true;
        } else {
          output.push(`cd: no such directory: ${target}`);
        }
        break;
      }
      case "grep":
      case "search": {
        const words = args.join(" ");
        if (words) {
          navigate({ pathname: ROUTES.EXPLORE, search: `?filter=${stringifyFilters([{ factor: "contentSearch", value: words }])}` });
          leave = true;
        } else {
          output.push(`usage: ${name} <words>`);
        }
        break;
      }
      case "style": {
        const styleName = args[0];
        if (isBlogStyle(styleName)) {
          setBlogStyle(styleName);
          output.push(`style: switched to ${styleName}`);
        } else if (stylePacks.some((pack) => pack.id === styleName)) {
          setStylePack(styleName);
          output.push(`style: switched to ${styleName} (style pack)`);
        } else {
          output.push(`usage: style <${[...BLOG_STYLES, ...stylePacks.map((pack) => pack.id)].join(" | ")}>`);
        }
        break;
      }
      case "whoami":
        output.push(currentUser?.username ?? "visitor");
        break;
      case "date":
        output.push(new Date().toString());
        break;
      case "clear":
        setLines([]);
        setInput("");
        return;
      case "exit":
      case "quit":
        onClose();
        return;
      default:
        output.push(`${name}: command not found`);
    }

    setLines((previous) => [...previous, `${prompt} ${command}`, ...output]);
    if (command) setHistory((previous) => [...previous, command]);
    setHistoryCursor(undefined);
    setInput("");
    if (leave) onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      run(input);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowUp" && history.length > 0) {
      event.preventDefault();
      const cursor = historyCursor === undefined ? history.length - 1 : Math.max(0, historyCursor - 1);
      setHistoryCursor(cursor);
      setInput(history[cursor]);
    } else if (event.key === "ArrowDown" && historyCursor !== undefined) {
      event.preventDefault();
      const cursor = historyCursor + 1;
      setHistoryCursor(cursor < history.length ? cursor : undefined);
      setInput(cursor < history.length ? history[cursor] : "");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[12vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Terminal"
        data-terminal-console=""
        className="flex max-h-[70vh] w-full max-w-2xl flex-col border border-border bg-card text-[13px] text-foreground shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          <span>{prompt.slice(0, -2)} tty1</span>
          <button type="button" aria-label="Close" onClick={onClose} className="transition-colors hover:text-foreground">
            [x]
          </button>
        </div>
        <div ref={outputRef} className="min-h-40 flex-1 overflow-y-auto whitespace-pre-wrap px-3 py-2 leading-6">
          {lines.map((line, index) => (
            <div key={`${index}-${line}`}>{line || " "}</div>
          ))}
          <label className="flex items-center gap-2">
            <span data-terminal-prompt="" className="shrink-0">
              {prompt}
            </span>
            <input
              ref={inputRef}
              value={input}
              aria-label="Command"
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              className="min-w-0 flex-1 bg-transparent caret-primary outline-none"
            />
          </label>
        </div>
      </div>
    </div>
  );
};

export default TerminalConsole;
