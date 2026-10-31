import { ArrowLeftIcon, ArrowRightIcon, HouseIcon, RotateCwIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { type Translations, useTranslate } from "@/utils/i18n";

const MENUS: Translations[] = ["y2k.menu-file", "y2k.menu-edit", "y2k.menu-view", "y2k.menu-favorites", "y2k.menu-tools", "y2k.menu-help"];

/**
 * Internet Explorer around an article in the Y2K (Windows 98) style: title bar, menu bar, a toolbar whose Back,
 * Forward, Refresh and Home buttons work, and the address bar showing the real address. The menus are scenery.
 * Styled in blog-styles.css; only rendered while that style shows.
 */
export const Win98BrowserChrome = ({ title }: { title: string }) => {
  const t = useTranslate();
  const navigate = useNavigate();
  const location = useLocation();
  const address = `${window.location.origin}${location.pathname}${location.search}`;
  const buttons = [
    { label: t("y2k.back"), icon: ArrowLeftIcon, action: () => navigate(-1) },
    { label: t("y2k.forward"), icon: ArrowRightIcon, action: () => navigate(1) },
    { label: t("y2k.refresh"), icon: RotateCwIcon, action: () => window.location.reload() },
    { label: t("y2k.home"), icon: HouseIcon, action: () => navigate("/") },
  ];

  return (
    <div data-w98-chrome="">
      <div data-w98-titlebar="">
        <span data-w98-title="">{t("y2k.ie-title", { name: title })}</span>
        <span data-w98-window-buttons="" aria-hidden />
      </div>
      <div data-w98-menubar="" aria-hidden>
        {MENUS.map((key) => (
          <span key={key}>{t(key)}</span>
        ))}
      </div>
      <div data-w98-toolbar="">
        {buttons.map(({ label, icon: Icon, action }) => (
          <button key={label} type="button" onClick={action}>
            <Icon aria-hidden />
            {label}
          </button>
        ))}
        <span data-w98-throbber="" aria-hidden />
      </div>
      <div data-w98-address="">
        <span>{t("y2k.address")}</span>
        <span data-w98-field="">
          <span className="truncate">{address}</span>
        </span>
        <span data-w98-go="" aria-hidden>
          {t("y2k.go")}
        </span>
      </div>
    </div>
  );
};

/** The status bar under the page: done loading, in the Internet zone. */
export const Win98StatusBar = () => {
  const t = useTranslate();
  return (
    <div data-w98-statusbar="" aria-hidden>
      <span>{t("y2k.done")}</span>
      <span data-w98-zone="">{t("ui-extra.internet")}</span>
    </div>
  );
};
