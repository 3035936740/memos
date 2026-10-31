import { useCallback } from "react";
import { useInstance } from "@/contexts/InstanceContext";
import { type EasterEgg, isEasterEggEnabled } from "@/utils/easter-eggs";

/** Do not start an effect before the public instance settings have loaded. */
export default function useEasterEggs() {
  const { generalSetting, generalSettingLoaded } = useInstance();
  const isEnabled = useCallback(
    (id: EasterEgg) => generalSettingLoaded && isEasterEggEnabled(generalSetting, id),
    [generalSetting, generalSettingLoaded],
  );
  return { isEnabled, ready: generalSettingLoaded, allDisabled: generalSetting.disableEasterEggs };
}
