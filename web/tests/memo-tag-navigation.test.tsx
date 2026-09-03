import { fireEvent, render, screen } from "@testing-library/react";
import ReactMarkdown from "react-markdown";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRehypePlugins, buildRemarkPlugins } from "@/components/MemoContent/pipeline";
import { Tag } from "@/components/MemoContent/Tag";
import { parseFilterQuery } from "@/contexts/MemoFilterContext";

const navigateTo = vi.hoisted(() => vi.fn());
const clearSelectedSpace = vi.hoisted(() => vi.fn());
const addFilter = vi.hoisted(() => vi.fn());
const origin = vi.hoisted(() => ({
  parentPage: "/home" as string,
  parentScope: "all" as "all" | "preserve",
}));

vi.mock("@/hooks/useNavigateTo", () => ({
  default: () => navigateTo,
}));

vi.mock("@/components/MemoView/MemoViewContext", () => ({
  useMemoViewContext: () => origin,
}));

vi.mock("@/contexts/SpaceContext", () => ({
  useSpaceContext: () => ({ clearSelectedSpace }),
}));

vi.mock("@/contexts/MemoFilterContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/MemoFilterContext")>();
  return {
    ...actual,
    useMemoFilterContext: () => ({
      getFiltersByFactor: () => [],
      removeFilter: vi.fn(),
      addFilter,
    }),
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ userTagsSetting: undefined }),
}));

describe("Memo tag navigation", () => {
  beforeEach(() => {
    navigateTo.mockClear();
    clearSelectedSpace.mockClear();
    addFilter.mockClear();
    origin.parentPage = "/home";
    origin.parentScope = "all";
  });

  it.each(["更新", "work", "项目/更新"])("preserves the rendered tag %s when navigating from detail", (tag) => {
    render(
      <MemoryRouter initialEntries={["/memos/parent"]}>
        <ReactMarkdown remarkPlugins={buildRemarkPlugins()} rehypePlugins={buildRehypePlugins()} components={{ span: Tag }}>
          {`#${tag}`}
        </ReactMarkdown>
      </MemoryRouter>,
    );

    const element = screen.getByText(`#${tag}`);
    expect(element).toHaveAttribute("data-tag", tag);
    fireEvent.click(element);
    expect(navigateTo).toHaveBeenCalledOnce();
    const destination = new URL(navigateTo.mock.calls[0][0], "https://memos.test");
    expect(destination.pathname).toBe("/home");
    expect(parseFilterQuery(destination.searchParams.get("filter"))).toEqual([{ factor: "tagSearch", value: tag }]);
  });

  it("filters the list by the rendered tag value", () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <ReactMarkdown remarkPlugins={buildRemarkPlugins()} rehypePlugins={buildRehypePlugins()} components={{ span: Tag }}>
          {"#更新"}
        </ReactMarkdown>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("#更新"));
    expect(addFilter).toHaveBeenCalledWith({ factor: "tagSearch", value: "更新" });
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("switches to All only when a global detail tag enters a collection", () => {
    render(
      <MemoryRouter initialEntries={["/memos/parent"]}>
        <Tag data-tag="work">#work</Tag>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("#work"));

    expect(clearSelectedSpace).toHaveBeenCalledOnce();
    expect(navigateTo).toHaveBeenCalledWith("/home?filter=tagSearch%3Awork");
  });

  it("returns a Profile-origin tag without clearing the remembered Space", () => {
    origin.parentPage = "/u/alice?view=map";

    render(
      <MemoryRouter initialEntries={["/memos/parent"]}>
        <Tag data-tag="work">#work</Tag>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("#work"));

    expect(clearSelectedSpace).not.toHaveBeenCalled();
    expect(navigateTo).toHaveBeenCalledWith("/u/alice?filter=tagSearch%3Awork");
  });
});
