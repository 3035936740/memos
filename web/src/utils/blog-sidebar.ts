import { create } from "@bufbuild/protobuf";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getRequestToken, memoServiceClient } from "@/connect";
import { State } from "@/types/proto/api/v1/common_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { ListMemosRequestSchema } from "@/types/proto/api/v1/memo_service_pb";

export interface BlogRecentComment {
  name: string;
  parentName: string;
  content: string;
  creator?: string;
  createTime: number;
}

interface BlogRecentCommentsResponse {
  comments: BlogRecentComment[];
  error?: string;
}

const fetchRecentBlogComments = async (filter?: string): Promise<BlogRecentComment[]> => {
  const token = await getRequestToken();
  const headers = new Headers({ Accept: "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const query = new URLSearchParams({ limit: "4" });
  if (filter) query.set("filter", filter);
  const response = await fetch(`/api/v1/blog/recent-comments?${query.toString()}`, { headers, credentials: "include" });
  if (response.status === 401) return [];
  const payload = (await response.json().catch(() => ({ comments: [] }))) as BlogRecentCommentsResponse;
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload.comments ?? [];
};

export const useRecentBlogComments = (viewerKey: string, filter?: string) =>
  useQuery({
    queryKey: ["blog-sidebar", "recent-comments", viewerKey, filter],
    queryFn: () => fetchRecentBlogComments(filter),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

const listRandomMemoPage = (pageOffset: number, showTotalSize: boolean, filter?: string) =>
  memoServiceClient.listMemos(
    create(ListMemosRequestSchema, {
      state: State.NORMAL,
      orderBy: "create_time desc",
      pageSize: 1,
      pageOffset,
      showTotalSize,
      filter,
    }),
  );

export const useRandomBlogMemo = (viewerKey: string, filter?: string): Memo | undefined => {
  const [randomOffset, setRandomOffset] = useState<number>();
  const { data: countData } = useQuery({
    queryKey: ["blog-sidebar", "random-count", viewerKey, filter],
    queryFn: () => listRandomMemoPage(0, true, filter),
    staleTime: 60_000,
  });
  const totalSize = countData?.totalSize ?? 0;

  useEffect(() => {
    setRandomOffset(totalSize > 0 ? Math.floor(Math.random() * totalSize) : undefined);
  }, [filter, totalSize, viewerKey]);

  const { data } = useQuery({
    queryKey: ["blog-sidebar", "random-memo", viewerKey, filter, randomOffset],
    queryFn: () => listRandomMemoPage(randomOffset ?? 0, false, filter),
    enabled: randomOffset !== undefined,
    staleTime: 60_000,
  });
  return data?.memos[0];
};
