import { useEffect } from "react";
import { useView } from "@/contexts/ViewContext";
import { useStylePacks } from "@/hooks/useStylePackQueries";
import { applyStylePackStylesheet } from "@/utils/style-packs";

/**
 * Hands the enabled style packs to ViewContext and keeps only the showing pack's stylesheet on the page. A failed
 * fetch hands nothing over, so a saved pack is not dropped over a network hiccup.
 */
const useStylePackLoader = () => {
  const { setStylePacks, stylePack } = useView();
  const { data } = useStylePacks();

  useEffect(() => {
    if (data) setStylePacks(data);
  }, [data, setStylePacks]);

  useEffect(() => {
    applyStylePackStylesheet(stylePack?.cssUrl);
  }, [stylePack?.cssUrl]);
};

export default useStylePackLoader;
