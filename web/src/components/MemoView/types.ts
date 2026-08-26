import type { ReactNode } from "react";
import type { MemoNavigationScope } from "@/lib/memo-navigation";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import type { MemoOriginScope } from "./navigation";

export interface MemoViewProps {
  memo: Memo;
  compact?: boolean;
  showCreator?: boolean;
  showVisibility?: boolean;
  showPinned?: boolean;
  hideCommentPreview?: boolean;
  headerActionLeading?: ReactNode;
  className?: string;
  parentPage?: string;
  navigationScope?: MemoNavigationScope;
  showSpace?: boolean;
  parentScope?: MemoOriginScope;
  shareImageDialogOpen?: boolean;
  onShareImageDialogOpenChange?: (open: boolean) => void;
}

export interface MemoHeaderProps {
  showCreator?: boolean;
  showVisibility?: boolean;
  showPinned?: boolean;
  showSpace?: boolean;
  actionLeading?: ReactNode;
}

export interface MemoBodyProps {
  compact?: boolean;
}
