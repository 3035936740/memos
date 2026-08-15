import { useQueries } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import BlogSidebar from "@/components/BlogSidebar";
import MemoView from "@/components/MemoView";
import { memoServiceClient } from "@/connect";
import { useInstance } from "@/contexts/InstanceContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { canAccessInstanceContent, parseInstanceCategories } from "@/lib/instance-content";

const MemoCategory = () => {
  const { slug = "" } = useParams();
  const { generalSetting } = useInstance();
  const currentUser = useCurrentUser();
  const category = parseInstanceCategories(generalSetting.memoCategoriesJson).find((item) => item.slug === slug);
  const allowed = !!category && canAccessInstanceContent(category.access, currentUser);
  const queries = useQueries({
    queries: (allowed ? category.memoNames : []).map((name) => ({
      queryKey: ["instance-category", slug, name],
      queryFn: () => memoServiceClient.getMemo({ name }),
      staleTime: 60_000,
    })),
  });

  if (!category) return <div className="mx-auto w-full max-w-3xl px-4 py-10 text-muted-foreground">Category not found.</div>;
  if (!allowed)
    return <div className="mx-auto w-full max-w-3xl px-4 py-10 text-muted-foreground">You do not have access to this category.</div>;

  const parentPage = `/categories/${category.slug}`;

  return (
    <div data-page-shell className="min-h-full w-full bg-background text-foreground">
      <section className="mx-auto w-full max-w-6xl px-4 py-8 lg:grid lg:grid-cols-[minmax(0,48rem)_15rem] lg:items-start lg:gap-4">
        <main className="min-w-0">
          <h1 className="text-3xl font-bold">{category.title}</h1>
          {category.description && <p className="mb-6 mt-2 text-muted-foreground">{category.description}</p>}
          <div className="mt-5 flex w-full flex-col">
            {queries.map((query, index) =>
              query.data ? <MemoView key={category.memoNames[index]} memo={query.data} parentPage={parentPage} showCreator /> : null,
            )}
          </div>
          <div className="mt-4 lg:hidden">
            <BlogSidebar parentPage={parentPage} />
          </div>
        </main>
        <aside className="sticky top-4 hidden min-w-0 lg:block">
          <BlogSidebar parentPage={parentPage} />
        </aside>
      </section>
    </div>
  );
};

export default MemoCategory;
