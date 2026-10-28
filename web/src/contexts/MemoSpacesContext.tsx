import { createContext, type ReactNode, useContext, useMemo } from "react";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useBatchSpaces } from "@/hooks/useSpaceQueries";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import type { Space } from "@/types/proto/api/v1/space_service_pb";
import { useSpaceContext } from "./SpaceContext";

const MemoSpacesContext = createContext<ReadonlyMap<string, Space> | undefined>(undefined);

/** One bounded metadata request for all space badges on the rendered page. */
export const MemoSpacesProvider = ({ memos, children }: { memos: readonly Memo[]; children: ReactNode }) => {
  const viewer = useCurrentUser()?.name;
  const names = useMemo(() => [...new Set(memos.map((memo) => memo.space || "").filter(Boolean))], [memos]);
  const query = useBatchSpaces(viewer, names);
  const spaces = useMemo(() => new Map(query.data?.spaces.map((space) => [space.name, space]) ?? []), [query.data]);
  return <MemoSpacesContext.Provider value={spaces}>{children}</MemoSpacesContext.Provider>;
};

export const useMemoSpace = (name: string | undefined) => {
  const page = useContext(MemoSpacesContext);
  const { spaceByName } = useSpaceContext();
  const viewer = useCurrentUser()?.name;
  const known = name ? page?.get(name) || spaceByName.get(name) : undefined;
  const query = useBatchSpaces(viewer, name ? [name] : [], { enabled: !page && !known });
  return known || query.data?.spaces[0];
};
