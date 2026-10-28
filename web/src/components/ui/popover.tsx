import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import * as React from "react";
import { cn } from "@/lib/utils";
import { popupMotionClasses } from "./popup";

const Popover = ({ ...props }: PopoverPrimitive.Root.Props) => {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
};

const PopoverTrigger = React.forwardRef<HTMLButtonElement, PopoverPrimitive.Trigger.Props>(({ ...props }, ref) => {
  return <PopoverPrimitive.Trigger ref={ref} data-slot="popover-trigger" {...props} />;
});
PopoverTrigger.displayName = "PopoverTrigger";

const PopoverContent = React.forwardRef<
  HTMLDivElement,
  PopoverPrimitive.Popup.Props &
    Pick<PopoverPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset"> & {
      viewportClassName?: string;
    }
>(({ className, viewportClassName, children, align = "center", alignOffset, side, sideOffset = 4, ...props }, ref) => {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-dropdown"
      >
        <PopoverPrimitive.Popup
          ref={ref}
          data-slot="popover-content"
          className={cn(
            "bg-popover text-popover-foreground relative z-dropdown flex max-h-(--available-height) w-auto max-w-(--available-width) flex-col origin-(--transform-origin) overflow-hidden rounded-md border p-1 shadow-md outline-hidden",
            popupMotionClasses,
            className,
          )}
          {...props}
        >
          <div
            data-slot="popover-viewport"
            className={cn(
              "relative z-0 min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [display:inherit] [flex-direction:inherit] [gap:inherit]",
              viewportClassName,
            )}
          >
            {children}
          </div>
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverContent, PopoverTrigger };
