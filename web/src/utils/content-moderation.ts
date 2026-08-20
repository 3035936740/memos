import { getRequestToken } from "@/connect";

const BLOCKED_WORDS_ENDPOINT = "/api/v1/admin/blocked-words";

export interface BlockedWordsSetting {
  count: number;
  sourceType?: "manual" | "file" | "url";
  sourceName?: string;
  sourceUrl?: string;
  updatedAt?: string;
}

interface ModerationErrorResponse {
  error?: string;
}

export const moderationRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = await getRequestToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  const payload = (await response.json().catch(() => ({}))) as T & ModerationErrorResponse;
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
};

export const getBlockedWordsSetting = () => moderationRequest<BlockedWordsSetting>(BLOCKED_WORDS_ENDPOINT);

export const replaceBlockedWords = (content: string, sourceType: "manual" | "file", sourceName = "") =>
  moderationRequest<BlockedWordsSetting>(BLOCKED_WORDS_ENDPOINT, {
    method: "PUT",
    body: JSON.stringify({ content, sourceType, sourceName }),
  });

export const importBlockedWordsFromURL = (url: string) =>
  moderationRequest<BlockedWordsSetting>(`${BLOCKED_WORDS_ENDPOINT}/import`, {
    method: "POST",
    body: JSON.stringify({ url }),
  });

export const clearBlockedWords = () =>
  moderationRequest<BlockedWordsSetting>(BLOCKED_WORDS_ENDPOINT, {
    method: "DELETE",
  });
