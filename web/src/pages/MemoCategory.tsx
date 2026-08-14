import { useQueries } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
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
  if (!allowed) return <div className="mx-auto w-full max-w-3xl px-4 py-10 text-muted-foreground">You do not have access to this category.</div>;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col px-4 py-8">
      <h1 className="text-3xl font-bold">{category.title}</h1>
      {category.description && <p className="mb-6 mt-2 text-muted-foreground">{category.description}</p>}
      <div className="mt-5 flex w-full flex-col">
        {queries.map((query, index) =>
          query.data ? <MemoView key={category.memoNames[index]} memo={query.data} showCreator /> : null,
        )}
      </div>
    </section>
  );
};

export default MemoCategory;
