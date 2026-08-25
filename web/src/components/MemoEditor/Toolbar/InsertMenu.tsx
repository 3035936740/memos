import { uniqBy } from "lodash-es";
import {
  CheckIcon,
  ImageIcon,
  LinkIcon,
  LoaderIcon,
  MapPinIcon,
  Maximize2Icon,
  MicIcon,
  PaperclipIcon,
  PlusIcon,
  SmilePlusIcon,
  SparklesIcon,
  TypeIcon,
  VideoIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LinkMemoDialog, LocationDialog } from "@/components/MemoMetadata";
import type { MapPoint } from "@/components/map/types";
import { useReverseGeocoding } from "@/components/map/useReverseGeocoding";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDebouncedEffect } from "@/hooks";
import type { MemoRelation } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import AIGenerateDialog from "../components/AIGenerateDialog";
import EmojiPickerDialog from "../components/EmojiPickerDialog";
import { useFileUpload, useLinkMemo, useLocation } from "../hooks";
import { useEditorContext, useEditorSelector } from "../state";
import type { InsertMenuProps } from "../types";
import type { LocalFile } from "../types/attachment";

const InsertMenu = (props: InsertMenuProps) => {
  const t = useTranslate();
  const { actions, dispatch, getState } = useEditorContext();
  const relations = useEditorSelector((s) => s.metadata.relations);
  const {
    location: initialLocation,
    onLocationChange,
    onToggleFocusMode,
    onToggleFormattingToolbar,
    isFormattingToolbarVisible,
    isUploading: isUploadingProp,
  } = props;

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [emojiDialogOpen, setEmojiDialogOpen] = useState(false);
  const [aiDialogOpen, setAIDialogOpen] = useState(false);
  const [aiContext, setAIContext] = useState("");
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const inlineVideoInputRef = useRef<HTMLInputElement>(null);

  const { fileInputRef, selectingFlag, handleFileInputChange, handleUploadClick } = useFileUpload((newFiles: LocalFile[]) => {
    if (getState().ui.isLoading.saving) return;
    newFiles.forEach((file) => dispatch(actions.addLocalFile(file)));
  });

  const linkMemo = useLinkMemo({
    isOpen: linkDialogOpen,
    currentMemoName: props.memoName,
    existingRelations: relations,
    onAddRelation: (relation: MemoRelation) => {
      dispatch(actions.setMetadata({ relations: uniqBy([...relations, relation], (r) => r.relatedMemo?.name) }));
      setLinkDialogOpen(false);
    },
  });

  const location = useLocation(props.location);
  const {
    state: locationState,
    locationInitialized,
    handlePositionChange: handleLocationPositionChange,
    getLocation,
    reset: locationReset,
    updateCoordinate,
    setPlaceholder,
  } = location;

  const [debouncedPosition, setDebouncedPosition] = useState<MapPoint | undefined>(undefined);

  useDebouncedEffect(
    () => {
      setDebouncedPosition(locationState.position);
    },
    1000,
    [locationState.position],
  );

  const { data: displayName } = useReverseGeocoding(debouncedPosition?.lat, debouncedPosition?.lng);

  useEffect(() => {
    if (displayName) {
      setPlaceholder(displayName);
    }
  }, [displayName, setPlaceholder]);

  const isUploading = selectingFlag || isUploadingProp;
  const insertionDisabled = isUploading || props.isSaving;

  const handleOpenLinkDialog = useCallback(() => {
    setLinkDialogOpen(true);
  }, []);

  const handleLocationClick = useCallback(() => {
    setLocationDialogOpen(true);
    if (!initialLocation && !locationInitialized) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            handleLocationPositionChange({ lat: position.coords.latitude, lng: position.coords.longitude });
          },
          (error) => {
            console.error("Geolocation error:", error);
          },
        );
      }
    }
  }, [initialLocation, locationInitialized, handleLocationPositionChange]);

  const handleLocationConfirm = useCallback(() => {
    const newLocation = getLocation();
    if (newLocation) {
      onLocationChange(newLocation);
      setLocationDialogOpen(false);
    }
  }, [getLocation, onLocationChange]);

  const handleLocationCancel = useCallback(() => {
    locationReset();
    setLocationDialogOpen(false);
  }, [locationReset]);

  const handleAttachmentUploadClick = useCallback(() => {
    if (getState().ui.isLoading.saving) return;
    handleUploadClick();
  }, [getState, handleUploadClick]);

  const handleInlineImageUploadClick = useCallback(() => {
    if (getState().ui.isLoading.saving) return;
    inlineImageInputRef.current?.click();
  }, [getState]);

  const handleInlineImageInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length > 0) props.onInsertImages(files);
      event.target.value = "";
    },
    [props.onInsertImages],
  );

  const handleInlineVideoUploadClick = useCallback(() => {
    if (getState().ui.isLoading.saving) return;
    inlineVideoInputRef.current?.click();
  }, [getState]);

  const handleInlineVideoInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length > 0) props.onInsertVideos(files);
      event.target.value = "";
    },
    [props.onInsertVideos],
  );

  // Insert actions (add content).
  const insertItems = [
    { key: "attachment", label: t("editor.insert-menu.add-attachment"), icon: PaperclipIcon, onClick: handleAttachmentUploadClick },
    { key: "inline-image", label: t("editor.insert-menu.insert-image"), icon: ImageIcon, onClick: handleInlineImageUploadClick },
    { key: "inline-video", label: t("editor.insert-menu.insert-video"), icon: VideoIcon, onClick: handleInlineVideoUploadClick },
    { key: "emoji", label: t("editor.insert-menu.insert-emoji"), icon: SmilePlusIcon, onClick: () => setEmojiDialogOpen(true) },
    {
      key: "ai",
      label: t("editor.insert-menu.ai-assistant"),
      icon: SparklesIcon,
      onClick: () => {
        setAIContext(getState().content);
        setAIDialogOpen(true);
      },
    },
    { key: "audio", label: t("editor.audio-recorder.trigger"), icon: MicIcon, onClick: props.onAudioRecorderClick },
    { key: "link", label: t("editor.insert-menu.link-memo"), icon: LinkIcon, onClick: handleOpenLinkDialog },
    { key: "location", label: t("editor.insert-menu.add-location"), icon: MapPinIcon, onClick: handleLocationClick },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="secondary" size="icon" disabled={insertionDisabled} aria-label={t("common.add")} />}>
          {isUploading ? <LoaderIcon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {insertItems.map((item) => (
            <DropdownMenuItem key={item.key} onClick={item.onClick} disabled={props.isSaving}>
              <item.icon className="w-4 h-4" />
              {item.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {/* View toggles: focus mode + formatting-toolbar visibility. */}
          <DropdownMenuItem onClick={onToggleFocusMode}>
            <Maximize2Icon className="w-4 h-4" />
            {t("editor.focus-mode")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToggleFormattingToolbar}>
            <TypeIcon className="w-4 h-4" />
            {t("editor.formatting-toolbar")}
            {isFormattingToolbarVisible && <CheckIcon className="w-4 h-4 ml-auto" />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Hidden file input */}
      <input
        className="hidden"
        ref={fileInputRef}
        disabled={insertionDisabled}
        onChange={handleFileInputChange}
        type="file"
        multiple={true}
        accept=""
      />

      <input
        className="hidden"
        ref={inlineImageInputRef}
        disabled={insertionDisabled}
        onChange={handleInlineImageInputChange}
        type="file"
        multiple={true}
        accept="image/*"
      />

      <input
        className="hidden"
        ref={inlineVideoInputRef}
        disabled={insertionDisabled}
        onChange={handleInlineVideoInputChange}
        type="file"
        multiple={true}
        accept="video/*"
      />

      <LinkMemoDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        searchText={linkMemo.searchText}
        onSearchChange={linkMemo.setSearchText}
        filteredMemos={linkMemo.filteredMemos}
        isFetching={linkMemo.isFetching}
        onSelectMemo={linkMemo.addMemoRelation}
        isAlreadyLinked={linkMemo.isAlreadyLinked}
      />

      <LocationDialog
        open={locationDialogOpen}
        onOpenChange={setLocationDialogOpen}
        state={locationState}
        onPositionChange={handleLocationPositionChange}
        onUpdateCoordinate={updateCoordinate}
        onPlaceholderChange={setPlaceholder}
        onCancel={handleLocationCancel}
        onConfirm={handleLocationConfirm}
      />

      <EmojiPickerDialog open={emojiDialogOpen} onOpenChange={setEmojiDialogOpen} onSelect={props.onInsertEmoji} />
      <AIGenerateDialog open={aiDialogOpen} onOpenChange={setAIDialogOpen} context={aiContext} onInsert={props.onInsertAIText} />
    </>
  );
};

export default InsertMenu;
