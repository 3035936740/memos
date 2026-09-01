import { Code, ConnectError } from "@connectrpc/connect";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { useSpaceContext } from "@/contexts/SpaceContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useSpace } from "@/hooks/useSpaceQueries";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/router/routes";
import { useTranslate } from "@/utils/i18n";

// /space/:uid is a stable sharing shortcut, not a separate feed. Resolve the
// Space, make it the current collection, then enter the regular Explore page.
const SpacePage = () => {
  const t = useTranslate();
  const { uid = "" } = useParams();
  const currentUser = useCurrentUser();
  const { selectSpace } = useSpaceContext();
  const spaceQuery = useSpace(currentUser?.name, uid ? `spaces/${uid}` : "");
  const space = spaceQuery.data;

  useEffect(() => {
    if (space) {
      selectSpace(space, ROUTES.EXPLORE);
    }
  }, [selectSpace, space]);

  if (!spaceQuery.isError) {
    return <div className="w-full px-4 py-12 text-center text-sm text-muted-foreground">{t("space.loading")}</div>;
  }

  const needsSignIn = spaceQuery.error instanceof ConnectError && spaceQuery.error.code === Code.Unauthenticated;
  return (
    <div className="w-full max-w-xl px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">{needsSignIn ? t("space.sign-in-required") : t("space.unavailable")}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {needsSignIn ? t("space.sign-in-required-description") : t("space.unavailable-description")}
      </p>
      {needsSignIn ? (
        <Link className={cn(buttonVariants(), "mt-5")} to={`${ROUTES.AUTH}?redirect=${encodeURIComponent(`/space/${uid}`)}`}>
          {t("common.sign-in")}
        </Link>
      ) : null}
    </div>
  );
};

export default SpacePage;
