import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEmojiPacks } from "@/utils/emoji";
import { useTranslate } from "@/utils/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (token: string) => void;
}

const EmojiPickerDialog = ({ open, onOpenChange, onSelect }: Props) => {
  const t = useTranslate();
  const { data: groups = [], isLoading } = useEmojiPacks();
  const [groupID, setGroupID] = useState("");

  useEffect(() => {
    if (!groups.some((group) => String(group.id) === groupID)) setGroupID(groups[0] ? String(groups[0].id) : "");
  }, [groupID, groups]);

  const group = groups.find((item) => String(item.id) === groupID);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t("emoji.picker.title")}</DialogTitle>
          <DialogDescription>{t("emoji.picker.description")}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("emoji.picker.empty")}</p>
        ) : (
          <Tabs value={groupID} onValueChange={setGroupID} className="min-h-0">
            <TabsList className="mb-3 max-w-full overflow-x-auto rounded-lg bg-muted p-1">
              {groups.map((item) => (
                <TabsTrigger key={item.id} value={String(item.id)}>
                  {item.name}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="grid max-h-[50vh] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
              {group?.emojis.map((emoji) => (
                <button
                  key={emoji.id}
                  type="button"
                  title={`${emoji.name} ${emoji.token}`}
                  className="group flex min-w-0 flex-col items-center gap-1 rounded-md p-2 hover:bg-accent"
                  onClick={() => {
                    onSelect(emoji.token);
                    onOpenChange(false);
                  }}
                >
                  <img
                    src={emoji.url}
                    alt={emoji.name}
                    loading="lazy"
                    className="size-16 object-contain transition-transform group-hover:scale-105"
                  />
                  <span className="w-full truncate text-center text-xs text-muted-foreground">{emoji.name}</span>
                </button>
              ))}
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EmojiPickerDialog;
