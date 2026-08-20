import { useParams } from "react-router-dom";
import MemoView from "@/components/MemoView";
import PagedMemoList, { getMemoKey } from "@/components/PagedMemoList";
import { useInstance } from "@/contexts/InstanceContext";
import { useMemoSorting } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import { canAccessInstanceContent, parseInstanceCategories } from "@/lib/instance-content";
import { State } from "@/types/proto/api/v1/common_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";

const MemoCategory = () => {
  const t = useTranslate();
  const { slug = "" } = useParams();
  const { generalSetting } = useInstance();
  const currentUser = useCurrentUser();
  const category = parseInstanceCategories(generalSetting.memoCategoriesJson).find((item) => item.slug === slug);
  const allowed = !!category && canAccessInstanceContent(category.access, currentUser);
  const { listSort, orderBy } = useMemoSorting({
    pinnedFirst: true,
    state: State.NORMAL,
  });

  if (!category) return <div className="mx-auto w-full max-w-3xl px-4 py-10 text-muted-foreground">{t("memo.category.not-found")}</div>;
  if (!allowed) return <div className="mx-auto w-full max-w-3xl px-4 py-10 text-muted-foreground">{t("memo.category.access-denied")}</div>;

  const filter = `category == ${JSON.stringify(category.slug)}`;

  return (
    <div data-page-shell className="min-h-full w-full bg-background text-foreground">
      <PagedMemoList
        renderer={(memo: Memo, { compact, parentPage }) => (
          <MemoView key={getMemoKey(memo)} memo={memo} parentPage={parentPage} showCreator compact={compact} />
        )}
        listSort={listSort}
        orderBy={orderBy}
        filter={filter}
        showCreator
        renderLeading={() => (
          <div className="mb-4">
            <h1 className="text-3xl font-bold">{category.title}</h1>
            {category.description ? <p className="mt-2 text-muted-foreground">{category.description}</p> : null}
          </div>
        )}
      />
    </div>
  );
};

export default MemoCategory;
