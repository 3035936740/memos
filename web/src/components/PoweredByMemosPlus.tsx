import { useInstance } from "@/contexts/InstanceContext";
import { useTranslate } from "@/utils/i18n";

/** Where Memos Plus lives; the README and the "powered by" link point here. */
export const MEMOS_PLUS_REPOSITORY = "https://github.com/3035936740/memos-plus";

/**
 * A small "powered by Memos Plus" line under the blog sidebar, the way self-hosted blogs have always told readers
 * what they run on. Administrators turn it off in Settings → System, which hides [data-powered-by] in custom CSS.
 */
const PoweredByMemosPlus = () => {
  const t = useTranslate();
  const { generalSetting } = useInstance();
  if (generalSetting.showPoweredBy === false) return null;
  return (
    <p data-powered-by="" className="px-1 text-center text-[11px] text-muted-foreground">
      {t("memos-plus.powered-by-prefix")}
      <a href={MEMOS_PLUS_REPOSITORY} target="_blank" rel="noopener" className="font-medium hover:text-foreground hover:underline">
        Memos Plus
      </a>
      {t("memos-plus.powered-by-suffix")}
    </p>
  );
};

export default PoweredByMemosPlus;
