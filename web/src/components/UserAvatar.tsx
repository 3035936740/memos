import { UserRoundIcon } from "lucide-react";
import { useOptionalInstance } from "@/contexts/InstanceContext";
import { cn } from "@/lib/utils";
import { isDefaultBrandLogo } from "@/utils/brand-logo";
import { initialBranding } from "@/utils/initial-branding";
import BrandImage from "./BrandImage";

interface Props {
  avatarUrl?: string;
  className?: string;
}

const UserAvatar = (props: Props) => {
  const { avatarUrl, className } = props;
  const instance = useOptionalInstance();
  const source = avatarUrl || (instance ? instance.generalSetting.customProfile?.defaultAvatarUrl : initialBranding?.defaultAvatarUrl);
  return (
    <div className={cn(`w-8 h-8 overflow-clip rounded-xl border border-border`, className)}>
      {source && isDefaultBrandLogo(source) ? (
        <BrandImage src={source} className="h-full w-full" />
      ) : source ? (
        <img className="w-full h-auto shadow min-w-full min-h-full object-cover" src={source} decoding="async" loading="lazy" alt="" />
      ) : (
        <UserRoundIcon className="h-full w-full p-1 text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );
};

export default UserAvatar;
