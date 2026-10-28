import { create } from "@bufbuild/protobuf";
import { BriefcaseIcon, PenLineIcon, UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import useInstanceSettingUpdater, { buildInstanceSettingName } from "@/components/Settings/useInstanceSettingUpdater";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useInstance } from "@/contexts/InstanceContext";
import { useView } from "@/contexts/ViewContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";
import {
  type InstanceSetting_GeneralSetting,
  InstanceSetting_GeneralSetting_CustomProfileSchema,
  InstanceSetting_GeneralSettingSchema,
  InstanceSetting_Key,
  InstanceSettingSchema,
} from "@/types/proto/api/v1/instance_service_pb";
import { BLOG_STYLE_OPTIONS, type BlogStyle, SECRET_BLOG_STYLES } from "@/utils/blog-style";
import { useTranslate } from "@/utils/i18n";
import {
  isSetupDone,
  looksUnconfigured,
  markSetupDone,
  OPEN_SETUP_EVENT,
  SITE_PRESETS,
  SITE_TYPES,
  type SiteType,
} from "@/utils/setup-wizard";
import { THEME_OPTIONS } from "@/utils/theme";
import { isSuperUser } from "@/utils/user";

const SITE_TYPE_ICONS = { blog: PenLineIcon, community: UsersIcon, team: BriefcaseIcon };
const STEPS = ["site", "purpose", "look"] as const;

/**
 * The first-run setup for a new Memos Plus site, shown once to the administrator: the site's name, what it is for
 * (which presets registration and default visibility), and the look new visitors get. Settings → System can open
 * it again.
 */
const SetupWizard = () => {
  const currentUser = useCurrentUser();
  const { generalSetting, isInitialized } = useInstance();
  const [open, setOpen] = useState(false);
  const admin = isSuperUser(currentUser);
  const saveSetupSetting = useInstanceSettingUpdater();

  useEffect(() => {
    if (admin && isInitialized && generalSetting && !generalSetting.setupCompleted && !isSetupDone() && looksUnconfigured(generalSetting))
      setOpen(true);
  }, [admin, generalSetting, isInitialized]);

  useEffect(() => {
    if (!admin) return;
    const handleOpen = () => setOpen(true);
    window.addEventListener(OPEN_SETUP_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_SETUP_EVENT, handleOpen);
  }, [admin]);

  if (!open || !generalSetting) return null;
  return (
    <SetupWizardDialog
      generalSetting={generalSetting}
      onClose={(saved) => {
        if (!saved) {
          void saveSetupSetting({
            key: InstanceSetting_Key.GENERAL,
            setting: create(InstanceSettingSchema, {
              name: buildInstanceSettingName(InstanceSetting_Key.GENERAL),
              value: {
                case: "generalSetting",
                value: create(InstanceSetting_GeneralSettingSchema, { ...generalSetting, setupCompleted: true }),
              },
            }),
            errorContext: "Skip setup wizard",
            showSuccessToast: false,
          }).then((ok) => {
            if (ok) {
              markSetupDone();
              setOpen(false);
            }
          });
        } else {
          markSetupDone();
          setOpen(false);
        }
      }}
    />
  );
};

const SetupWizardDialog = ({
  generalSetting,
  onClose,
}: {
  generalSetting: InstanceSetting_GeneralSetting;
  onClose: (saved?: boolean) => void;
}) => {
  const t = useTranslate();
  const saveInstanceSetting = useInstanceSettingUpdater();
  const { setBlogStyle, setFeedLayout } = useView();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(generalSetting.customProfile?.title ?? "");
  const [description, setDescription] = useState(generalSetting.customProfile?.description ?? "");
  const [siteType, setSiteType] = useState<SiteType>("blog");
  const [style, setStyle] = useState<BlogStyle>(SITE_PRESETS.blog.style);
  const [theme, setTheme] = useState(generalSetting.firstVisitDefaultTheme || "default");
  const [saving, setSaving] = useState(false);
  const styleOptions = BLOG_STYLE_OPTIONS.filter((option) => !SECRET_BLOG_STYLES.includes(option.value));
  const themeOptions = THEME_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }));
  const stepId = STEPS[step];

  const chooseSiteType = (type: SiteType) => {
    setSiteType(type);
    setStyle(SITE_PRESETS[type].style);
  };

  const finish = async () => {
    const preset = SITE_PRESETS[siteType];
    setSaving(true);
    const saved = await saveInstanceSetting({
      key: InstanceSetting_Key.GENERAL,
      setting: create(InstanceSettingSchema, {
        name: buildInstanceSettingName(InstanceSetting_Key.GENERAL),
        value: {
          case: "generalSetting",
          value: create(InstanceSetting_GeneralSettingSchema, {
            ...generalSetting,
            customProfile: create(InstanceSetting_GeneralSetting_CustomProfileSchema, {
              logoUrl: generalSetting.customProfile?.logoUrl ?? "",
              title: title.trim(),
              description: description.trim(),
            }),
            disallowUserRegistration: preset.disallowUserRegistration,
            defaultMemberMemoVisibility: preset.defaultMemberMemoVisibility,
            firstVisitDefaultStyle: style,
            firstVisitDefaultTheme: theme,
            setupCompleted: true,
          }),
        },
      }),
      errorContext: "Save setup wizard",
      showSuccessToast: false,
    });
    setSaving(false);
    if (!saved) return;
    // The administrator sees the chosen look straight away, as new visitors will.
    if (style !== "default") {
      setFeedLayout("blog2");
      setBlogStyle(style);
    }
    toast.success(t("setup.done"));
    onClose(true);
  };

  return (
    <Dialog open onOpenChange={(open: boolean) => !open && !saving && onClose()}>
      <DialogContent size="lg" data-setup-wizard="">
        <DialogHeader>
          <DialogTitle>{t("setup.title")}</DialogTitle>
          <DialogDescription>{t(`setup.step-${stepId}-description`)}</DialogDescription>
        </DialogHeader>

        <ol aria-label={t("setup.progress")} className="flex gap-1.5">
          {STEPS.map((id, index) => (
            <li
              key={id}
              aria-current={index === step ? "step" : undefined}
              className={cn("h-1 flex-1 rounded-full", index <= step ? "bg-primary" : "bg-muted")}
            >
              <span className="sr-only">{t(`setup.step-${id}`)}</span>
            </li>
          ))}
        </ol>

        {stepId === "site" && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{t("setup.site-title")}</span>
              <Input autoFocus value={title} maxLength={80} placeholder="Memos Plus" onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{t("setup.site-description")}</span>
              <Textarea
                rows={2}
                value={description}
                maxLength={200}
                placeholder={t("setup.site-description-placeholder")}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>
        )}

        {stepId === "purpose" && (
          <div role="radiogroup" aria-label={t("setup.step-purpose")} className="grid gap-2 sm:grid-cols-3">
            {SITE_TYPES.map((type) => {
              const Icon = SITE_TYPE_ICONS[type];
              const selected = siteType === type;
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => chooseSiteType(type)}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors",
                    selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50",
                  )}
                >
                  <Icon className={cn("size-5", selected ? "text-primary" : "text-muted-foreground")} />
                  <span className="text-sm font-medium">{t(`setup.type-${type}`)}</span>
                  <span className="text-xs leading-5 text-muted-foreground">{t(`setup.type-${type}-description`)}</span>
                </button>
              );
            })}
          </div>
        )}

        {stepId === "look" && (
          <div className="flex flex-col gap-4">
            <div role="radiogroup" aria-label={t("setup.style")} className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("setup.style")}</span>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {styleOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={style === option.value}
                    onClick={() => setStyle(option.value)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      style === option.value ? "border-primary bg-primary/5 font-medium" : "border-border hover:bg-accent/50",
                    )}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{t("setup.theme")}</span>
              <Select value={theme} items={themeOptions} onValueChange={(value) => setTheme(value)}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[min(18rem,var(--available-height))]">
                  {themeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <p className="text-xs leading-5 text-muted-foreground">{t("setup.look-note")}</p>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" disabled={saving} onClick={() => onClose()}>
            {t("setup.later")}
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" disabled={saving} onClick={() => setStep(step - 1)}>
                {t("setup.back")}
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep(step + 1)}>{t("setup.next")}</Button>
            ) : (
              <Button disabled={saving} onClick={() => void finish()}>
                {t("setup.finish")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SetupWizard;
