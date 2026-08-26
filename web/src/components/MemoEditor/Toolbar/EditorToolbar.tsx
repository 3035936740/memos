import type { FC } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import useCurrentUser from "@/hooks/useCurrentUser";
import { type Location, Visibility } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import { isSuperUser } from "@/utils/user";
import { validationService } from "../services";
import { useEditorContext, useEditorSelector } from "../state";
import type { EditorToolbarProps } from "../types";
import CategorySelector from "./CategorySelector";
import InsertMenu from "./InsertMenu";
import PublicationSelector from "./PublicationSelector";
import VisibilitySelector from "./VisibilitySelector";

export const EditorToolbar: FC<EditorToolbarProps> = ({
  onSave,
  onCancel,
  memoName,
  showCategory = true,
  space,
  onAudioRecorderClick,
  viewToggles,
  onInsertImages,
  onInsertVideos,
  onInsertEmoji,
  onInsertAIText,
  canUseAdminScript,
  onInsertLocalScript,
}) => {
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const { actions, dispatch } = useEditorContext();
  // Subscribe to narrow/derived slices so typing (which only changes content)
  // doesn't re-render the toolbar or the heavy InsertMenu it hosts. `valid`
  // flips only on empty↔non-empty / loading transitions, not per keystroke.
  const valid = useEditorSelector((s) => validationService.canSave(s).valid);
  const blockedReason = useEditorSelector((s) => validationService.canSave(s).reason);
  const blockedReasonDetail = useEditorSelector((s) => validationService.canSave(s).detail);
  const isSaving = useEditorSelector((s) => s.ui.isLoading.saving);
  const isUploading = useEditorSelector((s) => s.ui.isLoading.uploading);
  const location = useEditorSelector((s) => s.metadata.location);
  const visibility = useEditorSelector((s) => s.metadata.visibility);
  const category = useEditorSelector((s) => s.metadata.category);
  const hidden = useEditorSelector((s) => s.metadata.hidden);
  const anonymous = useEditorSelector((s) => s.metadata.anonymous);
  const adminScript = useEditorSelector((s) => s.metadata.adminScript);
  const draft = useEditorSelector((s) => s.metadata.draft);
  const publishTime = useEditorSelector((s) => s.metadata.publishTime);
  const blockedMessage = valid
    ? undefined
    : blockedReason
      ? t(blockedReason, blockedReasonDetail ? { url: blockedReasonDetail } : undefined)
      : t("editor.validation.cannot-save");

  const handleLocationChange = (next?: Location) => {
    dispatch(actions.setMetadata({ location: next }));
  };

  const handleVisibilityChange = (next: Visibility) => {
    dispatch(actions.setMetadata({ visibility: next }));
  };

  const handleCategoryChange = (next?: string) => {
    dispatch(actions.setMetadata({ category: next }));
  };

  const handleHiddenChange = (next: boolean) => {
    dispatch(actions.setMetadata({ hidden: next, ...(next ? { visibility: Visibility.PUBLIC } : {}) }));
  };

  return (
    <div className="w-full flex flex-row justify-between items-center mb-2">
      <div className="flex flex-row justify-start items-center gap-1">
        <InsertMenu
          isUploading={isUploading}
          isSaving={isSaving}
          location={location}
          onLocationChange={handleLocationChange}
          memoName={memoName}
          onAudioRecorderClick={onAudioRecorderClick}
          viewToggles={viewToggles}
          onInsertImages={onInsertImages}
          onInsertVideos={onInsertVideos}
          onInsertEmoji={onInsertEmoji}
          onInsertAIText={onInsertAIText}
          adminScript={adminScript}
          onAdminScriptChange={(next) => dispatch(actions.setMetadata({ adminScript: next }))}
          canUseAdminScript={canUseAdminScript}
          onInsertLocalScript={onInsertLocalScript}
        />
        <VisibilitySelector
          value={visibility}
          space={space}
          onChange={handleVisibilityChange}
          hidden={hidden}
          onHiddenChange={showCategory && isSuperUser(currentUser) ? handleHiddenChange : undefined}
          anonymous={anonymous}
          onAnonymousChange={showCategory ? (next) => dispatch(actions.setMetadata({ anonymous: next })) : undefined}
        />
        {showCategory ? <CategorySelector value={category} onChange={handleCategoryChange} /> : null}
        {showCategory ? (
          <PublicationSelector draft={draft} publishTime={publishTime} onChange={(next) => dispatch(actions.setMetadata(next))} />
        ) : null}
      </div>

      <div className="flex flex-row justify-end items-center gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
            {t("common.cancel")}
          </Button>
        )}

        {!valid && !isSaving && blockedMessage ? (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" tabIndex={0} aria-label={blockedMessage} />}>
              <Button className="border-0 shadow-none outline-none ring-0 hover:shadow-xs focus-visible:ring-0" onClick={onSave} disabled>
                {t("editor.save")}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{blockedMessage}</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            className="border-0 shadow-none outline-none ring-0 hover:shadow-xs focus-visible:ring-0"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? t("editor.saving") : t("editor.save")}
          </Button>
        )}
      </div>
    </div>
  );
};
