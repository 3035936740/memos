import { toJsonString } from "@bufbuild/protobuf";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pollServiceClient } from "@/connect";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { PollSchema, VoterType } from "@/types/proto/api/v1/memo_service_pb";

const deviceStorageKey = "memos.poll.device-id";

function getDeviceID() {
  const existing = window.localStorage.getItem(deviceStorageKey);
  if (existing) return existing;
  const value = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(deviceStorageKey, value);
  return value;
}

export function usePollQueries(memo: Memo, viewerName?: string) {
  const queryClient = useQueryClient();
  const deviceId = !viewerName && memo.poll?.voterType === VoterType.ANYONE ? (window.localStorage.getItem(deviceStorageKey) ?? "") : "";
  // Include the latest memo poll so SSE memo refreshes also refresh visibility settings.
  const queryKey = ["memos", "poll", memo.name, viewerName ?? "", deviceId, memo.poll ? toJsonString(PollSchema, memo.poll) : ""] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => pollServiceClient.getMemoPoll({ name: memo.name, deviceId }),
    enabled: Boolean(memo.poll),
  });
  const vote = useMutation({
    mutationFn: (optionIds: string[]) =>
      pollServiceClient.voteMemo({
        name: memo.name,
        optionIds,
        deviceId: !viewerName && memo.poll?.voterType === VoterType.ANYONE ? getDeviceID() : "",
      }),
    onSuccess: (poll) => queryClient.setQueryData(queryKey, poll),
  });
  return { poll: query.data ?? memo.poll, vote };
}
