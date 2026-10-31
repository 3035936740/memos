import { useParams } from "react-router-dom";
import { MemoMarkdownRenderer } from "@/components/MemoContent/MemoMarkdownRenderer";
import { useInstance } from "@/contexts/InstanceContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { canAccessInstanceContent, parseInstancePages } from "@/lib/instance-content";
import { useTranslate } from "@/utils/i18n";

const CustomMarkdownPage = () => {
  const t = useTranslate();

  const { slug = "" } = useParams();
  const { generalSetting } = useInstance();
  const currentUser = useCurrentUser();
  const page = parseInstancePages(generalSetting.customPagesJson).find((item) => item.slug === slug);

  if (!page) return <div className="mx-auto w-full max-w-2xl py-6 text-muted-foreground sm:py-8">{t("ui-extra.page-not-found")}</div>;
  if (!canAccessInstanceContent(page.access, currentUser)) {
    return <div className="mx-auto w-full max-w-2xl py-6 text-muted-foreground sm:py-8">{t("ui-extra.page-denied")}</div>;
  }

  return (
    <section className="min-h-full w-full">
      <div data-page-panel="" className="mx-auto w-full max-w-2xl py-6 sm:py-8">
        <h1 className="mb-5 text-3xl font-bold tracking-tight text-foreground">{page.title}</h1>
        <MemoMarkdownRenderer content={page.markdown} resolvedMentionUsernames={new Set()} standalone />
      </div>
    </section>
  );
};

export default CustomMarkdownPage;
