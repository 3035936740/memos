import { getAccessToken } from "@/auth-state";

/**
 * Moving in from another blog (docs/style-packs-and-import-api.md): authenticated REST JSON endpoints, used directly
 * with fetch because the archives can be far larger than Connect's base64 uploads like.
 */

export type ImportFormat = "markdown" | "wordpress";
export type ImportVisibility = "PRIVATE" | "PROTECTED" | "PUBLIC";
export type ImportJobState = "running" | "completed" | "cancelled" | "failed" | "interrupted";

export interface ImportPost {
  id: string;
  title: string;
  created: string;
  updated: string;
  tags: string[];
  categories: string[];
  category: string;
  draft: boolean;
  private: boolean;
  visibility: string;
  slug?: string;
  sourceUrl?: string;
  changes: string[];
  localImages: number;
  externalImages: number;
  skipReason?: string;
  error?: string;
  state: string;
  memo?: string;
}

export interface ImportPreview {
  id: string;
  source: string;
  format: ImportFormat;
  space?: string;
  expiresAt: string;
  posts: ImportPost[];
}

export interface ImportReport {
  entries: ImportPost[];
  imported: number;
  skipped: number;
  failed: number;
}

export interface ImportJob {
  id: string;
  state: ImportJobState;
  source: string;
  createdTs: number;
  updatedTs: number;
  cancelRequested: boolean;
  report?: ImportReport | null;
}

/** A failed request, with the server's own words when it gave any. */
export class ImportRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = getAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      message = body.error || body.message || message;
    } catch {
      // Not JSON; the status says enough.
    }
    throw new ImportRequestError(message, response.status);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
};

// Go sends empty lists as null; the UI expects arrays.
const normalizePost = (post: ImportPost): ImportPost => ({
  ...post,
  tags: post.tags ?? [],
  categories: post.categories ?? [],
  changes: post.changes ?? [],
});

const normalizeJob = (job: ImportJob): ImportJob =>
  job.report ? { ...job, report: { ...job.report, entries: (job.report.entries ?? []).map(normalizePost) } } : job;

const jsonBody = (body: unknown): RequestInit => ({
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json" },
});

/**
 * Uploads an export for a dry run; nothing is written until runImport. `source` names the old blog; the same name
 * must be used every time, since it and each post's original id are what skip posts imported before.
 */
export const previewImport = async (file: File, source: string, format?: ImportFormat, space?: string): Promise<ImportPreview> => {
  const form = new FormData();
  form.append("file", file);
  if (source.trim()) form.append("source", source.trim());
  if (format) form.append("format", format);
  const scope = space ? `?${new URLSearchParams({ space })}` : "";
  const preview = await request<ImportPreview>(`/api/v1/imports/preview${scope}`, { method: "POST", body: form });
  return { ...preview, posts: (preview.posts ?? []).map(normalizePost) };
};

export const runImport = async (body: { previewId: string; selectedIds: string[]; visibility: ImportVisibility; space?: string }) =>
  normalizeJob(await request<ImportJob>("/api/v1/imports/run", { method: "POST", ...jsonBody(body) }));

export const getImportJob = async (id: string) => normalizeJob(await request<ImportJob>(`/api/v1/imports/${encodeURIComponent(id)}`));

export const cancelImport = (id: string) => request<void>(`/api/v1/imports/${encodeURIComponent(id)}`, { method: "DELETE" });

export const getImportSettings = () => request<{ maxUploadMb: number }>("/api/v1/admin/import-settings");

export const saveImportSettings = (maxUploadMb: number) =>
  request<{ maxUploadMb: number }>("/api/v1/admin/import-settings", { method: "PUT", ...jsonBody({ maxUploadMb }) });

/** The admin's upload limit bounds, in MiB. */
export const IMPORT_LIMIT_RANGE = { min: 1, max: 250, fallback: 100 } as const;

/** Posts ticked at first: everything the server did not already mark to skip. */
export const defaultSelection = (posts: readonly ImportPost[]) => posts.filter((post) => !post.skipReason).map((post) => post.id);

export const isFinishedImport = (state: string | undefined) => !!state && state !== "running";

/** Guesses the format from the file name, as the server does; undefined lets it decide. */
export const formatOfFile = (name: string): ImportFormat | undefined => {
  const lower = name.toLowerCase();
  if (lower.endsWith(".zip")) return "markdown";
  if (lower.endsWith(".xml")) return "wordpress";
  return undefined;
};
