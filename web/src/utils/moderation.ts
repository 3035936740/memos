import { moderationRequest } from "./content-moderation";

export type ModerationTargetType = "ARTICLE" | "COMMENT" | "USER";

export interface ModerationItem {
  targetType: ModerationTargetType;
  targetId: number;
  targetName: string;
  title: string;
  creator?: string;
  count: number;
  reason?: string;
  createTime: number;
}

export interface PagedModerationItems {
  items: ModerationItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ModerationSecuritySetting {
  commentReportThreshold: number;
  articleReportThreshold: number;
  userReportThreshold: number;
  userAutoBanInitialDays: number;
  publishCooldownSeconds: number;
}

export interface UserBanInfo {
  active: boolean;
  permanent: boolean;
  expiresTime: number;
  strikeCount: number;
  source: "MANUAL" | "AUTO" | "";
}

export const reportTarget = (targetType: ModerationTargetType, targetName: string, reason = "") =>
  moderationRequest<{ count: number }>("/api/v1/moderation/reports", {
    method: "POST",
    body: JSON.stringify({ targetType, targetName, reason }),
  });
export const listReports = (page: number, pageSize = 20, targetType = "") =>
  moderationRequest<PagedModerationItems>(
    `/api/v1/admin/moderation/reports?page=${page}&pageSize=${pageSize}${targetType ? `&targetType=${targetType}` : ""}`,
  );
export const listQuarantine = (page: number, pageSize = 20, targetType = "") =>
  moderationRequest<PagedModerationItems>(
    `/api/v1/admin/moderation/quarantine?page=${page}&pageSize=${pageSize}${targetType ? `&targetType=${targetType}` : ""}`,
  );
export const setReportCount = (item: ModerationItem, count: number) =>
  moderationRequest<{ count: number }>(`/api/v1/admin/moderation/reports/${item.targetType}/${item.targetId}/count`, {
    method: "PUT",
    body: JSON.stringify({ count }),
  });
export const restoreQuarantine = (item: ModerationItem) =>
  moderationRequest<void>(`/api/v1/admin/moderation/quarantine/${item.targetType}/${item.targetId}/restore`, { method: "POST" });
export const getModerationSecurity = () => moderationRequest<ModerationSecuritySetting>("/api/v1/admin/moderation/security");
export const saveModerationSecurity = (setting: ModerationSecuritySetting) =>
  moderationRequest<ModerationSecuritySetting>("/api/v1/admin/moderation/security", { method: "PUT", body: JSON.stringify(setting) });

const moderationUserReference = (name: string) => encodeURIComponent(name.startsWith("users/") ? name.slice("users/".length) : name);

export const getUserBan = (userName: string) =>
  moderationRequest<UserBanInfo>(`/api/v1/admin/users/${moderationUserReference(userName)}/ban`);
export const banUser = (userName: string, days?: number) =>
  moderationRequest<UserBanInfo>(`/api/v1/admin/users/${moderationUserReference(userName)}/ban`, {
    method: "POST",
    body: JSON.stringify(days === undefined ? {} : { days }),
  });
export const unbanUser = (userName: string) =>
  moderationRequest<void>(`/api/v1/admin/users/${moderationUserReference(userName)}/unban`, { method: "POST" });

export const getBookmark = (uid: string) => moderationRequest<{ saved: boolean }>(`/api/v1/bookmarks/${uid}`);
export const saveBookmark = (uid: string) => moderationRequest<void>(`/api/v1/bookmarks/${uid}`, { method: "PUT" });
export const deleteBookmark = (uid: string) => moderationRequest<void>(`/api/v1/bookmarks/${uid}`, { method: "DELETE" });
export const listBookmarks = (page: number, pageSize = 20) =>
  moderationRequest<PagedModerationItems>(`/api/v1/bookmarks?page=${page}&pageSize=${pageSize}`);
