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

  if (!page) return <div className="mx-auto w-full max-w-2xl py-6 text-muted-foreground sm:py-8">Page not found.</div>;
  if (!canAccessInstanceContent(page.access, currentUser)) {
    return <div className="mx-auto w-full max-w-2xl py-6 text-muted-foreground sm:py-8">You do not have access to this page.</div>;
  }

  return (
    <section className="min-h-full w-full">
      <div className="mx-auto w-full max-w-2xl py-6 sm:py-8">
        <h1 className="mb-5 text-3xl font-bold tracking-tight text-foreground">{page.title}</h1>
        <MemoMarkdownRenderer content={page.markdown} resolvedMentionUsernames={new Set()} standalone />
      </div>
    </section>
  );
};

export default CustomMarkdownPage;
