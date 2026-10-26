import { TRAVEL_TAGS } from "./blog-progress";

/** Post tags that act like items: they change how the post itself looks (rain in the card, a cat, a postmark...). */
export type TagItem = "rain" | "cat" | "travel" | "birthday";

const TAG_ITEMS: Record<TagItem, string[]> = {
  rain: ["下雨", "雨", "雨天", "rain", "rainy"],
  cat: ["猫", "猫咪", "喵", "cat", "cats"],
  travel: TRAVEL_TAGS,
  birthday: ["生日", "birthday"],
};

export const tagItemsOf = (tags: string[]): TagItem[] => {
  const lowered = tags.map((tag) => tag.toLowerCase());
  return (Object.keys(TAG_ITEMS) as TagItem[]).filter((item) => TAG_ITEMS[item].some((tag) => lowered.includes(tag)));
};
