import { moderationRequest } from "./content-moderation";

export interface AdminCommentItem {
  name: string;
  parent?: string;
  creator: string;
  content: string;
  createdTs: number;
}

export interface PagedAdminComments {
  items: AdminCommentItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const listAdminComments = (page: number, pageSize = 20, search = "") =>
  moderationRequest<PagedAdminComments>(
    `/api/v1/admin/comments?page=${page}&pageSize=${pageSize}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
  );
