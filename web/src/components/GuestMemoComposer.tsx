import { ChevronDownIcon, Globe2Icon, LogInIcon, PlusIcon } from "lucide-react";
import { useLocation } from "react-router-dom";
import useNavigateTo from "@/hooks/useNavigateTo";
import { cn } from "@/lib/utils";
import { buildAuthRoute } from "@/utils/auth-redirect";
import { useTranslate } from "@/utils/i18n";

interface Props {
  className?: string;
}

const GuestMemoComposer = ({ className }: Props) => {
  const t = useTranslate();
  const location = useLocation();
  const navigateTo = useNavigateTo();

  const requestSignIn = () => {
    navigateTo(
      buildAuthRoute({
        redirect: `${location.pathname}${location.search}${location.hash}`,
      }),
    );
  };

  return (
    <button
      type="button"
      data-testid="guest-memo-composer"
      className={cn(
        "group flex w-full flex-col items-start justify-between gap-3 rounded-lg border border-border bg-card px-4 pb-3 pt-4 text-left text-card-foreground transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      aria-label={t("common.sign-in-to-memos")}
      onClick={requestSignIn}
    >
      <span className="min-h-8 w-full text-sm text-muted-foreground group-hover:text-foreground">{t("editor.any-thoughts")}</span>
      <span className="flex w-full items-center justify-between gap-3">
        <span className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex size-8 items-center justify-center rounded-md bg-muted">
            <PlusIcon className="size-4" />
          </span>
          <span className="inline-flex items-center gap-1">
            <Globe2Icon className="size-4" />
            {t("memo.visibility.public")}
            <ChevronDownIcon className="size-3.5" />
          </span>
        </span>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground opacity-80">
          <LogInIcon className="size-4" />
          {t("common.sign-in")}
        </span>
      </span>
    </button>
  );
};

export default GuestMemoComposer;
