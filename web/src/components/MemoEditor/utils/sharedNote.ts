import { cacheService } from "../services/cacheService";

/**
 * Pages shared to Memos: the share target in public/site.webmanifest (the system share sheet on Android, once the
 * site is installed) and the bookmarklet in Settings both open /home with these query parameters.
 */
export const SHARE_PARAMS = { title: "share_title", text: "share_text", url: "share_url" } as const;

export interface SharedNote {
  title: string;
  text: string;
  url: string;
}

/** Selections longer than this are cut, so the bookmarklet's address stays within what browsers accept. */
export const SHARED_TEXT_LIMIT = 4000;

export const readSharedNote = (search: string): SharedNote | undefined => {
  const params = new URLSearchParams(search);
  const note = {
    title: params.get(SHARE_PARAMS.title)?.trim() ?? "",
    text: params.get(SHARE_PARAMS.text)?.trim() ?? "",
    url: params.get(SHARE_PARAMS.url)?.trim() ?? "",
  };
  return note.title || note.text || note.url ? note : undefined;
};

/** The query without the share parameters, keeping anything else; "" when nothing is left. */
export const withoutShareParams = (search: string): string => {
  const params = new URLSearchParams(search);
  for (const name of Object.values(SHARE_PARAMS)) params.delete(name);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
};

const escapeLinkText = (text: string) => text.replace(/[[\]\\]/g, "\\$&");
const escapeLinkTarget = (url: string) => url.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\s/g, "%20");

/** The markdown a shared page becomes: the shared or selected text as a quote, then a link to where it came from. */
export const buildSharedNote = ({ title, text, url }: SharedNote): string => {
  let link = url;
  let quote = text;
  // Many Android apps send the link inside the text instead of as its own field; it is kept once, as the source.
  if (!link) {
    const found = quote.match(/https?:\/\/\S+/);
    if (found) {
      link = found[0];
      quote = quote.replace(found[0], "").trim();
    }
  } else if (quote.includes(link)) {
    quote = quote.replace(link, "").trim();
  }
  // Some apps send the page title as the text too.
  if (quote === title) quote = "";

  const parts: string[] = [];
  if (quote)
    parts.push(
      quote
        .split(/\r?\n/)
        .map((line) => (line.trim() ? `> ${line}` : ">"))
        .join("\n"),
    );
  if (link) parts.push(title ? `[${escapeLinkText(title)}](${escapeLinkTarget(link)})` : link);
  else if (title) parts.push(title);
  return parts.join("\n\n");
};

/**
 * Adds a page shared through the address to the saved draft of the editor with `cacheKey`, after anything already
 * written there, and drops the share parameters from the address so a reload does not add it twice. Call it before
 * that editor reads its draft (its mount effect), e.g. from a layout effect of the page around it.
 */
export const takeSharedNote = (username: string, cacheKey: string) => {
  const shared = readSharedNote(window.location.search);
  if (!shared) return;
  const { pathname, search, hash } = window.location;
  window.history.replaceState(window.history.state, "", `${pathname}${withoutShareParams(search)}${hash}`);
  const note = buildSharedNote(shared);
  if (!note) return;
  const draftKey = cacheService.key(username, cacheKey);
  const draft = cacheService.loadDraft(draftKey);
  const content = draft.content.trim() ? `${draft.content.trimEnd()}\n\n${note}` : note;
  cacheService.saveNow(draftKey, content, draft.attachments);
};

/**
 * A bookmarklet that opens `homeUrl` in a new tab with the current page's title, address and selected text, which
 * takeSharedNote then turns into a draft.
 */
export const buildBookmarklet = (homeUrl: string) => {
  const code = [
    "(()=>{",
    `const u=new URL(${JSON.stringify(homeUrl)});`,
    `const s=String(getSelection()).trim().slice(0,${SHARED_TEXT_LIMIT});`,
    `u.searchParams.set(${JSON.stringify(SHARE_PARAMS.title)},document.title);`,
    `u.searchParams.set(${JSON.stringify(SHARE_PARAMS.url)},location.href);`,
    `if(s)u.searchParams.set(${JSON.stringify(SHARE_PARAMS.text)},s);`,
    `window.open(u.href,"_blank","noopener");`,
    "})()",
  ].join("");
  return `javascript:${encodeURIComponent(code)}`;
};
