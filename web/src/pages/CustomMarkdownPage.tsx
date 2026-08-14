import { useParams } from "react-router-dom";
import { MemoMarkdownRenderer } from "@/components/MemoContent/MemoMarkdownRenderer";
import { useInstance } from "@/contexts/InstanceContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { canAccessInstanceContent, parseInstancePages } from "@/lib/instance-content";

const CustomMarkdownPage = () => {
  const { slug = "" } = useParams();
  const { generalSetting } = useInstance();
  const currentUser = useCurrentUser();
  const page = parseInstancePages(generalSetting.customPagesJson).find((item) => item.slug === slug);

  if (!page) return <div className="mx-auto w-full max-w-3xl px-4 py-10 text-muted-foreground">Page not found.</div>;
  if (!canAccessInstanceContent(page.access, currentUser)) {
    return <div className="mx-auto w-full max-w-3xl px-4 py-10 text-muted-foreground">You do not have access to this page.</div>;
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8">
      <article className="border-border bg-card text-card-foreground rounded-lg border px-5 py-4">
        <h1 className="mb-5 text-3xl font-bold">{page.title}</h1>
        <MemoMarkdownRenderer content={page.markdown} resolvedMentionUsernames={new Set()} standalone />
      </article>
    </section>
  );
};

export default CustomMarkdownPage;
