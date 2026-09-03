import { create } from "@bufbuild/protobuf";
import { ImageIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { PollOptionSchema, PollSchema, VoterType } from "@/types/proto/api/v1/memo_service_pb";
import { getAttachmentUrl } from "@/utils/attachment";
import { ensureMemoPollMarker, removeMemoPollMarkers } from "@/utils/memo-poll";
import { useEditorContext, useEditorSelector } from "../state";

interface PollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PollOptionDraft {
  id: string;
  text: string;
  image?: Attachment;
  imageFile?: File;
  imagePreview?: string;
  imageCleared?: boolean;
}

const toInputTime = (seconds?: bigint) => {
  if (!seconds) return "";
  const date = new Date(Number(seconds) * 1000);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

const fromInputTime = (value: string) => (value ? { seconds: BigInt(Math.floor(new Date(value).getTime() / 1000)), nanos: 0 } : undefined);

const PollDialog = ({ open, onOpenChange }: PollDialogProps) => {
  const { actions, dispatch, getState } = useEditorContext();
  const currentPoll = useEditorSelector((state) => state.metadata.poll);
  const currentImageLocalURL = useEditorSelector((state) => state.metadata.pollImageLocalFileURL);
  const currentOptionImageLocalURLs = useEditorSelector((state) => state.metadata.pollOptionImageLocalFileURLs);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<PollOptionDraft[]>([]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [maxSelections, setMaxSelections] = useState(2);
  const [voterType, setVoterType] = useState<VoterType>(VoterType.AUTHENTICATED);
  const [hideResultsUntilVoted, setHideResultsUntilVoted] = useState(false);
  const [showVotersBeforeVoting, setShowVotersBeforeVoting] = useState(false);
  const [showVotersAfterVoting, setShowVotersAfterVoting] = useState(false);
  const [showVoterChoices, setShowVoterChoices] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [imageFile, setImageFile] = useState<File>();
  const [imagePreview, setImagePreview] = useState<string>();
  const [imageCleared, setImageCleared] = useState(false);
  const draftURLs = useRef(new Set<string>());
  const createPreview = (file: File) => {
    const url = URL.createObjectURL(file);
    draftURLs.current.add(url);
    return url;
  };
  const releasePreview = (url?: string) => {
    if (url && draftURLs.current.delete(url)) URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!open) return;
    const urls = draftURLs.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuestion(currentPoll?.question ?? "");
    setOptions(
      currentPoll?.options.map((option) => ({
        id: option.id,
        text: option.text,
        image: option.image,
        imagePreview: currentOptionImageLocalURLs?.[option.id] ?? (option.image ? getAttachmentUrl(option.image) : undefined),
      })) ?? [
        { id: "", text: "" },
        { id: "", text: "" },
      ],
    );
    setAllowMultiple(currentPoll?.allowMultiple ?? false);
    setMaxSelections(currentPoll?.maxSelections || 2);
    setVoterType(currentPoll?.voterType || VoterType.AUTHENTICATED);
    setHideResultsUntilVoted(currentPoll?.hideResultsUntilVoted ?? false);
    setShowVotersBeforeVoting(currentPoll?.showVotersBeforeVoting ?? false);
    setShowVotersAfterVoting(currentPoll?.showVotersAfterVoting ?? false);
    setShowVoterChoices(currentPoll?.showVoterChoices ?? false);
    setStartTime(toInputTime(currentPoll?.startTime?.seconds));
    setEndTime(toInputTime(currentPoll?.endTime?.seconds));
    setImageFile(undefined);
    setImagePreview(currentImageLocalURL || (currentPoll?.image ? getAttachmentUrl(currentPoll.image) : undefined));
    setImageCleared(false);
  }, [currentImageLocalURL, currentOptionImageLocalURLs, currentPoll, open]);

  const updateOption = (index: number, text: string) => {
    setOptions((current) => current.map((option, optionIndex) => (optionIndex === index ? { ...option, text } : option)));
  };

  const createOptionID = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

  const handleOptionImageChange = (index: number, file?: File) => {
    if (!file) return;
    setOptions((current) =>
      current.map((option, optionIndex) => {
        if (optionIndex !== index) return option;
        releasePreview(option.imagePreview);
        return {
          ...option,
          image: undefined,
          imageFile: file,
          imagePreview: createPreview(file),
          imageCleared: false,
        };
      }),
    );
  };

  const clearOptionImage = (index: number) => {
    setOptions((current) =>
      current.map((option, optionIndex) => {
        if (optionIndex !== index) return option;
        releasePreview(option.imagePreview);
        return { ...option, image: undefined, imageFile: undefined, imagePreview: undefined, imageCleared: true };
      }),
    );
  };

  const handleImageChange = (file?: File) => {
    if (!file) return;
    releasePreview(imagePreview);
    setImageFile(file);
    setImagePreview(createPreview(file));
    setImageCleared(false);
  };

  const handleConfirm = () => {
    const optionImageLocalURLs: Record<string, string> = {};
    const poll = create(PollSchema, {
      question: question.trim(),
      options: options.map((option) => {
        const id = option.id || createOptionID();
        if (option.imageFile && option.imagePreview) {
          draftURLs.current.delete(option.imagePreview);
          dispatch(actions.addLocalFile({ file: option.imageFile, previewUrl: option.imagePreview, origin: "upload" }));
          optionImageLocalURLs[id] = option.imagePreview;
        } else if (!option.image && option.imagePreview?.startsWith("blob:")) {
          optionImageLocalURLs[id] = option.imagePreview;
        }
        return create(PollOptionSchema, {
          id,
          text: option.text.trim(),
          image: option.imageCleared ? undefined : option.image,
        });
      }),
      allowMultiple,
      maxSelections: allowMultiple ? Math.min(Math.max(maxSelections, 2), options.length) : 1,
      voterType,
      hideResultsUntilVoted,
      showVotersBeforeVoting: voterType === VoterType.AUTHENTICATED && showVotersBeforeVoting,
      showVotersAfterVoting: voterType === VoterType.AUTHENTICATED && showVotersAfterVoting,
      showVoterChoices: voterType === VoterType.AUTHENTICATED && showVoterChoices,
      startTime: fromInputTime(startTime),
      endTime: fromInputTime(endTime),
      image: imageCleared ? undefined : currentPoll?.image,
    });
    if (imageFile) {
      const previewUrl = imagePreview ?? createPreview(imageFile);
      draftURLs.current.delete(previewUrl);
      if (currentImageLocalURL) dispatch(actions.removeLocalFile(currentImageLocalURL));
      dispatch(actions.addLocalFile({ file: imageFile, previewUrl, origin: "upload" }));
      dispatch(actions.setMetadata({ poll, pollImageLocalFileURL: previewUrl, pollOptionImageLocalFileURLs: optionImageLocalURLs }));
    } else {
      dispatch(
        actions.setMetadata({
          poll,
          pollImageLocalFileURL: imageCleared ? undefined : currentImageLocalURL,
          pollOptionImageLocalFileURLs: optionImageLocalURLs,
        }),
      );
    }
    dispatch(actions.setContent(ensureMemoPollMarker(getState().content)));
    onOpenChange(false);
  };

  const canConfirm = question.trim().length > 0 && options.length >= 2 && options.every((option) => option.text.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{currentPoll ? "编辑投票" : "添加投票"}</DialogTitle>
          <DialogDescription>设置问题、选项、投票权限和时间范围。正文中的 [[vote]] 标记表示投票位置，可单独一行移动。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            投票问题
            <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="你最喜欢哪个？" rows={2} />
          </label>
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">投票选项</div>
            {options.map((option, index) => (
              <div className="flex min-w-0 items-center gap-2" key={`${option.id}-${index}`}>
                <Input
                  className="min-w-0 flex-1"
                  value={option.text}
                  onChange={(event) => updateOption(index, event.target.value)}
                  placeholder={`选项 ${index + 1}`}
                />
                {option.imagePreview && <img src={option.imagePreview} alt="" className="size-9 shrink-0 rounded-md object-cover" />}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="添加选项图片"
                  aria-label={`添加选项 ${index + 1} 图片`}
                  onClick={() => document.getElementById(`poll-option-image-${index}`)?.click()}
                >
                  <ImageIcon className="size-4" />
                </Button>
                <input
                  id={`poll-option-image-${index}`}
                  className="hidden"
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleOptionImageChange(index, event.target.files?.[0])}
                />
                {option.imagePreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="移除选项图片"
                    aria-label={`移除选项 ${index + 1} 图片`}
                    onClick={() => clearOptionImage(index)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                )}
                {options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setOptions((current) => current.filter((_, i) => i !== index))}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => setOptions((current) => [...current, { id: "", text: "" }])}
            >
              <PlusIcon className="size-4" />
              添加选项
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between rounded-md border p-3 text-sm">
              允许多选
              <Switch checked={allowMultiple} onCheckedChange={setAllowMultiple} />
            </label>
            <label className="flex items-center justify-between rounded-md border p-3 text-sm">
              最多选择
              <Input
                className="ml-3 w-20"
                type="number"
                min={2}
                max={Math.max(options.length, 2)}
                disabled={!allowMultiple}
                value={allowMultiple ? maxSelections : 1}
                onChange={(event) => setMaxSelections(Number(event.target.value))}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            投票权限
            <select
              className="h-8 rounded-md border border-border bg-background px-3 text-sm"
              value={voterType}
              onChange={(event) => setVoterType(Number(event.target.value) as VoterType)}
            >
              <option value={VoterType.AUTHENTICATED}>仅登录用户</option>
              <option value={VoterType.ANYONE}>游客也可投票</option>
            </select>
          </label>
          <div className="space-y-3 rounded-md border p-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              投票后才显示票数
              <Switch checked={hideResultsUntilVoted} onCheckedChange={setHideResultsUntilVoted} />
            </label>
            <p className="text-xs text-muted-foreground">关闭时，所有人都能看到票数和比例；开启后，参与投票才能查看。</p>
            {voterType === VoterType.AUTHENTICATED && (
              <>
                <label className="flex items-center justify-between gap-3 text-sm">
                  投票前显示投票用户
                  <Switch checked={showVotersBeforeVoting} onCheckedChange={setShowVotersBeforeVoting} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  投票后显示投票用户
                  <Switch checked={showVotersAfterVoting} onCheckedChange={setShowVotersAfterVoting} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  显示用户所选选项
                  <Switch checked={showVoterChoices} onCheckedChange={setShowVoterChoices} />
                </label>
                <p className="text-xs text-muted-foreground">
                  最多随机显示 10 位参与者的头像。开启选项显示后，点击头像可查看其选择；仅在投票用户可见时生效。关闭显示不会删除投票记录。
                </p>
              </>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              开始时间
              <Input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              截止时间
              <Input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </label>
          </div>
          <div className="flex flex-col gap-2 text-sm font-medium">
            投票图片{imagePreview && <img src={imagePreview} alt="" className="max-h-48 w-fit max-w-full rounded-md object-contain" />}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => document.getElementById("poll-image-input")?.click()}>
                <ImageIcon className="size-4" />
                {imagePreview ? "更换图片" : "选择图片"}
              </Button>
              {imagePreview && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setImageFile(undefined);
                    setImagePreview(undefined);
                    setImageCleared(true);
                  }}
                >
                  移除
                </Button>
              )}
              <input
                id="poll-image-input"
                className="hidden"
                type="file"
                accept="image/*"
                onChange={(event) => handleImageChange(event.target.files?.[0])}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          {currentPoll && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive sm:mr-auto"
              onClick={() => {
                dispatch(
                  actions.setMetadata({ poll: undefined, pollImageLocalFileURL: undefined, pollOptionImageLocalFileURLs: undefined }),
                );
                dispatch(actions.setContent(removeMemoPollMarkers(getState().content)));
                onOpenChange(false);
              }}
            >
              <Trash2Icon className="size-4" />
              删除投票
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={!canConfirm} onClick={handleConfirm}>
            {currentPoll ? "保存投票" : "添加投票"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PollDialog;
