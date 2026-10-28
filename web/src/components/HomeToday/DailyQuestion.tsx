import { MessageCircleQuestionIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useInstance } from "@/contexts/InstanceContext";
import { stringifyFilters } from "@/contexts/MemoFilterContext";
import i18n from "@/i18n";
import {
  bankLanguageFor,
  dailyQuestionTag,
  isBuiltinQuestion,
  loadBuiltInQuestions,
  questionIndexFor,
  readDailyQuestionSettings,
  resolveDailyQuestion,
} from "@/utils/daily-question";
import { dayKey } from "@/utils/home-today";
import { useTranslate } from "@/utils/i18n";

interface Props {
  /** Starts an answer in the composer with this heading, tagged for the day. */
  onAnswer: (heading: string, day: string) => void;
}

/**
 * Today's question, above the composer on Home. The site's seed picks it (utils/daily-question.ts), so everyone on
 * the site gets the same one on the same day; "Answer" starts a draft tagged for the day and "See answers" lists
 * the day's tag on Explore.
 */
const DailyQuestion = ({ onAnswer }: Props) => {
  const t = useTranslate();
  const { generalSetting } = useInstance();
  const settings = useMemo(() => readDailyQuestionSettings(generalSetting), [generalSetting]);
  const [today] = useState(() => new Date());
  const [loadedBank, setLoadedBank] = useState<{ language: string; questions: readonly string[] }>();
  const language = i18n.language;
  const bankLanguage = bankLanguageFor(language);
  const needsBuiltIn = !settings.questions || settings.questions.some(isBuiltinQuestion);
  const builtIn = loadedBank?.language === bankLanguage ? loadedBank.questions : undefined;

  // The built-in bank is fetched in the reader's language only when the site has no questions of its own.
  useEffect(() => {
    if (!needsBuiltIn || settings.disabled) return;
    let cancelled = false;
    loadBuiltInQuestions(bankLanguage)
      .then((questions) => !cancelled && setLoadedBank({ language: bankLanguage, questions }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bankLanguage, needsBuiltIn, settings.disabled]);

  const questions = settings.questions ?? builtIn;
  if (settings.disabled || !questions) return null;
  const index = questionIndexFor(today, questions.length, settings.seed);
  const entry = index === undefined ? undefined : questions[index];
  const question = entry === undefined ? undefined : resolveDailyQuestion(entry, language, builtIn);
  if (!question) return null;

  const day = dayKey(today);
  const answers = `/explore?${new URLSearchParams({ filter: stringifyFilters([{ factor: "tagSearch", value: dailyQuestionTag(day) }]) })}`;

  return (
    <div
      data-daily-question=""
      data-sb-subcard=""
      className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
    >
      <MessageCircleQuestionIcon aria-hidden className="size-4 shrink-0 text-primary" />
      <p className="m-0 min-w-0 flex-1 text-foreground">
        <span className="me-1.5 font-medium">{t("daily-question.label")}</span>
        {(!settings.questions || (entry !== undefined && isBuiltinQuestion(entry))) && (
          <span
            data-daily-question-origin="builtin"
            className="me-1.5 border border-border px-1 py-0.5 text-[10px] text-muted-foreground"
            style={{ borderRadius: "var(--sb-field-radius, 4px)" }}
          >
            {t("daily-question.builtin")}
          </span>
        )}
        {question}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-7" onClick={() => onAnswer(t("daily-question.heading", { question }), day)}>
          {t("daily-question.answer")}
        </Button>
        <Link to={answers} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          {t("daily-question.see-answers")}
        </Link>
      </div>
    </div>
  );
};

export default DailyQuestion;
