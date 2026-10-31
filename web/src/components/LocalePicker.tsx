import { CheckIcon, ChevronDownIcon, GlobeIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { locales } from "@/i18n";
import { cn } from "@/lib/utils";
import { getLocaleDisplayName, localeMatchesSearch, useTranslate } from "@/utils/i18n";

const MISSING_LANGUAGE_FEEDBACK_URL = "https://github.com/3035936740/memos-plus";

interface LocaleSearchListProps {
  value: Locale;
  onChange: (locale: Locale) => void;
  className?: string;
  emptyOption?: { label: string; onSelect: () => void };
  allowAutomatic?: boolean;
}

export const LocaleSearchList = (props: LocaleSearchListProps) => {
  const { value, onChange, className, emptyOption, allowAutomatic = false } = props;
  const t = useTranslate();
  const { i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const filteredLocales = useMemo(
    () => locales.filter((locale) => localeMatchesSearch(locale, query, i18n.language)),
    [i18n.language, query],
  );
  const showAutomatic =
    allowAutomatic &&
    (!query || t("locale-picker.automatic").toLowerCase().includes(query.toLowerCase()) || "auto".includes(query.toLowerCase()));

  return (
    <div
      className={cn(
        "flex min-h-0 w-full min-w-0 max-w-full max-h-[min(24rem,calc(100dvh-2rem),calc(var(--available-height,100dvh)-1rem))] flex-1 flex-col overflow-hidden",
        className,
      )}
    >
      <div className="relative shrink-0 p-1">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          className="pl-8"
          placeholder={`${t("common.search")} ${t("common.language").toLowerCase()}`}
          aria-label={t("common.language")}
        />
      </div>
      <div
        className="mt-1 min-h-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain p-1"
        role="listbox"
        aria-label={t("common.language")}
      >
        {showAutomatic && (
          <button
            type="button"
            data-slot="select-item"
            data-picker-item=""
            role="option"
            aria-selected={value === "auto"}
            className="flex min-h-8 w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent"
            onClick={() => onChange("auto")}
          >
            <span>{t("locale-picker.automatic")}</span>
            {value === "auto" && <CheckIcon className="size-4 shrink-0 text-primary" />}
          </button>
        )}
        {emptyOption && !query && (
          <button
            type="button"
            data-slot="select-item"
            data-picker-item=""
            role="option"
            aria-selected={!value}
            className="flex min-h-8 w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent"
            onClick={emptyOption.onSelect}
          >
            {emptyOption.label}
            {!value && <CheckIcon className="size-4 shrink-0 text-primary" />}
          </button>
        )}
        {filteredLocales.map((locale) => (
          <button
            type="button"
            key={locale}
            data-slot="select-item"
            data-picker-item=""
            role="option"
            aria-selected={value === locale}
            className={cn(
              "relative flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
              value === locale && "bg-accent/60",
            )}
            onClick={() => onChange(locale)}
          >
            <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
              <span className="truncate">{getLocaleDisplayName(locale)}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{locale}</span>
            </span>
            {value === locale ? <CheckIcon className="size-4 shrink-0 text-primary" /> : <span className="size-4 shrink-0" />}
          </button>
        ))}
        {filteredLocales.length === 0 && !showAutomatic && (
          <div className="px-2 py-6 text-center text-sm">
            <a
              href={MISSING_LANGUAGE_FEEDBACK_URL}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              {t("locale-picker.no-language-feedback")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

interface LocalePickerProps {
  value: Locale;
  onChange: (locale: Locale) => void;
  className?: string;
  iconOnly?: boolean;
  disabled?: boolean;
  emptyOption?: LocaleSearchListProps["emptyOption"];
  allowAutomatic?: boolean;
}

const LocalePicker = (props: LocalePickerProps) => {
  const { value, onChange, className, iconOnly = false, disabled, emptyOption, allowAutomatic = false } = props;
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const displayName =
    value === "auto" ? t("locale-picker.automatic") : !value && emptyOption ? emptyOption.label : getLocaleDisplayName(value);

  const handleChange = (locale: Locale) => {
    onChange(locale);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            disabled={disabled}
            data-picker-trigger={iconOnly ? undefined : ""}
            variant={iconOnly ? "ghost" : "outline"}
            size={iconOnly ? "icon" : undefined}
            aria-label={iconOnly ? t("locale-picker.current", { language: displayName }) : undefined}
            title={iconOnly ? displayName : undefined}
            className={cn(
              iconOnly
                ? "bg-transparent text-muted-foreground shadow-none hover:bg-accent/65 hover:text-foreground"
                : "w-full justify-between",
              className,
            )}
          />
        }
      >
        {iconOnly ? (
          <GlobeIcon className="size-4 shrink-0" />
        ) : (
          <>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <GlobeIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{displayName}</span>
            </span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[max(12rem,var(--anchor-width,12rem))] p-1.5" viewportClassName="overflow-hidden">
        <LocaleSearchList
          allowAutomatic={allowAutomatic}
          value={value}
          onChange={handleChange}
          emptyOption={
            emptyOption && {
              label: emptyOption.label,
              onSelect: () => {
                emptyOption.onSelect();
                setOpen(false);
              },
            }
          }
        />
      </PopoverContent>
    </Popover>
  );
};

export default LocalePicker;
