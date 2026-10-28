import { FileQuestionMarkIcon, InboxIcon, LoaderCircleIcon, SearchXIcon } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DEFAULT_MESSAGES, type PlaceholderVariant } from "./messages";

interface PlaceholderProps {
  variant: PlaceholderVariant;
  message?: string;
  children?: ReactNode;
  className?: string;
}

const PLACEHOLDER_ICONS = {
  empty: InboxIcon,
  loading: LoaderCircleIcon,
  noResults: SearchXIcon,
  notFound: FileQuestionMarkIcon,
} satisfies Record<PlaceholderVariant, typeof InboxIcon>;

const Placeholder = ({ variant, message, children, className }: PlaceholderProps) => {
  const Icon = PLACEHOLDER_ICONS[variant];
  const resolvedMessage = message ?? DEFAULT_MESSAGES[variant];
  const isLoading = variant === "loading";

  return (
    <div
      role={isLoading ? "status" : undefined}
      aria-live={isLoading ? "polite" : undefined}
      className={cn("flex flex-col items-center justify-center max-w-md mx-auto px-4 py-8", className)}
    >
      <Icon
        aria-hidden="true"
        strokeWidth={1.5}
        className={cn("size-12 shrink-0 text-muted-foreground/65", isLoading && "animate-spin motion-reduce:animate-none")}
      />
      <p className="mt-3 font-mono text-sm text-muted-foreground">{resolvedMessage}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
};

export default Placeholder;
