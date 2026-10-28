import { BookmarkPlusIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { buildBookmarklet } from "@/components/MemoEditor/utils/sharedNote";
import { ROUTES } from "@/router/routes";
import { useTranslate } from "@/utils/i18n";

/** A link to drag to the bookmarks bar; on any page it sends the title, address and selected text to a new draft. */
const BookmarkletLink = () => {
  const t = useTranslate();
  const linkRef = useRef<HTMLAnchorElement>(null);

  // React refuses javascript: addresses in href, so the bookmarklet is set on the element itself.
  useEffect(() => {
    linkRef.current?.setAttribute("href", buildBookmarklet(`${window.location.origin}${ROUTES.HOME}`));
  }, []);

  return (
    <a
      ref={linkRef}
      draggable
      data-bookmarklet=""
      title={t("setting.preference.bookmarklet-drag")}
      // Clicking it here would only open Home; it is meant to be dragged.
      onClick={(event) => event.preventDefault()}
      className="inline-flex cursor-grab items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent active:cursor-grabbing"
    >
      <BookmarkPlusIcon className="size-4 text-primary" />
      {t("setting.preference.bookmarklet-name")}
    </a>
  );
};

export default BookmarkletLink;
