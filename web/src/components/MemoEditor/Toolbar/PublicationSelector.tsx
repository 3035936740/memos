import { CalendarClockIcon, CheckIcon, FilePenLineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslate } from "@/utils/i18n";

interface Props {
  draft: boolean;
  publishTime?: Date;
  onChange: (value: { draft: boolean; publishTime?: Date }) => void;
}

const toInputValue = (value?: Date) => {
  if (!value) return "";
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

const PublicationSelector = ({ draft, publishTime, onChange }: Props) => {
  const t = useTranslate();
  const scheduled = Boolean(publishTime && publishTime.getTime() > Date.now());
  return (
    <Popover>
      <PopoverTrigger render={<Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-muted-foreground" />}>
        {scheduled ? <CalendarClockIcon className="size-4" /> : <FilePenLineIcon className="size-4" />}
        <span className="hidden sm:inline">
          {scheduled ? t("memo.publication.scheduled") : draft ? t("memo.publication.draft") : t("memo.publication.published")}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <button
          type="button"
          className="flex w-full items-start gap-2 rounded-md p-2 text-left hover:bg-accent"
          onClick={() => onChange({ draft: !draft, publishTime: undefined })}
        >
          <FilePenLineIcon className="mt-0.5 size-4" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{t("memo.publication.save-draft")}</span>
            <span className="block text-xs text-muted-foreground">{t("memo.publication.draft-description")}</span>
          </span>
          {draft && !scheduled ? <CheckIcon className="size-4" /> : null}
        </button>
        <div className="space-y-1.5 border-t pt-3">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="memo-publish-time">
            {t("memo.publication.publish-time")}
          </label>
          <Input
            id="memo-publish-time"
            type="datetime-local"
            min={toInputValue(new Date())}
            value={toInputValue(publishTime)}
            onChange={(event) => {
              const next = event.target.value ? new Date(event.target.value) : undefined;
              onChange({ draft: Boolean(next) || draft, publishTime: next });
            }}
          />
          {publishTime ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onChange({ draft, publishTime: undefined })}
            >
              {t("common.clear")}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default PublicationSelector;
