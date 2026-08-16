import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import BlogMemoView from "@/components/BlogMemoView";
import BlogSidebar from "@/components/BlogSidebar";
import { MentionResolutionProvider } from "@/components/MemoContent/MentionResolutionContext";
import MemoView from "@/components/MemoView";
import { memoServiceClient } from "@/connect";
import { useInstance } from "@/contexts/InstanceContext";
import { useView } from "@/contexts/ViewContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { canAccessInstanceContent, parseInstanceCategories } from "@/lib/instance-content";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

const MemoCategory = () => {
  const { slug = "" } = useParams();
  const { generalSetting } = useInstance();
  const { feedLayout, compactMode } = useView();
  const currentUser = useCurrentUser();
  const category = parseInstanceCategories(generalSetting.memoCategoriesJson).find((item) => item.slug === slug);
  const allowed = !!category && canAccessInstanceContent(category.access, currentUser);
  const memoNames = allowed ? category.memoNames : [];
  const queries = useQueries({
    queries: memoNames.map((name) => ({
      queryKey: ["instance-category", slug, name],
      queryFn: () => memoServiceClient.getMemo({ name }),
      staleTime: 60_000,
    })),
  });

  const memos = useMemo(() => {
    const loaded: Memo[] = [];
    for (const query of queries) {
      if (query.data) loaded.push(query.data);
    }
    return loaded;
  }, [queries]);
  const contents = useMemo(() => memos.map((memo) => memo.content), [memos]);
  const userNames = useMemo(() => Array.from(new Set(memos.map((memo) => memo.creator))), [memos]);

  if (!category) return <div className="mx-auto w-full max-w-3xl px-4 py-10 text-muted-foreground">Category not found.</div>;
  if (!allowed)
    return <div className="mx-auto w-full max-w-3xl px-4 py-10 text-muted-foreground">You do not have access to this category.</div>;

  const parentPage = `/categories/${category.slug}`;
  const isBlog = feedLayout === "blog";

  const header = (
    <>
      <h1 className="text-3xl font-bold">{category.title}</h1>
      {category.description && <p className="mb-6 mt-2 text-muted-foreground">{category.description}</p>}
    </>
  );

  const memoList = memos.map((memo) =>
    isBlog ? (
      <BlogMemoView key={memo.name} memo={memo} parentPage={parentPage} showCreator />
    ) : (
      <MemoView key={memo.name} memo={memo} parentPage={parentPage} showCreator compact={compactMode} />
    ),
  );

  return (
    <div data-page-shell className="min-h-full w-full bg-background text-foreground">
      <MentionResolutionProvider contents={contents} userNames={userNames}>
        {isBlog ? (
          <section className="mx-auto w-full max-w-6xl px-4 py-8 lg:grid lg:grid-cols-[minmax(0,48rem)_15rem] lg:items-start lg:gap-4">
            <main className="min-w-0">
              {header}
              <div className="mt-5 flex w-full flex-col">{memoList}</div>
              <div className="mt-4 lg:hidden">
                <BlogSidebar parentPage={parentPage} />
              </div>
            </main>
            <aside className="sticky top-4 hidden min-w-0 lg:block">
              <BlogSidebar parentPage={parentPage} />
            </aside>
          </section>
        ) : (
          <section className="mx-auto w-full max-w-2xl px-4 py-8">
            {header}
            <div className="mt-5 flex w-full flex-col">{memoList}</div>
          </section>
        )}
      </MentionResolutionProvider>
    </div>
  );
};

export default MemoCategory;
