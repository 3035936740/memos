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
import { useTranslate } from "@/utils/i18n";

const titleOf = (memo: Memo, fallback: string) => deriveBlogMemoText(memo.content, memo.property?.title).title || fallback;

/** A pretend shell for the developer style: browse posts, tags and categories with a few commands. */
const TerminalConsole = ({ onClose }: { onClose: () => void }) => {
  const t = useTranslate();

  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const { generalSetting } = useInstance();
  const { setBlogStyle, setStylePack, stylePacks } = useView();
  const { data: recentData } = useMemos({ state: State.NORMAL, orderBy: "create_time desc", pageSize: 10 });
  const { data: stats = [] } = useAllUserStats({ state: State.NORMAL });
  const [lines, setLines] = useState<string[]>([]);
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
        output.push(
          `ls                 ${t("terminal.list")}`,
          `ls tags            ${t("terminal.tags")}`,
          `ls cats            ${t("terminal.categories")}`,
          `cat <n>            ${t("terminal.open")}`,
          `cd ~ | explore     ${t("terminal.home")}`,
          `cd <category>      ${t("terminal.category")}`,
          `cd ..              ${t("terminal.back")}`,
          `grep <words>       ${t("terminal.search")}`,
          `style <name>       ${t("terminal.style")}`,
          `whoami | date      ${t("terminal.who")}`,
          `clear | exit       ${t("terminal.exit")}`,
        );
        break;
      case "ls": {
        if (args[0] === "tags") {
          const tags = Object.entries(mergeTagCounts(...stats.map((item) => item.tagCount))).sort((a, b) => b[1] - a[1]);
          output.push(...(tags.length > 0 ? tags.slice(0, 40).map(([tag, count]) => `#${tag}  (${count})`) : [t("terminal.no-tags")]));
        } else if (args[0] === "cats" || args[0] === "categories") {
          const rows = categories.map((category) => `${category.slug}/  ${category.title}`);
          output.push(...(rows.length > 0 ? rows : [t("terminal.no-categories")]));
        } else if (recent.length === 0) {
          output.push(t("terminal.loading"));
        } else {
          output.push(
            ...recent.map((memo, index) => {
              const date = memo.createTime ? dayjs(timestampDate(memo.createTime)).format("YYYY-MM-DD") : "----------";
              return `${String(index + 1).padStart(2, "0")}  ${date}  ${titleOf(memo, t("memo.blog-untitled"))}`;
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
          output.push(t("terminal.no-post", { command: name, number: args[0] ?? "" }));
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
          output.push(t("terminal.no-directory", { directory: target }));
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
          output.push(t("terminal.usage-search", { command: name }));
        }
        break;
      }
      case "style": {
        const styleName = args[0];
        if (isBlogStyle(styleName)) {
          setBlogStyle(styleName);
          output.push(t("terminal.switched", { style: styleName }));
        } else if (stylePacks.some((pack) => pack.id === styleName)) {
          setStylePack(styleName);
          output.push(t("terminal.switched-pack", { style: styleName }));
        } else {
          output.push(t("terminal.usage-style", { styles: [...BLOG_STYLES, ...stylePacks.map((pack) => pack.id)].join(" | ") }));
        }
        break;
      }
      case "whoami":
        output.push(currentUser?.username ?? "visitor");
        break;
      case "date":
        output.push(new Date().toLocaleString(document.documentElement.lang || undefined));
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
        output.push(t("terminal.not-found", { command: name }));
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
        aria-label={t("ui-extra.terminal")}
        data-terminal-console=""
        className="flex max-h-[70vh] w-full max-w-2xl flex-col border border-border bg-card text-[13px] text-foreground shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          <span>{prompt.slice(0, -2)} tty1</span>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className="transition-colors hover:text-foreground">
            [x]
          </button>
        </div>
        <div ref={outputRef} className="min-h-40 flex-1 overflow-y-auto whitespace-pre-wrap px-3 py-2 leading-6">
          <div>{t("terminal.banner")}</div>
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
              aria-label={t("ui-extra.command")}
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
