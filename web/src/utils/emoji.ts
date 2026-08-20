import { useQuery } from "@tanstack/react-query";
import { getRequestToken } from "@/connect";

export interface CustomEmoji {
  id: number;
  name: string;
  token: string;
  url: string;
  type: string;
  size: number;
  storageType: "DATABASE" | "LOCAL" | "S3" | "EXTERNAL";
}

export interface EmojiGroup {
  id: number;
  name: string;
  emojis: CustomEmoji[];
}

interface EmojiCatalogResponse {
  groups: EmojiGroup[];
}

interface EmojiErrorResponse {
  error?: string;
}

const emojiRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = await getRequestToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as T & EmojiErrorResponse;
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
};

export const getEmojiPacks = async (): Promise<EmojiGroup[]> => {
  const response = await emojiRequest<EmojiCatalogResponse>("/api/v1/emojis");
  return response.groups ?? [];
};

export const useEmojiPacks = () =>
  useQuery({
    queryKey: ["emoji-packs"],
    queryFn: getEmojiPacks,
    staleTime: 5 * 60 * 1000,
  });

export const createEmojiGroup = (name: string) =>
  emojiRequest<EmojiGroup>("/api/v1/admin/emoji-groups", { method: "POST", body: JSON.stringify({ name }) });

export const deleteEmojiGroup = (id: number) => emojiRequest<void>(`/api/v1/admin/emoji-groups/${id}`, { method: "DELETE" });

export const createEmoji = (input: { groupId: number; name: string; file?: File; url?: string }) => {
  const body = new FormData();
  body.set("groupId", String(input.groupId));
  body.set("name", input.name);
  if (input.file) body.set("file", input.file);
  if (input.url) body.set("url", input.url);
  return emojiRequest<CustomEmoji>("/api/v1/admin/emojis", { method: "POST", body });
};

export const deleteEmoji = (id: number) => emojiRequest<void>(`/api/v1/admin/emojis/${id}`, { method: "DELETE" });
