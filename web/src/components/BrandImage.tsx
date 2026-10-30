import { cn } from "@/lib/utils";
import { isDefaultBrandLogo } from "@/utils/brand-logo";

/** A white SVG alpha mask takes its ink from the currently active theme. */
const BrandImage = ({ src, className }: { src: string; className?: string }) =>
  isDefaultBrandLogo(src) ? (
    <span aria-hidden="true" data-brand-logo="" className={cn("inline-block shrink-0", className)}>
      <span
        className="block h-full w-full"
        style={{
          backgroundColor: "var(--primary)",
          mask: 'url("/logo.svg?v=mplus-white-1") center / contain no-repeat',
          WebkitMask: 'url("/logo.svg?v=mplus-white-1") center / contain no-repeat',
        }}
      />
    </span>
  ) : (
    <img src={src} className={className} alt="" decoding="async" />
  );

export default BrandImage;
