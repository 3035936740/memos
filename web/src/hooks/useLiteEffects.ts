import { useEffect, useState } from "react";
import { EFFECTS_CHANGE_EVENT, isLiteEffects } from "@/utils/effects";

/** Whether low-power mode is on (utils/effects), following changes from Preferences or the frame-rate check. */
const useLiteEffects = () => {
  const [lite, setLite] = useState(isLiteEffects);

  useEffect(() => {
    const update = () => setLite(isLiteEffects());
    window.addEventListener(EFFECTS_CHANGE_EVENT, update);
    return () => window.removeEventListener(EFFECTS_CHANGE_EVENT, update);
  }, []);

  return lite;
};

export default useLiteEffects;
