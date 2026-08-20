export const ROUTES = {
  HOME: "/home",
  ABOUT: "/about",
  ATTACHMENTS: "/attachments",
  INBOX: "/inbox",
  ARCHIVED: "/archived",
  VIEWS: "/views",
  SETTING: "/setting",
  READ_LATER: "/read-later",
  EXPLORE: "/explore",
  AUTH: "/auth",
  AUTH_SIGNUP: "/auth/signup",
  AUTH_ADMIN: "/auth/admin",
  AUTH_CALLBACK: "/auth/callback",
  SHARED_MEMO: "/memos/shares",
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteKey];
