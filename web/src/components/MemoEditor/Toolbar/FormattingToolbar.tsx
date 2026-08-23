import {
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  type LucideIcon,
  Minimize2Icon,
  MoreHorizontalIcon,
  TypeIcon,
  XIcon,
} from "lucide-react";
import { type ComponentPropsWithoutRef, forwardRef, type MouseEventHandler, type RefObject, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { normalizeMemoTextColor, normalizeMemoTextSize } from "@/utils/memo-rich-text";
import {
  EDITOR_COMMANDS,
  type EditorCommand,
  type EditorCommandContext,
  type EditorCommandId,
  isCommandActive,
  type ToolbarHeadingLevel,
} from "../formatting/commands";
import { isCompactWidth, useEditorActiveState, useElementWidth } from "../hooks";
import type { EditorController } from "../types";

interface FormattingToolbarProps {
  controllerRef: RefObject<EditorController | null>;
  /**
   * Trailing dismiss button for the frame the editor sits in: "minimize" collapses
   * focus mode back into the page, "close" dismisses a host-owned frame. Omitted on
   * the inline normal-mode toolbar, which has no frame to leave.
   */
  exit?: { action: "minimize" | "close"; onExit: () => void };
  /** Extra classes for the host to frame the toolbar row. */
  className?: string;
}

const MARK_COMMANDS = EDITOR_COMMANDS.filter((command) => command.group === "mark");
const BLOCK_COMMANDS = EDITOR_COMMANDS.filter((command) => command.group === "block");
// Paragraph + headings render as a single icon dropdown (a closed set); the
// trigger glyph reflects the current block level.
const HEADING_COMMANDS = EDITOR_COMMANDS.filter((command) => command.group === "heading");
const ALIGNMENT_COMMANDS = EDITOR_COMMANDS.filter((command) => command.group === "alignment");
const COLOR_COMMAND = EDITOR_COMMANDS.find((command) => command.group === "color");
const SIZE_COMMAND = EDITOR_COMMANDS.find((command) => command.group === "size");
const HEADING_LEVEL_ICONS: Record<ToolbarHeadingLevel, LucideIcon> = { 1: Heading1Icon, 2: Heading2Icon, 3: Heading3Icon };

interface ToolbarButton {
  Icon?: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}

// Button styling: quiet ghost controls that sit directly on the editor surface
// (no filled track or border — that container read as a heavy slab). The active
// verb is the only filled element, so the toolbar recedes and the current state
// carries the weight. Kept as raw buttons (not the Button kit) because the idle
// hover + active treatment don't map to a single kit variant, and per policy a
// custom look is raw HTML rather than className overrides on the kit.
const SEGMENT_BASE =
  "inline-flex items-center justify-center h-7 min-w-7 px-1.5 rounded-md text-sm transition-colors outline-none touch-manipulation focus-visible:ring-2 focus-visible:ring-ring";
const SEGMENT_IDLE = "text-muted-foreground hover:text-foreground hover:bg-foreground/5";
const SEGMENT_ACTIVE = "bg-accent text-accent-foreground";

const NORMALIZED_RGBA_PATTERN = /^rgba\((\d+), (\d+), (\d+), (0(?:\.\d+)?|1(?:\.0+)?)\)$/;

function parseMemoTextColor(value: string | null | undefined) {
  const normalized = normalizeMemoTextColor(value ?? "");
  const match = normalized ? NORMALIZED_RGBA_PATTERN.exec(normalized) : null;
  if (!match) return undefined;
  return {
    red: Number(match[1]),
    green: Number(match[2]),
    blue: Number(match[3]),
    alpha: Number(match[4]),
  };
}

function memoTextColorToHex(value: string | null | undefined) {
  const color = parseMemoTextColor(value);
  if (!color) return "#000000";
  return `#${[color.red, color.green, color.blue].map((component) => component.toString(16).padStart(2, "0")).join("")}`;
}

function pickerHexToMemoTextColor(hex: string, alpha: number) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

// Command buttons must not take focus on mousedown — that blurs the editor and
// drops the selection the command targets. The click still fires and applies the
// format to the live selection.
const preventFocusSteal: MouseEventHandler<HTMLButtonElement> = (event) => event.preventDefault();

/**
 * Formatting toolbar: a lean inline row of the heading picker plus mark/block
 * controls, every one derived from the shared command catalog
 * (formatting/commands.ts), so adding a verb there surfaces it here automatically.
 * Groups are separated by thin vertical dividers. Responsive: below
 * COMPACT_TOOLBAR_WIDTH the block controls fold into a "more" menu while marks
 * stay inline. When the editor sits in a frame, the button that dismisses it is
 * pushed to the far edge.
 */
export function FormattingToolbar({ controllerRef, exit, className }: FormattingToolbarProps) {
  const t = useTranslate();
  const rootRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(rootRef);
  const compact = isCompactWidth(width);
  const active = useEditorActiveState(controllerRef);
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false);
  const [colorInput, setColorInput] = useState("");
  const [colorError, setColorError] = useState(false);
  const [sizePopoverOpen, setSizePopoverOpen] = useState(false);
  const [sizeInput, setSizeInput] = useState("");
  const [sizeError, setSizeError] = useState(false);

  const run = (id: EditorCommandId, context?: EditorCommandContext) => {
    if (context) controllerRef.current?.formatting?.run(id, context);
    else controllerRef.current?.formatting?.run(id);
  };

  useEffect(() => {
    if (!colorPopoverOpen) setColorInput(active.textColor ?? "");
  }, [active.textColor, colorPopoverOpen]);

  useEffect(() => {
    if (!sizePopoverOpen) setSizeInput(active.fontSize?.replace(/px$/u, "") ?? "");
  }, [active.fontSize, sizePopoverOpen]);

  // Menus grab focus while open and hand it back to their trigger on close; send
  // it to the editor instead so the user can keep typing after a pick.
  const returnFocusToEditor = () => {
    controllerRef.current?.focus();
    return false;
  };

  // Map a catalog command to a toolbar button.
  const toButton = (command: EditorCommand): ToolbarButton => ({
    Icon: command.icon,
    label: t(command.labelKey),
    active: isCommandActive(active, command.id),
    onClick: () => run(command.id),
  });

  // Type glyph for paragraph, else the matching Hn glyph. Deeper levels (H4–H6)
  // aren't toolbar-addressable and report as null, i.e. the Type glyph.
  const HeadingGlyph = active.headingLevel === null ? TypeIcon : HEADING_LEVEL_ICONS[active.headingLevel];
  const ExitIcon = exit?.action === "close" ? XIcon : Minimize2Icon;
  const exitLabel = exit && t(exit.action === "close" ? "common.close" : "editor.exit-focus-mode");
  const markButtons = MARK_COMMANDS.map(toButton);
  const blockButtons = BLOCK_COMMANDS.map(toButton);
  const alignmentButtons = ALIGNMENT_COMMANDS.map(toButton);
  const colorButton = COLOR_COMMAND ? toButton(COLOR_COMMAND) : undefined;
  const sizeButton = SIZE_COMMAND ? toButton(SIZE_COMMAND) : undefined;
  const colorPickerHex = memoTextColorToHex(colorInput || active.textColor);

  const applyTextColor = () => {
    const input = colorInput.trim();
    const normalized = normalizeMemoTextColor(input);
    if (input && !normalized) {
      setColorError(true);
      return;
    }
    run("textColor", { color: normalized ?? "" });
    setColorError(false);
    setColorPopoverOpen(false);
    controllerRef.current?.focus();
  };

  const applyFontSize = () => {
    const input = sizeInput.trim();
    const normalized = normalizeMemoTextSize(input);
    if (input && !normalized) {
      setSizeError(true);
      return;
    }
    run("fontSize", { fontSize: normalized ?? "" });
    setSizeError(false);
    setSizePopoverOpen(false);
    controllerRef.current?.focus();
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "w-full flex flex-row items-center gap-0.5",
        // Before the first synchronous width measurement the full command set
        // can briefly overflow on phones. Hide that unmeasured scrollbar; once
        // measured, compact mode has already folded the block group into `…`.
        width === 0 ? "overflow-x-hidden" : "overflow-x-auto",
        className,
      )}
      role="toolbar"
      aria-label={t("editor.format.heading")}
    >
      <DropdownMenu>
        <DropdownMenuTrigger render={<SegmentButton Icon={HeadingGlyph} label={t("editor.format.heading")} />} />
        <DropdownMenuContent align="start" finalFocus={returnFocusToEditor}>
          {HEADING_COMMANDS.map((command) => (
            <DropdownMenuItem key={command.id} onClick={() => run(command.id)}>
              {t(command.labelKey)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Divider />

      {markButtons.map((button) => (
        <SegmentButton key={button.label} {...button} onMouseDown={preventFocusSteal} />
      ))}

      <Divider />

      {compact ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<SegmentButton Icon={MoreHorizontalIcon} label={t("editor.format.more")} />} />
          <DropdownMenuContent align="start" finalFocus={returnFocusToEditor}>
            {blockButtons.map((button) => (
              <DropdownMenuItem key={button.label} onClick={button.onClick}>
                {button.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        blockButtons.map((button) => <SegmentButton key={button.label} {...button} onMouseDown={preventFocusSteal} />)
      )}

      <Divider />

      {alignmentButtons.map((button) => (
        <SegmentButton key={button.label} {...button} onMouseDown={preventFocusSteal} />
      ))}

      {colorButton && COLOR_COMMAND && (
        <>
          <Divider />
          <Popover
            open={colorPopoverOpen}
            onOpenChange={(open) => {
              setColorPopoverOpen(open);
              setColorError(false);
              if (open) setColorInput(active.textColor ?? "");
            }}
          >
            <PopoverTrigger
              render={
                <SegmentButton
                  Icon={colorButton.Icon}
                  label={colorButton.label}
                  active={colorButton.active}
                  style={{ color: active.textColor ?? undefined }}
                />
              }
            />
            <PopoverContent align="start" className="w-72 p-3">
              <div className="space-y-2">
                <label htmlFor="memo-text-color" className="text-xs font-medium text-foreground">
                  {t("editor.format.text-color")}
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="memo-text-color"
                    className="min-w-0 flex-1"
                    value={colorInput}
                    placeholder={t("editor.format.text-color-placeholder")}
                    aria-invalid={colorError}
                    onChange={(event) => {
                      setColorInput(event.target.value);
                      setColorError(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") applyTextColor();
                    }}
                  />
                  <input
                    type="color"
                    value={colorPickerHex}
                    aria-label={t("editor.format.text-color-picker")}
                    title={t("editor.format.text-color-picker")}
                    className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
                    onChange={(event) => {
                      const alpha = parseMemoTextColor(colorInput)?.alpha ?? parseMemoTextColor(active.textColor)?.alpha ?? 1;
                      setColorInput(pickerHexToMemoTextColor(event.target.value, alpha));
                      setColorError(false);
                    }}
                  />
                </div>
                {colorError && <p className="text-xs text-destructive">{t("editor.format.text-color-invalid")}</p>}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setColorInput("");
                      run("textColor", { color: "" });
                      setColorPopoverOpen(false);
                      controllerRef.current?.focus();
                    }}
                  >
                    {t("common.reset")}
                  </Button>
                  <Button type="button" size="sm" onClick={applyTextColor}>
                    {t("common.confirm")}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </>
      )}

      {sizeButton && SIZE_COMMAND && (
        <>
          <Divider />
          <Popover
            open={sizePopoverOpen}
            onOpenChange={(open) => {
              setSizePopoverOpen(open);
              setSizeError(false);
              if (open) setSizeInput(active.fontSize?.replace(/px$/u, "") ?? "");
            }}
          >
            <PopoverTrigger render={<SegmentButton Icon={sizeButton.Icon} label={sizeButton.label} active={sizeButton.active} />} />
            <PopoverContent align="start" className="w-64 p-3">
              <div className="space-y-2">
                <label htmlFor="memo-font-size" className="text-xs font-medium text-foreground">
                  {t("editor.format.font-size")}
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="memo-font-size"
                    type="number"
                    min={8}
                    max={96}
                    step={1}
                    value={sizeInput}
                    placeholder={t("editor.format.font-size-placeholder")}
                    aria-invalid={sizeError}
                    onChange={(event) => {
                      setSizeInput(event.target.value);
                      setSizeError(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") applyFontSize();
                    }}
                  />
                  <span className="text-sm text-muted-foreground">px</span>
                </div>
                {sizeError && <p className="text-xs text-destructive">{t("editor.format.font-size-invalid")}</p>}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSizeInput("");
                      run("fontSize", { fontSize: "" });
                      setSizePopoverOpen(false);
                      controllerRef.current?.focus();
                    }}
                  >
                    {t("common.reset")}
                  </Button>
                  <Button type="button" size="sm" onClick={applyFontSize}>
                    {t("common.confirm")}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </>
      )}

      {exit && (
        <>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" aria-label={exitLabel} title={exitLabel} onClick={exit.onExit}>
            <ExitIcon className="w-4 h-4" />
          </Button>
        </>
      )}
    </div>
  );
}

// Thin vertical rule between command groups (heading · marks · blocks).
function Divider() {
  return <span aria-hidden="true" className="w-px h-5 bg-border mx-1.5 shrink-0" />;
}

interface SegmentButtonProps extends ComponentPropsWithoutRef<"button"> {
  Icon?: LucideIcon;
  label: string;
  /** Toggle state; when set the segment gets aria-pressed and the active fill. */
  active?: boolean;
}

// The one segment element, shared by command toggles and dropdown triggers.
// Forwards ref + rest props so it also works as a Base UI `render` trigger.
// (which injects its own onClick/aria attributes).
const SegmentButton = forwardRef<HTMLButtonElement, SegmentButtonProps>(({ Icon, label, active, className, ...rest }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    aria-pressed={active}
    title={label}
    className={cn(SEGMENT_BASE, active ? SEGMENT_ACTIVE : SEGMENT_IDLE, className)}
    {...rest}
  >
    {Icon && <Icon className="w-4 h-4" />}
  </button>
));
SegmentButton.displayName = "SegmentButton";
