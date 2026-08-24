import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslate } from "@/utils/i18n";

export type MemoPaginationItem = number | "ellipsis-start" | "ellipsis-end";

export const getMemoPaginationItems = (currentPage: number, totalPages: number): MemoPaginationItem[] => {
  if (totalPages <= 9) return Array.from({ length: totalPages }, (_, index) => index + 1);

  if (currentPage <= 5) {
    return [1, 2, 3, 4, 5, "ellipsis-end", totalPages - 1, totalPages];
  }

  if (currentPage >= totalPages - 4) {
    return [1, 2, "ellipsis-start", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "ellipsis-start", currentPage - 1, currentPage, currentPage + 1, "ellipsis-end", totalPages];
};

interface Props {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const MemoPagination = ({ currentPage, totalPages, onPageChange }: Props) => {
  const t = useTranslate();
  const [jumpValue, setJumpValue] = useState("");

  useEffect(() => setJumpValue(""), [currentPage]);

  if (totalPages <= 1) return null;

  const submitJump = (event: FormEvent) => {
    event.preventDefault();
    const requestedPage = Number.parseInt(jumpValue, 10);
    if (!Number.isFinite(requestedPage)) return;
    onPageChange(Math.min(totalPages, Math.max(1, requestedPage)));
  };

  return (
    <nav
      data-memo-pagination=""
      aria-label={t("memo.pagination-summary", { current: currentPage, total: totalPages })}
      className="flex w-full flex-wrap items-center justify-center gap-2 py-4"
    >
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("memo.pagination-previous")}
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeftIcon />
        </Button>

        {getMemoPaginationItems(currentPage, totalPages).map((item) =>
          typeof item === "number" ? (
            <Button
              key={item}
              type="button"
              variant={item === currentPage ? "default" : "outline"}
              size="icon"
              aria-label={t("memo.pagination-summary", { current: item, total: totalPages })}
              aria-current={item === currentPage ? "page" : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ) : (
            <span key={item} className="flex size-8 items-center justify-center text-muted-foreground" aria-hidden="true">
              <MoreHorizontalIcon className="size-4" />
            </span>
          ),
        )}

        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("memo.pagination-next")}
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>

      <form className="flex items-center gap-1" onSubmit={submitJump}>
        <Input
          type="number"
          min={1}
          max={totalPages}
          value={jumpValue}
          onChange={(event) => setJumpValue(event.target.value)}
          placeholder={t("memo.pagination-jump-placeholder")}
          aria-label={t("memo.pagination-jump-placeholder")}
          className="w-20"
        />
        <Button type="submit" variant="outline" disabled={!jumpValue}>
          {t("memo.pagination-go")}
        </Button>
      </form>
    </nav>
  );
};

export default MemoPagination;
