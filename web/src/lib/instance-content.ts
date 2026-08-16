export interface InstanceNavigationItem {
  id: string;
  label: string;
  path: string;
  icon?: string;
  iconUrl?: string;
  access?: InstanceContentAccess;
}

export interface InstanceMarkdownPage {
  slug: string;
  title: string;
  markdown: string;
  access?: InstanceContentAccess;
  icon?: string;
  iconUrl?: string;
}

export interface InstanceMemoCategory {
  slug: string;
  title: string;
  description?: string;
  access?: InstanceContentAccess;
}

export type InstanceContentAccess = "public" | "authenticated" | "admin";

const parseArray = <T>(value: string): T[] => {
  if (!value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

export const parseInstanceNavigation = (value: string) => parseArray<InstanceNavigationItem>(value);
export const parseInstancePages = (value: string) => parseArray<InstanceMarkdownPage>(value);
export const parseInstanceCategories = (value: string) => parseArray<InstanceMemoCategory>(value);

export const canAccessInstanceContent = (access: InstanceContentAccess | undefined, user: { role?: number } | undefined): boolean => {
  if (!access || access === "public") return true;
  if (!user) return false;
  return access === "authenticated" || user.role === 2;
};
