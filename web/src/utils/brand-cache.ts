/** Presentation metadata only. Cached brands never grant access to a Space. */
export interface InstanceBrand {
  title: string;
  description: string;
  logoUrl: string;
  defaultAvatarUrl: string;
}

export interface SpaceBrand {
  name: string;
  urlSlug: string;
  title: string;
  avatarUrl: string;
}

const INSTANCE_KEY = "memos-instance-branding-v1";
const SPACES_KEY = "memos-space-branding-v1";
const SPACE_CACHE_LIMIT = 40;

const read = (key: string): unknown => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return undefined;
  }
};

const write = (key: string, value: unknown) => {
  try {
    const json = JSON.stringify(value);
    if (localStorage.getItem(key) !== json) localStorage.setItem(key, json);
  } catch {
    // Private browsing, quotas and disabled storage must not break navigation.
  }
};

export const readInstanceBrand = (): InstanceBrand | undefined => {
  const value = read(INSTANCE_KEY) as InstanceBrand | null;
  return value && [value.title, value.description, value.logoUrl, value.defaultAvatarUrl].every((field) => typeof field === "string")
    ? value
    : undefined;
};

export const rememberInstanceBrand = (profile: Partial<InstanceBrand> | undefined): InstanceBrand => {
  const brand = {
    title: profile?.title || "Memos Plus",
    logoUrl: profile?.logoUrl || "/logo.svg",
    description: profile?.description || "",
    defaultAvatarUrl: profile?.defaultAvatarUrl || "",
  };
  write(INSTANCE_KEY, brand);
  return brand;
};

type SpaceEntry = SpaceBrand & { viewer: string };
const spaceEntries = (): SpaceEntry[] => {
  const value = read(SPACES_KEY);
  return Array.isArray(value)
    ? value
        .filter(
          (entry): entry is SpaceEntry =>
            entry && [entry.viewer, entry.name, entry.urlSlug, entry.title, entry.avatarUrl].every((field) => typeof field === "string"),
        )
        .slice(-SPACE_CACHE_LIMIT)
    : [];
};

export const readSpaceBrand = (name: string, viewer?: string): SpaceBrand | undefined =>
  spaceEntries().find((entry) => entry.viewer === (viewer || "") && (entry.name === name || `spaces/${entry.urlSlug}` === name));

export const rememberSpaceBrand = (space: SpaceBrand, viewer?: string) => {
  const entries = spaceEntries().filter((entry) => entry.viewer !== (viewer || "") || entry.name !== space.name);
  entries.push({
    viewer: viewer || "",
    name: space.name,
    urlSlug: space.urlSlug || "",
    title: space.title || "",
    // Cache the URL, not potentially megabytes of an inline avatar.
    avatarUrl: space.avatarUrl?.startsWith("data:") ? `/file/${space.name}/avatar` : space.avatarUrl || "",
  });
  write(SPACES_KEY, entries.slice(-SPACE_CACHE_LIMIT));
};
