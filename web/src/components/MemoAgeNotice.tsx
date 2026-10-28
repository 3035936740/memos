import { timestampDate } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import { HourglassIcon } from "lucide-react";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import { notableRevision, outdatedYears } from "@/utils/memo-age";

/**
 * A quiet note above an old article that some of it may be out of date, with its last real revision. Posts tagged
 * #长期有效 or #evergreen never show it.
 */
const MemoAgeNotice = ({ memo }: { memo: Memo }) => {
  const t = useTranslate();
  const written = memo.createTime ? timestampDate(memo.createTime) : undefined;
  const years = outdatedYears(written, memo.tags);
  if (years === undefined) return null;
  const revised = notableRevision(written, memo.updateTime ? timestampDate(memo.updateTime) : undefined);

  return (
    <p
      role="note"
      data-memo-age-notice=""
      data-sb-subcard=""
      className="mb-3 flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
    >
      <HourglassIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        {t("memo.age-notice.text", { count: years })}
        {revised && ` ${t("memo.age-notice.revised", { date: dayjs(revised).format("YYYY-MM-DD") })}`}
      </span>
    </p>
  );
};

export default MemoAgeNotice;
