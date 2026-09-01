import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Archived from "@/pages/Archived";
import Explore from "@/pages/Explore";
import { Visibility } from "@/types/proto/api/v1/memo_service_pb";

const state = vi.hoisted(() => ({
  currentUser: { name: "users/test" } as { name: string } | undefined,
  selectedSpaceName: undefined as string | undefined,
  memoFilter: undefined as string | undefined,
  listProps: [] as Array<Record<string, unknown>>,
  memoViewProps: [] as Array<Record<string, unknown>>,
  filterOptions: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/components/MemoView", () => ({
  default: (props: Record<string, unknown>) => {
    state.memoViewProps.push(props);
    return <div />;
  },
}));

vi.mock("@/components/PagedMemoList", () => ({
  default: (props: Record<string, unknown>) => {
    state.listProps.push(props);
    const renderLeading = props.renderLeading as ((options: { useGrid: boolean }) => React.ReactNode) | undefined;
    const renderer = props.renderer as
      | ((memo: { name: string; space: string }, options: { compact: boolean }) => React.ReactNode)
      | undefined;
    return (
      <div>
        {renderLeading?.({ useGrid: false })}
        {renderer?.({ name: "memos/test", space: "spaces/product" }, { compact: false })}
      </div>
    );
  },
  getMemoKey: (memo: { name: string }) => memo.name,
}));

vi.mock("@/contexts/SpaceContext", () => ({
  useSpaceContext: () => ({ selectedSpaceName: state.selectedSpaceName, memoFilter: state.memoFilter }),
}));

vi.mock("@/components/MemoEditor", () => ({
  default: () => null,
}));

vi.mock("@/components/GuestMemoComposer", () => ({
  default: () => null,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isUserSettingsInitialized: true }),
}));

vi.mock("@/contexts/MemoFilterContext", () => ({
  useMemoFilterContext: () => ({ filters: [] }),
}));

vi.mock("@/hooks", () => ({
  useMemoFilters: (options: Record<string, unknown>) => {
    state.filterOptions.push(options);
    return "filter";
  },
  useMemoSorting: () => ({ listSort: undefined, orderBy: "create_time desc" }),
}));

vi.mock("@/hooks/useCurrentUser", () => ({
  default: () => state.currentUser,
}));

describe("Memo feed collection scope", () => {
  beforeEach(() => {
    state.currentUser = { name: "users/test" };
    state.selectedSpaceName = undefined;
    state.memoFilter = undefined;
    state.listProps = [];
    state.memoViewProps = [];
    state.filterOptions = [];
  });

  it("uses the All collection without a Space filter for Explore and the user archive", () => {
    render(
      <>
        <Explore />
        <Archived />
      </>,
    );

    expect(state.listProps).toHaveLength(2);
    expect(state.listProps[0]).toMatchObject({ contextFilter: undefined });
    expect(state.listProps[1]).not.toHaveProperty("contextFilter");
    expect(state.filterOptions[0]).toMatchObject({
      visibilities: [Visibility.PUBLIC, Visibility.PROTECTED, Visibility.SPACE],
    });
    expect(state.memoViewProps).toEqual([expect.objectContaining({ showSpace: true }), expect.objectContaining({ showSpace: true })]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Archived");
  });

  it("uses the selected Space filter and includes its member audience in Explore", () => {
    state.selectedSpaceName = "spaces/product";
    state.memoFilter = 'space == "spaces/product"';
    render(<Explore />);

    expect(state.listProps[0]).toMatchObject({ contextFilter: 'space == "spaces/product"' });
    expect(state.filterOptions[0]).toMatchObject({
      visibilities: [Visibility.PUBLIC, Visibility.PROTECTED, Visibility.SPACE],
    });
    expect(state.memoViewProps[0]).toMatchObject({ showSpace: false });
  });

  it("includes the Space audience for a visitor inside a selected public Space", () => {
    state.currentUser = undefined;
    state.selectedSpaceName = "spaces/product";
    state.memoFilter = 'space == "spaces/product"';
    render(<Explore />);

    expect(state.filterOptions[0]).toMatchObject({
      visibilities: [Visibility.PUBLIC, Visibility.SPACE],
    });
  });

  it("keeps Archived independent of a remembered Space", () => {
    state.selectedSpaceName = "spaces/product";
    state.memoFilter = 'space == "spaces/product"';
    render(<Archived />);

    expect(state.listProps[0]).not.toHaveProperty("contextFilter");
    expect(state.memoViewProps[0]).toMatchObject({ showSpace: true });
  });
});
