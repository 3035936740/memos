import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2Icon,
  ClipboardCheckIcon,
  Clock3Icon,
  ExternalLinkIcon,
  FilterIcon,
  MapPinIcon,
  MoreVerticalIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  SaveIcon,
  SearchIcon,
  ShieldIcon,
  TagsIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useLocation, useNavigate } from "react-router-dom";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { memoViewServiceClient } from "@/connect";
import { useMemoFilterContext } from "@/contexts/MemoFilterContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import useLoading from "@/hooks/useLoading";
import { useMemoViews, userKeys } from "@/hooks/useUserQueries";
import { handleError } from "@/lib/error";
import { getMemoViewId } from "@/lib/memo-views";
import { cn } from "@/lib/utils";
import { MemoView, MemoViewSchema } from "@/types/proto/api/v1/memo_view_service_pb";
import { useTranslate } from "@/utils/i18n";

const getMemoViewExamples = (t: ReturnType<typeof useTranslate>) => [
  {
    title: t("views.example-1-title"),
    filter: "pinned",
    description: t("views.example-1-description"),
    icon: PinIcon,
  },
  {
    title: t("views.example-2-title"),
    filter: 'created_ts >= now - duration("1h")',
    description: t("views.example-2-description"),
    icon: Clock3Icon,
  },
  {
    title: t("views.example-3-title"),
    filter: 'visibility == "PUBLIC"',
    description: t("views.example-3-description"),
    icon: ShieldIcon,
  },
  {
    title: t("views.example-4-title"),
    filter: 'tag in ["work", "personal"]',
    description: t("views.example-4-description"),
    icon: TagsIcon,
  },
  {
    title: t("views.example-5-title"),
    filter: "size(tags) == 0",
    description: t("views.example-5-description"),
    icon: TagsIcon,
  },
  {
    title: t("views.example-6-title"),
    filter: 'tags.exists(t, t.startsWith("archive"))',
    description: t("views.example-6-description"),
    icon: TagsIcon,
  },
  {
    title: t("views.example-7-title"),
    filter: "has_task_list && has_incomplete_tasks",
    description: t("views.example-7-description"),
    icon: ClipboardCheckIcon,
  },
  {
    title: t("views.example-8-title"),
    filter: "has_link || has_code",
    description: t("views.example-8-description"),
    icon: FilterIcon,
  },
  {
    title: t("views.example-9-title"),
    filter: "!has_location",
    description: t("views.example-9-description"),
    icon: MapPinIcon,
  },
  {
    title: t("views.example-10-title"),
    filter: 'content.contains("TODO")',
    description: t("views.example-10-description"),
    icon: SearchIcon,
  },
  {
    title: t("views.example-11-title"),
    filter: 'content.startsWith("TODO")',
    description: t("views.example-11-description"),
    icon: SearchIcon,
  },
  {
    title: t("views.example-12-title"),
    filter: 'content.matches("v[0-9]+")',
    description: t("views.example-12-description"),
    icon: FilterIcon,
  },
  {
    title: t("views.example-13-title"),
    filter: 'tags.all(t, t.endsWith("-done"))',
    description: t("views.example-13-description"),
    icon: TagsIcon,
  },
  {
    title: t("views.example-14-title"),
    filter: 'tags.exists_one(t, t.startsWith("project/"))',
    description: t("views.example-14-description"),
    icon: TagsIcon,
  },
  {
    title: t("views.example-15-title"),
    filter: 'sets.intersects(tags, ["work", "urgent"])',
    description: t("views.example-15-description"),
    icon: TagsIcon,
  },
  {
    title: t("views.example-16-title"),
    filter: 'sets.equivalent(tags, ["inbox"])',
    description: t("views.example-16-description"),
    icon: TagsIcon,
  },
  {
    title: t("views.example-17-title"),
    filter: "created_ts.getFullYear() == 2024",
    description: t("views.example-17-description"),
    icon: Clock3Icon,
  },
  {
    title: t("views.example-18-title"),
    filter: "created_ts.getDayOfWeek() == 0 || created_ts.getDayOfWeek() == 6",
    description: t("views.example-18-description"),
    icon: Clock3Icon,
  },
  {
    title: t("views.example-19-title"),
    filter: "size(content) > 280",
    description: t("views.example-19-description"),
    icon: FilterIcon,
  },
];

const filterFields = [
  "content.contains(...)",
  "content.startsWith(...)",
  "content.endsWith(...)",
  "content.matches(...)",
  "visibility",
  "pinned",
  "tag in [...]",
  "tags.exists(...)",
  "tags.all(...)",
  "tags.exists_one(...)",
  "sets.contains(tags, [...])",
  "sets.intersects(tags, [...])",
  "sets.equivalent(tags, [...])",
  "size(tags) == ...",
  "size(content) > ...",
  "has_task_list",
  "has_incomplete_tasks",
  "has_link",
  "has_code",
  "has_location",
  'created_ts >= now - duration("24h")',
  "created_ts.getFullYear() == ...",
  "created_ts.getMonth() == ...",
  "created_ts.getDayOfWeek() == ...",
  "updated_ts",
  "now",
  'timestamp("2025-01-01T00:00:00Z")',
];

const createEmptyMemoView = () =>
  create(MemoViewSchema, {
    name: "",
    title: "",
    filter: "",
  });

interface MemoViewGuideProps {
  onUseExample: (example: ReturnType<typeof getMemoViewExamples>[number]) => void;
}

interface MemoViewsRouteState {
  openCreate?: boolean;
  memoView?: MemoView;
}

const MemoViewGuide = ({ onUseExample }: MemoViewGuideProps) => {
  const t = useTranslate();
  const memoViewExamples = getMemoViewExamples(t);
  return (
    <aside className="flex flex-col gap-5">
      <div className="rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("views.examples")}</h2>
        <div className="mt-3 flex flex-col gap-2">
          {memoViewExamples.map((example) => {
            const Icon = example.icon;
            return (
              <button
                type="button"
                key={example.filter}
                className="group w-full cursor-pointer rounded-md border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                onClick={() => onUseExample(example)}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                  {example.title}
                </span>
                <span className="mt-1 block font-mono text-xs leading-5 text-muted-foreground">{example.filter}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{example.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">{t("views.fields")}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {filterFields.map((field) => (
            <Badge key={field} variant="secondary" className="font-mono">
              {field}
            </Badge>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("views.field-note")}</p>
      </div>
    </aside>
  );
};

const MemoViews = () => {
  const t = useTranslate();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const { data: memoViews = [] } = useMemoViews(user?.name);
  const { memoView: selectedMemoView, setMemoView } = useMemoFilterContext();
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [draft, setDraft] = useState<MemoView>(createEmptyMemoView());
  const [deleteTarget, setDeleteTarget] = useState<MemoView | undefined>();
  const createState = useLoading(false);
  const validateState = useLoading(false);
  const updateState = useLoading(false);
  const isEditing = draft.name !== "";
  const isSaving = createState.isLoading || updateState.isLoading;

  useEffect(() => {
    const state = location.state as MemoViewsRouteState | null;
    if (!state) return;

    if (state.memoView) {
      setDraft(
        create(MemoViewSchema, {
          name: state.memoView.name,
          title: state.memoView.title,
          filter: state.memoView.filter,
        }),
      );
      setIsCreateFormOpen(true);
    } else if (state.openCreate) {
      setDraft(createEmptyMemoView());
      setIsCreateFormOpen(true);
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [location.key, location.pathname, location.state, navigate]);

  const setDraftState = (state: Partial<MemoView>) => {
    setDraft((current) => ({ ...current, ...state }));
  };

  const handleUseExample = (example: ReturnType<typeof getMemoViewExamples>[number]) => {
    setDraft(
      create(MemoViewSchema, {
        name: draft.name,
        title: draft.title || example.title,
        filter: example.filter,
      }),
    );
    setIsCreateFormOpen(true);
  };

  const handleOpenCreateForm = () => {
    setDraft(createEmptyMemoView());
    setIsCreateFormOpen(true);
  };

  const handleCloseForm = () => {
    setDraft(createEmptyMemoView());
    setIsCreateFormOpen(false);
  };

  const handleEditMemoView = (memoView: MemoView) => {
    setDraft(
      create(MemoViewSchema, {
        name: memoView.name,
        title: memoView.title,
        filter: memoView.filter,
      }),
    );
    setIsCreateFormOpen(true);
  };

  const validateDraft = async () => {
    if (!draft.title || !draft.filter) {
      toast.error(t("views.required"));
      return false;
    }
    if (!user?.name) {
      toast.error(t("views.no-user"));
      return false;
    }

    try {
      validateState.setLoading();
      await memoViewServiceClient.createMemoView({
        parent: user.name,
        memoView: { name: "", title: draft.title, filter: draft.filter },
        validateOnly: true,
      });
      validateState.setFinish();
      toast.success(t("views.valid"));
      return true;
    } catch (error: unknown) {
      await handleError(error, toast.error, {
        context: "Validate memo view filter",
        onError: () => validateState.setError(),
      });
      return false;
    }
  };

  const handleCreateMemoView = async () => {
    if (!draft.title || !draft.filter) {
      toast.error(t("views.required"));
      return;
    }
    if (!user?.name) {
      toast.error(t("views.no-user"));
      return;
    }

    try {
      createState.setLoading();
      await memoViewServiceClient.createMemoView({
        parent: user.name,
        memoView: { name: "", title: draft.title, filter: draft.filter },
      });
      await queryClient.invalidateQueries({ queryKey: userKeys.memoViews(user.name) });
      createState.setFinish();
      setDraft(createEmptyMemoView());
      setIsCreateFormOpen(false);
      toast.success(t("views.created"));
    } catch (error: unknown) {
      await handleError(error, toast.error, {
        context: "Create memo view",
        onError: () => createState.setError(),
      });
    }
  };

  const handleUpdateMemoView = async () => {
    if (!draft.title || !draft.filter) {
      toast.error(t("views.required"));
      return;
    }

    try {
      updateState.setLoading();
      await memoViewServiceClient.updateMemoView({
        memoView: draft,
        updateMask: create(FieldMaskSchema, { paths: ["title", "filter"] }),
      });
      await queryClient.invalidateQueries({ queryKey: userKeys.memoViews(user?.name) });
      updateState.setFinish();
      setDraft(createEmptyMemoView());
      setIsCreateFormOpen(false);
      toast.success(t("views.updated"));
    } catch (error: unknown) {
      await handleError(error, toast.error, {
        context: "Update memo view",
        onError: () => updateState.setError(),
      });
    }
  };

  const handleSaveMemoView = async () => {
    if (isEditing) {
      await handleUpdateMemoView();
      return;
    }

    await handleCreateMemoView();
  };

  const confirmDeleteMemoView = async () => {
    if (!deleteTarget) return;

    try {
      await memoViewServiceClient.deleteMemoView({ name: deleteTarget.name });
      await queryClient.invalidateQueries({ queryKey: userKeys.memoViews(user?.name) });
      if (selectedMemoView === getMemoViewId(deleteTarget.name)) setMemoView(undefined);
      toast.success(t("setting.memo-view.delete-success", { title: deleteTarget.title }));
    } catch (error: unknown) {
      await handleError(error, toast.error, {
        context: "Delete memo view",
      });
    } finally {
      setDeleteTarget(undefined);
    }
  };

  return (
    <section data-page-panel="" className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FilterIcon className="h-4 w-4" />
            <span className="text-sm font-medium">{t("common.views")}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">{t("common.views")}</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{t("views.description")}</p>
        </div>
        <Button onClick={isCreateFormOpen ? handleCloseForm : handleOpenCreateForm}>
          {isCreateFormOpen ? <XIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
          {isCreateFormOpen ? t("common.cancel") : t("common.create")}
        </Button>
      </div>

      <div className={cn("grid grid-cols-1 gap-6", isCreateFormOpen && "xl:grid-cols-[minmax(0,1fr)_20rem]")}>
        <div className="flex min-w-0 flex-col gap-6">
          <div
            className={cn(
              "overflow-hidden rounded-lg border border-border bg-background transition-[max-height,opacity] duration-200",
              isCreateFormOpen ? "max-h-[48rem] opacity-100" : "max-h-0 border-transparent opacity-0",
            )}
          >
            <div className="grid gap-5 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">{isEditing ? t("views.edit") : t("views.create")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t("views.form-description")}</p>
                </div>
                <a
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  href="https://www.usememos.com/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("views.docs")}
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                </a>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="view-title">{t("common.title")}</Label>
                  <Input
                    id="view-title"
                    value={draft.title}
                    placeholder={t("views.title-placeholder")}
                    onChange={(event) => setDraftState({ title: event.target.value })}
                  />
                  <p className="text-xs leading-5 text-muted-foreground">{t("views.emoji-tip")}</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="view-filter">{t("common.filter")}</Label>
                  <Textarea
                    id="view-filter"
                    rows={5}
                    className="font-mono text-sm"
                    value={draft.filter}
                    placeholder='pinned && tag in ["work"]'
                    onChange={(event) => setDraftState({ filter: event.target.value })}
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t("views.syntax", {
                      and: "&&",
                      or: "||",
                      not: "!",
                      now: "now",
                      duration: 'duration("24h")',
                      timestamp: "timestamp(...)",
                      year: "created_ts.getFullYear()",
                      sets: "sets.contains/intersects/equivalent",
                      size: "size(content)",
                    })}
                  </p>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" disabled={validateState.isLoading || isSaving} onClick={validateDraft}>
                  <CheckCircle2Icon className="h-4 w-4" />
                  {t("views.validate")}
                </Button>
                <Button disabled={isSaving || validateState.isLoading} onClick={handleSaveMemoView}>
                  <SaveIcon className="h-4 w-4" />
                  {t("common.save")}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">{t("views.all")}</h2>
              <Badge variant="outline">{memoViews.length}</Badge>
            </div>

            {memoViews.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
                <p className="text-sm font-medium text-foreground">{t("views.empty")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("views.empty-note")}</p>
              </div>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {memoViews.map((memoView) => (
                  <div
                    key={memoView.name}
                    className="grid gap-3 bg-background px-4 py-3 sm:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)_2rem]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{memoView.title}</div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">{getMemoViewId(memoView.name)}</div>
                    </div>
                    <pre className="min-w-0 overflow-x-auto rounded-md bg-muted/50 px-3 py-2 font-mono text-xs leading-5 text-muted-foreground">
                      {memoView.filter}
                    </pre>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="justify-self-end" />}>
                        <MoreVerticalIcon className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditMemoView(memoView)}>
                          <PencilIcon className="h-4 w-4" />
                          {t("common.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeleteTarget(memoView)}>
                          <Trash2Icon className="h-4 w-4" />
                          {t("common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {isCreateFormOpen ? <MemoViewGuide onUseExample={handleUseExample} /> : null}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title={t("setting.memo-view.delete-confirm", { title: deleteTarget?.title ?? "" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmDeleteMemoView}
        confirmVariant="destructive"
      />
    </section>
  );
};

export default MemoViews;
