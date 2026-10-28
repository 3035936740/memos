import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslate } from "@/utils/i18n";
import { maskFinding, PRIVACY_KINDS, type PrivacyFinding } from "@/utils/privacy-check";

/** Masked examples shown per kind; the rest are only counted. */
const SHOWN_PER_KIND = 3;

interface Props {
  findings: PrivacyFinding[];
  /** Replaces the default line about this one memo, e.g. for several memos made public at once. */
  description?: string;
  onKeepEditing: () => void;
  onPublish: () => void;
}

/** Lists what looks private in a memo about to go public, and lets the author go back or publish it as it is. */
const PrivacyCheckDialog = ({ findings, description, onKeepEditing, onPublish }: Props) => {
  const t = useTranslate();
  const groups = PRIVACY_KINDS.map((kind) => ({ kind, items: findings.filter((finding) => finding.kind === kind) })).filter(
    (group) => group.items.length > 0,
  );

  return (
    <Dialog open={findings.length > 0} onOpenChange={(open: boolean) => !open && onKeepEditing()}>
      <DialogContent size="sm" data-privacy-check="">
        <DialogHeader>
          <DialogTitle>{t("editor.privacy-check.title")}</DialogTitle>
          <DialogDescription>{description ?? t("editor.privacy-check.description")}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2 text-sm">
          {groups.map(({ kind, items }) => (
            <li key={kind} className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{t(`editor.privacy-check.kind.${kind}`)}</span>
              <span className="flex flex-wrap gap-x-3 break-all text-xs text-muted-foreground">
                {items.slice(0, SHOWN_PER_KIND).map((finding) => (
                  <span key={finding.text}>{maskFinding(finding)}</span>
                ))}
                {items.length > SHOWN_PER_KIND && <span>{t("editor.privacy-check.more", { count: items.length - SHOWN_PER_KIND })}</span>}
              </span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={onPublish}>
            {t("editor.privacy-check.publish-anyway")}
          </Button>
          <Button onClick={onKeepEditing}>{t("editor.privacy-check.keep-editing")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PrivacyCheckDialog;
