/** Keep list, bootstrap and full API records on the same browser-cached image URL. */
export const spaceAvatarUrl = (space: { name: string; avatarUrl: string } | undefined): string | undefined =>
  space?.avatarUrl?.startsWith("data:") ? `/file/${space.name}/avatar` : space?.avatarUrl;
