import { useLayoutEffect } from "react";
import { useInstance } from "@/contexts/InstanceContext";
import { useSpaceContext } from "@/contexts/SpaceContext";
import { setBrandFavicon } from "@/utils/brand-logo";
import { spaceAvatarUrl } from "@/utils/space-avatar";

const SpaceDocumentBrand = () => {
  const { generalSetting } = useInstance();
  const { selectedSpace, selectedSpaceName } = useSpaceContext();
  const instanceBrand = generalSetting?.customProfile;

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-space-brand-owner", "");
    return () => {
      document.documentElement.removeAttribute("data-space-brand-owner");
    };
  }, []);

  useLayoutEffect(() => {
    if (selectedSpaceName) {
      document.title = selectedSpace?.title || "Memos Plus";
      void setBrandFavicon(selectedSpace ? spaceAvatarUrl(selectedSpace) || "/space-avatar.svg" : "/favicon.ico");
    } else {
      document.title = instanceBrand?.title || "Memos Plus";
      void setBrandFavicon(instanceBrand?.logoUrl || "/logo.svg");
    }
  }, [instanceBrand, selectedSpace, selectedSpaceName]);

  return null;
};

export default SpaceDocumentBrand;
