import { useLayoutEffect } from "react";
import { useOptionalInstance } from "@/contexts/InstanceContext";
import { readInstanceBrand } from "@/utils/brand-cache";
import { setBrandFavicon } from "@/utils/brand-logo";
import { setWebAppBrand } from "@/utils/web-app-brand";

/** Also works when an error has unmounted the router or instance provider. */
const ErrorDocumentBrand = () => {
  const profile = useOptionalInstance()?.generalSetting.customProfile ?? readInstanceBrand();
  const title = profile?.title || "Memos Plus";
  const logo = profile?.logoUrl || "/logo.svg";
  const description = profile?.description || "";
  useLayoutEffect(() => {
    document.title = title;
    void setBrandFavicon(logo);
    setWebAppBrand(title, logo, description);
  }, [title, logo, description]);
  return null;
};

export default ErrorDocumentBrand;
