import type { MemoNavigationScope } from "@/lib/memo-navigation";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

export interface MemoViewProps {
  memo: Memo;
  compact?: boolean;
  showCreator?: boolean;
  showVisibility?: boolean;
  showPinned?: boolean;
  hideCommentPreview?: boolean;
  className?: string;
  parentPage?: string;
  navigationScope?: MemoNavigationScope;
  shareImageDialogOpen?: boolean;
  onShareImageDialogOpenChange?: (open: boolean) => void;
}

export interface MemoHeaderProps {
  showCreator?: boolean;
  showVisibility?: boolean;
  showPinned?: boolean;
}

export interface MemoBodyProps {
  compact?: boolean;
}
