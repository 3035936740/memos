import { ChevronRightIcon, PlusIcon, RotateCcwIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import LocalePicker from "@/components/LocalePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import i18n from "@/i18n";
import { cn } from "@/lib/utils";
import type { InstanceSetting_GeneralSetting } from "@/types/proto/api/v1/instance_service_pb";
import {
  BUILTIN_QUESTION_COUNT,
  BUILTIN_QUESTION_LANGUAGES,
  bankLanguageFor,
  type CustomDailyQuestion,
  type DailyQuestionEntry,
  isBuiltinQuestion,
  isDailyQuestionEntry,
  loadAllQuestionBanks,
  MAX_DAILY_QUESTIONS,
  MAX_QUESTION_CHARACTERS,
  type QuestionBanks,
  resolveDailyQuestion,
} from "@/utils/daily-question";
import { getLocaleDisplayName, useTranslate } from "@/utils/i18n";
import SettingGroup from "./SettingGroup";
import { SettingList, SettingListItem } from "./SettingList";

const PAGE_SIZE = 20;

interface Props {
  setting: InstanceSetting_GeneralSetting;
  onChange: (partial: Partial<InstanceSetting_GeneralSetting>) => void;
  disabled?: boolean;
}

/** One translation editor at a time, even when the bank supports every UI language. */
const QuestionTranslations = ({
  question,
  disabled,
  onChange,
}: {
  question: CustomDailyQuestion;
  disabled: boolean;
  onChange: (question: CustomDailyQuestion) => void;
}) => {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const [locale, setLocale] = useState<Locale>("en");
  const filled = Object.entries(question.translations ?? {}).filter(([, text]) => text?.trim());
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-xs text-muted-foreground">{t("daily-question-admin.optional-translations")}</summary>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <LocalePicker value={locale} onChange={setLocale} disabled={disabled} className="w-48" />
          {filled.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {filled.map(([code]) => (
                <Button key={code} variant="outline" size="sm" onClick={() => setLocale(code as Locale)}>
                  {getLocaleDisplayName(code as Locale)}
                </Button>
              ))}
            </div>
          )}
          {locale === question.locale ? (
            <p className="text-xs text-muted-foreground">{t("daily-question-admin.translation-uses-default")}</p>
          ) : (
            <Textarea
              aria-label={getLocaleDisplayName(locale)}
              value={question.translations?.[locale] || ""}
              rows={2}
              disabled={disabled}
              onChange={(event) => {
                const translations = { ...question.translations };
                if (event.target.value) translations[locale] = event.target.value;
                else delete translations[locale];
                onChange({ ...question, translations });
              }}
            />
          )}
          <p className="text-xs text-muted-foreground">{t("daily-question-admin.english-fallback")}</p>
        </div>
      )}
    </details>
  );
};

/** The bank stays folded; only one page and explicitly expanded translation editors mount. */
const DailyQuestionEditor = ({ setting, onChange, disabled = false }: Props) => {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const [banks, setBanks] = useState<QuestionBanks>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [defaultLocale, setDefaultLocale] = useState<CustomDailyQuestion["locale"]>("en");
  const [confirmRestore, setConfirmRestore] = useState(false);
  const language = bankLanguageFor(i18n.language);
  const entries = useMemo<DailyQuestionEntry[]>(() => {
    // Unlike the public reader, the editor must keep an unfinished new question
    // while the administrator types. Saving validates it before sending.
    if (setting.dailyQuestionsJson.trim()) {
      try {
        const parsed: unknown = JSON.parse(setting.dailyQuestionsJson);
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every(
            (entry) =>
              isDailyQuestionEntry(entry) ||
              (entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.text === "string"),
          )
        )
          return parsed as DailyQuestionEntry[];
      } catch {
        /* Keep the built-in bank available to repair malformed data. */
      }
    }
    return Array.from({ length: BUILTIN_QUESTION_COUNT }, (_, builtin) => ({ builtin }));
  }, [setting.dailyQuestionsJson]);
  const usingDefault = !setting.dailyQuestionsJson.trim();

  useEffect(() => {
    if (!open || banks) return;
    let cancelled = false;
    loadAllQuestionBanks()
      .then((loaded) => {
        if (!cancelled) {
          setBanks(loaded);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, banks]);

  const preview = (entry: DailyQuestionEntry) =>
    resolveDailyQuestion(entry, i18n.language, banks?.[language]) || t("daily-question-admin.empty-question");
  const filtered = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => {
      if (!query.trim()) return true;
      const texts = isBuiltinQuestion(entry)
        ? BUILTIN_QUESTION_LANGUAGES.map((locale) => banks?.[locale][entry.builtin] ?? "")
        : typeof entry === "string"
          ? [entry]
          : [entry.text, ...Object.values(entry.translations ?? {})];
      return texts.join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const builtinCount = entries.filter(isBuiltinQuestion).length;
  const customCount = entries.length - builtinCount;

  const writeEntries = (next: DailyQuestionEntry[]) => onChange({ dailyQuestionsJson: JSON.stringify(next) });
  const changeEntry = (index: number, next: DailyQuestionEntry) =>
    writeEntries(entries.map((entry, position) => (position === index ? next : entry)));
  const toggleEntry = (index: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  const removeEntry = (index: number) => {
    if (entries.length <= 1) return;
    writeEntries(entries.filter((_, position) => position !== index));
    setExpanded(new Set());
  };
  const editBuiltin = (index: number, builtin: number) => {
    if (!banks) return;
    changeEntry(index, {
      text: banks[language][builtin],
      locale: language,
      translations: Object.fromEntries(
        BUILTIN_QUESTION_LANGUAGES.filter((locale) => locale !== language).map((locale) => [locale, banks[locale][builtin]]),
      ),
    });
  };
  const addQuestion = () => {
    if (entries.length >= MAX_DAILY_QUESTIONS) return;
    writeEntries([...entries, { text: "", locale: defaultLocale }]);
    setQuery("");
    setPage(Math.floor(entries.length / PAGE_SIZE));
    setExpanded(new Set([entries.length]));
  };
  const addBulk = () => {
    const existing = new Set(
      entries
        .filter((entry) => !isBuiltinQuestion(entry))
        .map((entry) => (typeof entry === "string" ? entry.trim() : (entry as CustomDailyQuestion).text.trim())),
    );
    const added = [
      ...new Set(
        bulkText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    ].filter((text) => !existing.has(text));
    if (added.some((text) => [...text].length > MAX_QUESTION_CHARACTERS)) {
      toast.error(t("daily-question-admin.error-too-long"));
      return;
    }
    if (entries.length + added.length > MAX_DAILY_QUESTIONS) {
      toast.error(t("daily-question-admin.error-too-many"));
      return;
    }
    if (added.length === 0) return;
    writeEntries([...entries, ...added.map((text) => ({ text, locale: defaultLocale }))]);
    setBulkText("");
    setBulkOpen(false);
    setQuery("");
    setPage(Math.floor(entries.length / PAGE_SIZE));
  };
  const randomizeSeed = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    onChange({ dailyQuestionSeed: [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("") });
  };

  return (
    <SettingGroup title={t("daily-question-admin.title")} description={t("daily-question-admin.description")} showSeparator>
      <SettingList>
        <SettingListItem label={t("daily-question-admin.enabled")} description={t("daily-question-admin.enabled-description")}>
          <Switch
            aria-label={t("daily-question-admin.enabled")}
            checked={!setting.disableDailyQuestion}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ disableDailyQuestion: !checked })}
          />
        </SettingListItem>
        <SettingListItem label={t("daily-question-admin.seed")} description={t("daily-question-admin.seed-description")}>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Input
              aria-label={t("daily-question-admin.seed")}
              value={setting.dailyQuestionSeed}
              maxLength={64}
              placeholder={t("daily-question-admin.seed-placeholder")}
              disabled={disabled}
              className="w-48 font-mono"
              onChange={(event) => onChange({ dailyQuestionSeed: event.target.value })}
            />
            <Button variant="outline" disabled={disabled} onClick={randomizeSeed}>
              <RotateCcwIcon className="size-4" />
              {t("daily-question-admin.randomize")}
            </Button>
          </div>
        </SettingListItem>
      </SettingList>
      <div data-settings-surface="" className="overflow-hidden rounded-lg border border-border">
        <Button
          variant="ghost"
          className="h-auto w-full justify-start whitespace-normal p-3 text-left"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="daily-question-bank-editor"
        >
          <ChevronRightIcon className={cn("size-4 shrink-0 transition-transform", open && "rotate-90")} />
          <span className="min-w-0 flex-1">
            <span className="block">{t("daily-question-admin.bank-count", { count: entries.length })}</span>
            <span className="block text-xs font-normal text-muted-foreground">
              {usingDefault
                ? t("daily-question-admin.default-bank")
                : t("daily-question-admin.bank-summary", { builtin: builtinCount, custom: customCount })}
            </span>
          </span>
        </Button>
        {open && (
          <div id="daily-question-bank-editor" className="flex min-w-0 flex-col gap-3 border-t border-border p-3">
            <p className="text-xs leading-5 text-muted-foreground">{t("daily-question-admin.language-help")}</p>
            <p className="text-xs text-muted-foreground">
              {entries.length < 365
                ? t("daily-question-admin.short-schedule", {
                    count: entries.length,
                    rounds: Math.floor(365 / entries.length),
                    extra: 365 % entries.length,
                  })
                : t("daily-question-admin.long-schedule")}
            </p>
            {loadFailed && (
              <p role="alert" className="text-sm text-destructive">
                {t("daily-question-admin.load-failed")}
              </p>
            )}
            {!banks && !loadFailed && <p className="text-xs text-muted-foreground">{t("daily-question-admin.loading")}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" disabled={disabled || entries.length >= MAX_DAILY_QUESTIONS} onClick={addQuestion}>
                <PlusIcon className="size-4" />
                {t("daily-question-admin.add")}
              </Button>
              <Button variant="outline" disabled={disabled} onClick={() => setBulkOpen(!bulkOpen)} aria-expanded={bulkOpen}>
                {t("daily-question-admin.bulk-add")}
              </Button>
              <Button variant="outline" disabled={disabled || usingDefault} onClick={() => setConfirmRestore(true)}>
                <RotateCcwIcon className="size-4" />
                {t("daily-question-admin.restore")}
              </Button>
              <Button variant="ghost" onClick={() => setExpanded(new Set())}>
                {t("daily-question-admin.collapse-all")}
              </Button>
            </div>
            {bulkOpen && (
              <div className="flex flex-col gap-2">
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  {t("daily-question-admin.default-language")}
                  <LocalePicker
                    value={(defaultLocale || "") as Locale}
                    onChange={setDefaultLocale}
                    disabled={disabled}
                    className="w-48"
                    emptyOption={{ label: t("daily-question-admin.no-language"), onSelect: () => setDefaultLocale("") }}
                  />
                </label>
                <Textarea
                  aria-label={t("daily-question-admin.bulk-add")}
                  value={bulkText}
                  onChange={(event) => setBulkText(event.target.value)}
                  placeholder={t("daily-question-admin.bulk-placeholder")}
                  rows={5}
                  disabled={disabled}
                />
                <Button variant="outline" className="self-start" disabled={disabled || !bulkText.trim()} onClick={addBulk}>
                  {t("daily-question-admin.add-lines")}
                </Button>
              </div>
            )}
            <div className="relative">
              <SearchIcon aria-hidden className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
              <Input
                aria-label={t("daily-question-admin.search")}
                placeholder={t("daily-question-admin.search")}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                className="pl-8"
              />
            </div>
            <div className="divide-y divide-border">
              {visible.map(({ entry, index }) => {
                const builtin = isBuiltinQuestion(entry);
                const custom: CustomDailyQuestion | undefined = builtin
                  ? undefined
                  : typeof entry === "string"
                    ? { text: entry, locale: "" }
                    : entry;
                const rowKey = `${builtin ? `builtin-${entry.builtin}` : "custom"}-${index}`;
                return (
                  <div key={rowKey} className="py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-start gap-2 text-left"
                        onClick={() => toggleEntry(index)}
                        aria-expanded={expanded.has(index)}
                      >
                        <ChevronRightIcon
                          className={cn("mt-0.5 size-4 shrink-0 transition-transform", expanded.has(index) && "rotate-90")}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm">
                            {index + 1}. {preview(entry)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {builtin
                              ? t("daily-question-admin.builtin-mark")
                              : custom?.translations && Object.keys(custom.translations).length > 0
                                ? t("daily-question-admin.custom-translated")
                                : t("daily-question-admin.custom-common")}
                          </span>
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${t("common.delete")} ${index + 1}`}
                        disabled={disabled || entries.length <= 1}
                        onClick={() => removeEntry(index)}
                      >
                        <Trash2Icon className="size-4 text-destructive" />
                      </Button>
                    </div>
                    {expanded.has(index) && (
                      <div className="mt-3 flex min-w-0 flex-col gap-3 ps-6">
                        {builtin ? (
                          <>
                            {BUILTIN_QUESTION_LANGUAGES.map((locale) => (
                              <div key={locale} className="text-sm">
                                <span className="text-xs text-muted-foreground">{getLocaleDisplayName(locale as Locale)}</span>
                                <p className="mt-1 break-words">{banks?.[locale][entry.builtin] || t("daily-question-admin.loading")}</p>
                              </div>
                            ))}
                            <Button
                              variant="outline"
                              className="self-start"
                              disabled={disabled || !banks}
                              onClick={() => editBuiltin(index, entry.builtin)}
                            >
                              {t("daily-question-admin.edit-builtin")}
                            </Button>
                          </>
                        ) : (
                          custom && (
                            <>
                              <label className="flex flex-wrap items-center gap-2 text-sm">
                                {t("daily-question-admin.default-language")}
                                <LocalePicker
                                  value={(custom.locale || "") as Locale}
                                  onChange={(locale) => changeEntry(index, { ...custom, locale })}
                                  disabled={disabled}
                                  className="w-48"
                                  emptyOption={{
                                    label: t("daily-question-admin.no-language"),
                                    onSelect: () => changeEntry(index, { ...custom, locale: "" }),
                                  }}
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-sm">
                                {t("daily-question-admin.question-text")}
                                <Textarea
                                  value={custom.text}
                                  onChange={(event) => changeEntry(index, { ...custom, text: event.target.value })}
                                  rows={2}
                                  disabled={disabled}
                                />
                              </label>
                              <QuestionTranslations question={custom} disabled={disabled} onChange={(next) => changeEntry(index, next)} />
                              <span className="text-xs text-muted-foreground">{t("daily-question-admin.text-limit")}</span>
                            </>
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {visible.length === 0 && (
                <p className="py-5 text-center text-sm text-muted-foreground">{t("daily-question-admin.no-results")}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{t("daily-question-admin.page", { current: currentPage + 1, total: pages })}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                  {t("memo.pagination-previous")}
                </Button>
                <Button variant="outline" size="sm" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>
                  {t("memo.pagination-next")}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("daily-question-admin.save-hint")}</p>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmRestore}
        onOpenChange={setConfirmRestore}
        title={t("daily-question-admin.restore")}
        description={t("daily-question-admin.restore-description")}
        confirmLabel={t("daily-question-admin.restore")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          onChange({ dailyQuestionsJson: "" });
          setExpanded(new Set());
          setPage(0);
          setQuery("");
        }}
      />
    </SettingGroup>
  );
};

export default DailyQuestionEditor;
