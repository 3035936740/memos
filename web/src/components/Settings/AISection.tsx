import { create } from "@bufbuild/protobuf";
import { isEqual } from "lodash-es";
import { MoreVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useInstance } from "@/contexts/InstanceContext";
import {
  InstanceSetting_AIProviderConfig,
  InstanceSetting_AIProviderConfigSchema,
  InstanceSetting_AIProviderType,
  InstanceSetting_AISettingSchema,
  InstanceSetting_Key,
  InstanceSetting_TranscriptionConfig,
  InstanceSetting_TranscriptionConfigSchema,
  InstanceSettingSchema,
} from "@/types/proto/api/v1/instance_service_pb";
import { useTranslate } from "@/utils/i18n";
import AIWorkflowEditor from "./AIWorkflowEditor";
import SettingGroup from "./SettingGroup";
import { SettingPanel } from "./SettingList";
import SettingSection from "./SettingSection";
import SettingTable from "./SettingTable";
import useInstanceSettingUpdater, { buildInstanceSettingName } from "./useInstanceSettingUpdater";

type LocalAIProvider = {
  id: string;
  title: string;
  type: InstanceSetting_AIProviderType;
  endpoint: string;
  apiKey: string;
  apiKeySet: boolean;
  apiKeyHint: string;
  defaultModel: string;
  reasoningEffort: string;
  azureApiVersion: string;
  headers: { id: string; name: string; value: string }[];
  headersChanged: boolean;
  writingEnabled: boolean;
  supportsVision: boolean;
};

type LocalTranscription = {
  providerId: string;
  model: string;
  language: string;
  prompt: string;
};

const providerTypeOptions = [
  InstanceSetting_AIProviderType.OPENAI,
  InstanceSetting_AIProviderType.GEMINI,
  InstanceSetting_AIProviderType.ANTHROPIC,
  InstanceSetting_AIProviderType.DEEPSEEK,
  InstanceSetting_AIProviderType.OPENAI_COMPATIBLE,
  InstanceSetting_AIProviderType.OLLAMA,
  InstanceSetting_AIProviderType.AZURE_OPENAI,
  InstanceSetting_AIProviderType.JEV,
];

const providerMetadata: Partial<
  Record<
    InstanceSetting_AIProviderType,
    { label: string; title: string; endpoint: string; transcription: boolean; apiKeyRequired: boolean }
  >
> = {
  [InstanceSetting_AIProviderType.JEV]: {
    label: "TypeSafe Jev",
    title: "TypeSafe Jev",
    endpoint: "https://api.typesafe.ai/v1",
    transcription: false,
    apiKeyRequired: true,
  },
  [InstanceSetting_AIProviderType.AZURE_OPENAI]: {
    label: "Azure OpenAI",
    title: "Azure OpenAI",
    endpoint: "",
    transcription: false,
    apiKeyRequired: true,
  },
  [InstanceSetting_AIProviderType.OPENAI]: {
    label: "OpenAI",
    title: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    transcription: true,
    apiKeyRequired: true,
  },
  [InstanceSetting_AIProviderType.GEMINI]: {
    label: "Google Gemini",
    title: "Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    transcription: true,
    apiKeyRequired: true,
  },
  [InstanceSetting_AIProviderType.ANTHROPIC]: {
    label: "Anthropic (Claude)",
    title: "Anthropic Claude",
    endpoint: "https://api.anthropic.com/v1",
    transcription: false,
    apiKeyRequired: true,
  },
  [InstanceSetting_AIProviderType.DEEPSEEK]: {
    label: "DeepSeek",
    title: "DeepSeek",
    endpoint: "https://api.deepseek.com/v1",
    transcription: false,
    apiKeyRequired: true,
  },
  [InstanceSetting_AIProviderType.OPENAI_COMPATIBLE]: {
    label: "OpenAI Compatible",
    title: "OpenAI Compatible",
    endpoint: "",
    transcription: true,
    apiKeyRequired: false,
  },
  [InstanceSetting_AIProviderType.OLLAMA]: {
    label: "Ollama",
    title: "Ollama",
    endpoint: "http://localhost:11434/v1",
    transcription: false,
    apiKeyRequired: false,
  },
};

const byokNotes = ["setting.ai.byok-key-note", "setting.ai.byok-storage-note", "setting.ai.byok-model-note"] as const;

const getProviderTypeLabel = (type: InstanceSetting_AIProviderType, t: ReturnType<typeof useTranslate>) => {
  if (type === InstanceSetting_AIProviderType.OPENAI_COMPATIBLE) return t("ui-extra.openai-compatible");
  return providerMetadata[type as (typeof providerTypeOptions)[number]]?.label ?? InstanceSetting_AIProviderType[type] ?? "UNKNOWN";
};

const providerSupportsTranscription = (provider: LocalAIProvider) =>
  providerMetadata[provider.type as (typeof providerTypeOptions)[number]]?.transcription ?? false;

const providerRequiresAPIKey = (provider: LocalAIProvider) =>
  providerMetadata[provider.type as (typeof providerTypeOptions)[number]]?.apiKeyRequired ?? true;

const getProviderTypeSelectOptions = (t: ReturnType<typeof useTranslate>) =>
  providerTypeOptions.map((type) => ({ value: String(type), label: getProviderTypeLabel(type, t) }));

const toLocalProvider = (provider: InstanceSetting_AIProviderConfig): LocalAIProvider => ({
  id: provider.id,
  title: provider.title,
  type: provider.type,
  endpoint: provider.endpoint,
  apiKey: "",
  apiKeySet: provider.apiKeySet,
  apiKeyHint: provider.apiKeyHint,
  defaultModel: provider.defaultModel,
  reasoningEffort: provider.reasoningEffort,
  azureApiVersion: provider.azureApiVersion,
  headers: provider.customHeaderNames.map((name) => ({ id: uuidv4(), name, value: "" })),
  headersChanged: false,
  writingEnabled: provider.writingEnabled,
  supportsVision: provider.supportsVision,
});

const toLocalTranscription = (config: InstanceSetting_TranscriptionConfig | undefined): LocalTranscription => ({
  providerId: config?.providerId ?? "",
  model: config?.model ?? "",
  language: config?.language ?? "",
  prompt: config?.prompt ?? "",
});

const newProvider = (): LocalAIProvider => ({
  id: uuidv4(),
  title: "",
  type: InstanceSetting_AIProviderType.OPENAI,
  endpoint: "",
  apiKey: "",
  apiKeySet: false,
  apiKeyHint: "",
  defaultModel: "",
  reasoningEffort: "",
  azureApiVersion: "",
  headers: [],
  headersChanged: false,
  writingEnabled: false,
  supportsVision: false,
});

const toProviderConfig = (provider: LocalAIProvider) =>
  create(InstanceSetting_AIProviderConfigSchema, {
    id: provider.id,
    title: provider.title.trim(),
    type: provider.type,
    endpoint: provider.endpoint.trim(),
    apiKey: provider.apiKey,
    writingEnabled: provider.writingEnabled,
    supportsVision: provider.supportsVision,
    defaultModel: provider.defaultModel.trim(),
    reasoningEffort: provider.reasoningEffort,
    azureApiVersion: provider.azureApiVersion.trim(),
    replaceCustomHeaders: provider.headersChanged,
    customHeaders: provider.headersChanged ? Object.fromEntries(provider.headers.map(({ name, value }) => [name.trim(), value])) : {},
  });

const toTranscriptionConfig = (transcription: LocalTranscription) =>
  create(InstanceSetting_TranscriptionConfigSchema, {
    providerId: transcription.providerId,
    model: transcription.model.trim(),
    language: transcription.language.trim(),
    prompt: transcription.prompt,
  });

const AISection = () => {
  const t = useTranslate();
  const saveInstanceSetting = useInstanceSettingUpdater();
  const { aiSetting: originalSetting } = useInstance();
  const [providers, setProviders] = useState<LocalAIProvider[]>(() => originalSetting.providers.map(toLocalProvider));
  const [transcription, setTranscription] = useState<LocalTranscription>(() => toLocalTranscription(originalSetting.transcription));
  const [editingProvider, setEditingProvider] = useState<LocalAIProvider | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<LocalAIProvider | undefined>();

  useEffect(() => {
    setProviders(originalSetting.providers.map(toLocalProvider));
  }, [originalSetting.providers]);

  // Only re-sync the transcription draft when the server-side content actually
  // changes — not on every originalSetting identity change. This prevents
  // provider-side saves (which keep transcription unchanged on the server) from
  // wiping an in-progress transcription draft.
  const lastSyncedTranscription = useRef<LocalTranscription>(toLocalTranscription(originalSetting.transcription));
  useEffect(() => {
    const next = toLocalTranscription(originalSetting.transcription);
    if (!isEqual(lastSyncedTranscription.current, next)) {
      setTranscription(next);
      lastSyncedTranscription.current = next;
    }
  }, [originalSetting.transcription]);

  const originalTranscription = useMemo(() => toLocalTranscription(originalSetting.transcription), [originalSetting.transcription]);
  const transcriptionHasChanges = !isEqual(transcription, originalTranscription);

  const transcriptionProviderRef = useMemo(
    () => providers.find((provider) => provider.id === transcription.providerId),
    [providers, transcription.providerId],
  );

  // Persists the AI setting using a specific providers list and transcription
  // value. Provider operations pass originalSetting.transcription so an
  // in-progress transcription draft is never accidentally committed.
  const persistAISetting = async (
    nextProviders: LocalAIProvider[],
    nextTranscription: InstanceSetting_TranscriptionConfig | undefined,
    errorContext: string,
  ) => {
    return saveInstanceSetting({
      key: InstanceSetting_Key.AI,
      setting: create(InstanceSettingSchema, {
        name: buildInstanceSettingName(InstanceSetting_Key.AI),
        value: {
          case: "aiSetting",
          value: create(InstanceSetting_AISettingSchema, {
            ...originalSetting,
            providers: nextProviders.map(toProviderConfig),
            transcription: nextTranscription,
            textGeneration: originalSetting.textGeneration && {
              ...originalSetting.textGeneration,
              enabled:
                originalSetting.textGeneration.enabled &&
                [originalSetting.textGeneration.planningProviderId, originalSetting.textGeneration.generationProviderId].every((id) =>
                  nextProviders.some((provider) => provider.id === id && provider.writingEnabled),
                ),
            },
          }),
        },
      }),
      errorContext,
    });
  };

  const handleCreateProvider = () => {
    setEditingProvider(newProvider());
  };

  const handleEditProvider = (provider: LocalAIProvider) => {
    setEditingProvider({ ...provider, apiKey: "" });
  };

  const handleSaveProvider = async (provider: LocalAIProvider) => {
    const title = provider.title.trim();
    const endpoint = provider.endpoint.trim();

    if (!title) {
      toast.error(t("setting.ai.provider-title-required"));
      return;
    }
    if (providerRequiresAPIKey(provider) && !provider.apiKeySet && !provider.apiKey.trim()) {
      toast.error(t("setting.ai.api-key-required"));
      return;
    }

    const normalizedProvider = { ...provider, title, endpoint };
    const exists = providers.some((item) => item.id === normalizedProvider.id);
    const nextProviders = exists
      ? providers.map((item) => (item.id === normalizedProvider.id ? normalizedProvider : item))
      : [...providers, normalizedProvider];

    const ok = await persistAISetting(nextProviders, originalSetting.transcription, "Update AI provider");
    if (!ok) return;
    setProviders(nextProviders);
    setEditingProvider(undefined);
  };

  const handleDeleteProvider = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const nextProviders = providers.filter((provider) => provider.id !== target.id);

    // If the persisted transcription references the deleted provider, the
    // server would reject the save (provider_id must reference an existing
    // provider). Send a cleared transcription in that case.
    const persistedTranscription = originalSetting.transcription;
    const nextTranscription =
      persistedTranscription && persistedTranscription.providerId === target.id
        ? create(InstanceSetting_TranscriptionConfigSchema, {})
        : persistedTranscription;

    const ok = await persistAISetting(nextProviders, nextTranscription, "Delete AI provider");
    if (!ok) return;
    setProviders(nextProviders);
    if (transcription.providerId === target.id) {
      setTranscription((prev) => ({ ...prev, providerId: "" }));
    }
    setDeleteTarget(undefined);
  };

  const handleSaveTranscription = async () => {
    if (transcription.providerId && !transcriptionProviderRef) {
      toast.error(t("setting.ai.transcription-empty-providers"));
      return;
    }
    await persistAISetting(providers, toTranscriptionConfig(transcription), "Update transcription");
  };

  return (
    <SettingSection
      title={t("setting.ai.label")}
      actions={
        <Button onClick={handleCreateProvider}>
          <PlusIcon className="w-4 h-4 mr-2" />
          {t("setting.ai.add-provider")}
        </Button>
      }
    >
      <SettingPanel className="bg-muted/30 px-4 py-3">
        <div className="flex max-w-3xl flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground">
              {t("setting.ai.byok-label")}
            </span>
            <h4 className="text-sm font-semibold text-foreground">{t("setting.ai.byok-title")}</h4>
          </div>
          <p className="text-sm text-muted-foreground">{t("setting.ai.byok-description")}</p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {byokNotes.map((note) => (
              <li key={note} className="flex gap-2">
                <span className="mt-2 size-1 rounded-full bg-muted-foreground/60" aria-hidden />
                <span>{t(note)}</span>
              </li>
            ))}
          </ul>
        </div>
      </SettingPanel>

      <SettingGroup title={t("setting.ai.integrations-title")} description={t("setting.ai.integrations-description")}>
        <SettingTable
          columns={[
            {
              key: "title",
              header: t("common.name"),
              render: (_, provider: LocalAIProvider) => (
                <div className="flex flex-col gap-0.5">
                  <span className="text-foreground">{provider.title}</span>
                  <span className="font-mono text-xs text-muted-foreground">{provider.id}</span>
                </div>
              ),
            },
            {
              key: "type",
              header: t("setting.ai.provider-type"),
              render: (_, provider: LocalAIProvider) => <span>{getProviderTypeLabel(provider.type, t)}</span>,
            },
            {
              key: "endpoint",
              header: t("setting.ai.endpoint"),
              render: (_, provider: LocalAIProvider) => (
                <span className="font-mono text-xs">{provider.endpoint || t("setting.ai.default-endpoint")}</span>
              ),
            },
            {
              key: "apiKeySet",
              header: t("setting.ai.api-key"),
              render: (_, provider: LocalAIProvider) => (
                <span className="font-mono text-xs">{provider.apiKeySet ? provider.apiKeyHint || t("setting.ai.configured") : "-"}</span>
              ),
            },
            {
              key: "actions",
              header: "",
              className: "text-right",
              render: (_, provider: LocalAIProvider) => (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                    <MoreVerticalIcon className="w-4 h-auto" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={2}>
                    <DropdownMenuItem onClick={() => handleEditProvider(provider)}>{t("common.edit")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDeleteTarget(provider)} className="text-destructive focus:text-destructive">
                      {t("common.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            },
          ]}
          data={providers}
          emptyMessage={t("setting.ai.no-providers")}
          getRowKey={(provider) => provider.id}
        />
      </SettingGroup>

      <SettingGroup
        title={t("setting.ai.transcription-title")}
        description={t("setting.ai.transcription-description")}
        showSeparator
        actions={
          <Button disabled={!transcriptionHasChanges} onClick={handleSaveTranscription}>
            {t("common.save")}
          </Button>
        }
      >
        <TranscriptionForm
          providers={providers}
          transcription={transcription}
          onChange={setTranscription}
          referencedProvider={transcriptionProviderRef}
        />
      </SettingGroup>

      <AIWorkflowEditor providers={providers.filter((provider) => provider.writingEnabled)} setting={originalSetting} />

      <AIProviderDialog
        provider={editingProvider}
        onOpenChange={(open) => !open && setEditingProvider(undefined)}
        onSave={handleSaveProvider}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title={deleteTarget ? t("setting.ai.delete-provider", { title: deleteTarget.title }) : ""}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={handleDeleteProvider}
        confirmVariant="destructive"
      />
    </SettingSection>
  );
};

interface TranscriptionFormProps {
  providers: LocalAIProvider[];
  transcription: LocalTranscription;
  referencedProvider: LocalAIProvider | undefined;
  onChange: (next: LocalTranscription) => void;
}

const TranscriptionForm = ({ providers, transcription, referencedProvider, onChange }: TranscriptionFormProps) => {
  const t = useTranslate();
  const transcriptionProviders = useMemo(() => providers.filter(providerSupportsTranscription), [providers]);
  const noProviders = transcriptionProviders.length === 0;

  const providerOptions = useMemo(
    () => [
      { value: "__none__", label: t("setting.ai.transcription-no-provider") },
      ...transcriptionProviders.map((provider) => ({ value: provider.id, label: provider.title || provider.id })),
    ],
    [transcriptionProviders, t],
  );

  const update = (partial: Partial<LocalTranscription>) => {
    onChange({ ...transcription, ...partial });
  };

  const placeholderForProvider = (provider: LocalAIProvider | undefined) => {
    if (!provider) return "";
    return provider.type === InstanceSetting_AIProviderType.GEMINI
      ? t("setting.ai.transcription-model-placeholder-gemini")
      : t("setting.ai.transcription-model-placeholder-openai");
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>{t("setting.ai.transcription-provider")}</Label>
        <Select
          value={transcription.providerId || "__none__"}
          items={providerOptions}
          onValueChange={(value) => update({ providerId: value === "__none__" ? "" : value })}
          disabled={noProviders}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providerOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {noProviders && <p className="text-xs text-muted-foreground">{t("setting.ai.transcription-empty-providers")}</p>}
        {referencedProvider && !referencedProvider.apiKeySet && (
          <p className="text-xs text-destructive">{t("setting.ai.transcription-warning-no-key")}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>{t("setting.ai.transcription-model")}</Label>
        <Input
          value={transcription.model}
          onChange={(e) => update({ model: e.target.value })}
          placeholder={placeholderForProvider(referencedProvider)}
          disabled={!transcription.providerId}
          maxLength={256}
        />
        <p className="text-xs text-muted-foreground">{t("setting.ai.transcription-model-help")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("setting.ai.transcription-language")}</Label>
        <Input
          value={transcription.language}
          onChange={(e) => update({ language: e.target.value })}
          placeholder={t("setting.ai.transcription-language-placeholder")}
          disabled={!transcription.providerId}
          maxLength={32}
        />
        <p className="text-xs text-muted-foreground">{t("setting.ai.transcription-language-help")}</p>
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>{t("setting.ai.transcription-prompt")}</Label>
        <Textarea
          value={transcription.prompt}
          onChange={(e) => update({ prompt: e.target.value })}
          placeholder={t("setting.ai.transcription-prompt-placeholder")}
          rows={3}
          disabled={!transcription.providerId}
          maxLength={4096}
        />
        <p className="text-xs text-muted-foreground">{t("setting.ai.transcription-prompt-help")}</p>
      </div>
    </div>
  );
};

interface AIProviderDialogProps {
  provider?: LocalAIProvider;
  onOpenChange: (open: boolean) => void;
  onSave: (provider: LocalAIProvider) => void;
}

const AIProviderDialog = ({ provider, onOpenChange, onSave }: AIProviderDialogProps) => {
  const t = useTranslate();
  const providerTypeSelectOptions = getProviderTypeSelectOptions(t);
  const [draft, setDraft] = useState<LocalAIProvider>(() => provider ?? newProvider());

  useEffect(() => {
    const next = provider ?? newProvider();
    setDraft(next);
  }, [provider]);

  const updateDraft = (partial: Partial<LocalAIProvider>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  };

  const updateProviderType = (type: InstanceSetting_AIProviderType) => {
    const previous = providerMetadata[draft.type as (typeof providerTypeOptions)[number]];
    const next = providerMetadata[type as (typeof providerTypeOptions)[number]];
    setDraft((current) => ({
      ...current,
      type,
      title: !current.title.trim() || current.title === previous?.title ? (next?.title ?? current.title) : current.title,
      endpoint: !current.endpoint.trim() || current.endpoint === previous?.endpoint ? (next?.endpoint ?? "") : current.endpoint,
      reasoningEffort: [
        InstanceSetting_AIProviderType.GEMINI,
        InstanceSetting_AIProviderType.ANTHROPIC,
        InstanceSetting_AIProviderType.JEV,
      ].includes(type)
        ? ""
        : current.reasoningEffort,
      azureApiVersion: type === InstanceSetting_AIProviderType.AZURE_OPENAI ? current.azureApiVersion : "",
      writingEnabled: type === InstanceSetting_AIProviderType.JEV ? false : current.writingEnabled,
    }));
  };

  const handleSave = () => {
    const names = draft.headers.map((header) => header.name.trim().toLowerCase());
    if (names.some((name) => !name) || new Set(names).size !== names.length) {
      toast.error(t("ai-options.invalid-headers"));
      return;
    }
    onSave(draft);
  };

  const reasoningOptions = ["", "none", "minimal", "low", "medium", "high", "xhigh"].map((value) => ({
    value: value || "__default__",
    label: value || t("ai-options.provider-default"),
  }));
  const supportsReasoning = ![
    InstanceSetting_AIProviderType.GEMINI,
    InstanceSetting_AIProviderType.ANTHROPIC,
    InstanceSetting_AIProviderType.JEV,
  ].includes(draft.type);

  return (
    <Dialog open={!!provider} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>{provider?.apiKeySet ? t("setting.ai.edit-provider") : t("setting.ai.add-provider")}</DialogTitle>
          <DialogDescription>{t("setting.ai.dialog-description")}</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-3 [&>div]:min-w-0">
          <div className="flex flex-col gap-1.5">
            <Label>{t("setting.ai.provider-title")}</Label>
            <Input value={draft.title} onChange={(e) => updateDraft({ title: e.target.value })} placeholder="OpenAI" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t("setting.ai.provider-type")}</Label>
            <Select
              value={String(draft.type)}
              items={providerTypeSelectOptions}
              onValueChange={(value) => updateProviderType(Number(value) as InstanceSetting_AIProviderType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providerTypeSelectOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>{t("setting.ai.endpoint")}</Label>
            <Input
              value={draft.endpoint}
              onChange={(e) => updateDraft({ endpoint: e.target.value })}
              placeholder={getDefaultEndpointPlaceholder(draft.type)}
            />
            <p className="text-xs text-muted-foreground">
              {draft.type === InstanceSetting_AIProviderType.OPENAI_COMPATIBLE
                ? t("setting.ai.endpoint-required-hint")
                : t("setting.ai.endpoint-hint")}
            </p>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>
              {t("setting.ai.api-key")}
              {!providerRequiresAPIKey(draft) && <span className="ml-1 text-muted-foreground">({t("setting.ai.api-key-optional")})</span>}
            </Label>
            <Input
              type="password"
              value={draft.apiKey}
              onChange={(e) => updateDraft({ apiKey: e.target.value })}
              placeholder={draft.apiKeySet ? t("setting.ai.keep-api-key") : ""}
            />
            {draft.apiKeySet && (
              <p className="text-xs text-muted-foreground">{t("setting.ai.current-key", { key: draft.apiKeyHint || "-" })}</p>
            )}
          </div>
        </div>

        <SettingPanel className="shrink-0 space-y-3 p-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="ai-writing-enabled">{t("ai-review.writing-enabled")}</Label>
            <Switch
              id="ai-writing-enabled"
              checked={draft.writingEnabled}
              disabled={draft.type === InstanceSetting_AIProviderType.JEV}
              onCheckedChange={(writingEnabled) => updateDraft({ writingEnabled })}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("ai-review.writing-note")}</p>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="ai-supports-vision">{t("ai-review.vision-capability")}</Label>
            <Switch
              id="ai-supports-vision"
              checked={draft.supportsVision}
              onCheckedChange={(supportsVision) => updateDraft({ supportsVision })}
            />
          </div>
          {draft.type === InstanceSetting_AIProviderType.JEV && <p className="text-xs text-muted-foreground">{t("ai-review.jev-note")}</p>}
        </SettingPanel>

        <SettingPanel className="shrink-0 p-3">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 [&>div]:min-w-0">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ai-provider-default-model">
                {t(draft.type === InstanceSetting_AIProviderType.AZURE_OPENAI ? "ai-options.deployment" : "ai-options.model")}
              </Label>
              <Input
                id="ai-provider-default-model"
                value={draft.defaultModel}
                maxLength={256}
                onChange={(event) => updateDraft({ defaultModel: event.target.value })}
              />
              <p className="text-xs text-muted-foreground">{t("ai-options.model-note")}</p>
            </div>
            {supportsReasoning && (
              <div className="flex flex-col gap-1.5">
                <Label>{t("ai-options.reasoning")}</Label>
                <Select
                  value={draft.reasoningEffort || "__default__"}
                  items={reasoningOptions}
                  onValueChange={(value) => updateDraft({ reasoningEffort: value === "__default__" ? "" : value })}
                >
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {reasoningOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("ai-options.reasoning-note")}</p>
              </div>
            )}
            {draft.type === InstanceSetting_AIProviderType.AZURE_OPENAI && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="ai-azure-version">{t("ai-options.azure-version")}</Label>
                <Input
                  id="ai-azure-version"
                  value={draft.azureApiVersion}
                  placeholder="YYYY-MM-DD-preview"
                  onChange={(event) => updateDraft({ azureApiVersion: event.target.value })}
                />
                <p className="text-xs text-muted-foreground">{t("ai-options.azure-note")}</p>
              </div>
            )}
          </div>
        </SettingPanel>

        <SettingPanel className="shrink-0 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Label>{t("ai-options.headers")}</Label>
            <Button
              size="sm"
              variant="outline"
              disabled={draft.headers.length >= 20}
              onClick={() => updateDraft({ headers: [...draft.headers, { id: uuidv4(), name: "", value: "" }], headersChanged: true })}
            >
              <PlusIcon className="size-4" />
              {t("ai-options.add-header")}
            </Button>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            {draft.headers.map((header) => (
              <div
                key={header.id}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]"
              >
                <Input
                  className="min-w-0"
                  aria-label={t("ai-options.header-name")}
                  placeholder="User-Agent"
                  value={header.name}
                  maxLength={128}
                  onChange={(event) =>
                    updateDraft({
                      headers: draft.headers.map((row) => (row.id === header.id ? { ...row, name: event.target.value } : row)),
                      headersChanged: true,
                    })
                  }
                />
                <Input
                  className="col-start-1 row-start-2 min-w-0 sm:col-start-2 sm:row-start-1"
                  type="password"
                  aria-label={t("ai-options.header-value")}
                  value={header.value}
                  placeholder={t("ai-options.header-keep")}
                  maxLength={8192}
                  onChange={(event) =>
                    updateDraft({
                      headers: draft.headers.map((row) => (row.id === header.id ? { ...row, value: event.target.value } : row)),
                      headersChanged: true,
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="col-start-2 row-span-2 sm:col-start-3 sm:row-span-1"
                  aria-label={t("ai-options.remove-header")}
                  onClick={() => updateDraft({ headers: draft.headers.filter((row) => row.id !== header.id), headersChanged: true })}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("ai-options.headers-note")}</p>
        </SettingPanel>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const getDefaultEndpointPlaceholder = (type: InstanceSetting_AIProviderType) => {
  return providerMetadata[type as (typeof providerTypeOptions)[number]]?.endpoint ?? "";
};

export default AISection;
