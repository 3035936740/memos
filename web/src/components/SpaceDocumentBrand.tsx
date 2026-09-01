import { useEffect } from "react";
import { useInstance } from "@/contexts/InstanceContext";
import { useSpaceContext } from "@/contexts/SpaceContext";

const SpaceDocumentBrand = () => {
  const { generalSetting } = useInstance();
  const { selectedSpace } = useSpaceContext();
  const instanceBrand = generalSetting?.customProfile;

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;

      document.title = selectedSpace?.title || instanceBrand?.title || "Memos";
      const icon = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (icon) {
        icon.href = selectedSpace?.avatarUrl || instanceBrand?.logoUrl || "/logo.webp";
      }
    });

    return () => {
      active = false;
    };
  }, [instanceBrand, selectedSpace]);

  return null;
};

export default SpaceDocumentBrand;
