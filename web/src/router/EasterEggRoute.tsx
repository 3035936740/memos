import type { ReactNode } from "react";
import useEasterEggs from "@/hooks/useEasterEggs";
import NotFound from "@/pages/NotFound";
import type { EasterEgg } from "@/utils/easter-eggs";

/** Apply the same setting to direct links as to navigation and effect triggers. */
export default function EasterEggRoute({ id, children }: { id: EasterEgg; children: ReactNode }) {
  const { ready, isEnabled } = useEasterEggs();
  if (!ready) return null;
  return isEnabled(id) ? children : <NotFound />;
}
