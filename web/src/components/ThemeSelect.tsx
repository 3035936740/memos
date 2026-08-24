import {
  BookOpen,
  Brush,
  Candy,
  Cherry,
  CloudRain,
  Flower,
  Flower2,
  Gem,
  Leaf,
  Monitor,
  Moon,
  Newspaper,
  Palette,
  Rainbow,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Terminal,
  Trees,
  Waves,
  Wind,
} from "lucide-react";
import type { ReactElement } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { loadTheme, THEME_OPTIONS } from "@/utils/theme";

interface ThemeSelectProps {
  value?: string;
  onValueChange?: (theme: string) => void;
  className?: string;
  compact?: boolean;
  iconOnly?: boolean;
}

const THEME_ICONS: Record<string, ReactElement> = {
  system: <Monitor className="w-4 h-4" />,
  default: <Sun className="w-4 h-4" />,
  "default-dark": <Moon className="w-4 h-4" />,
  paper: <Palette className="w-4 h-4" />,
  "cosmic-dark": <Sparkles className="w-4 h-4" />,
  "twilight-dark": <Sunset className="w-4 h-4" />,
  "aurora-dark": <Rainbow className="w-4 h-4" />,
  "abyss-dark": <Waves className="w-4 h-4" />,
  "neon-rain-dark": <CloudRain className="w-4 h-4" />,
  "moonlit-forest-dark": <Trees className="w-4 h-4" />,
  "retro-terminal-dark": <Terminal className="w-4 h-4" />,
  "ink-night-dark": <Brush className="w-4 h-4" />,
  "sakura-night-dark": <Flower2 className="w-4 h-4" />,
  dawn: <Sunrise className="w-4 h-4" />,
  "ocean-breeze": <Wind className="w-4 h-4" />,
  matcha: <Leaf className="w-4 h-4" />,
  lavender: <Flower className="w-4 h-4" />,
  "sakura-day": <Cherry className="w-4 h-4" />,
  "desert-sand": <Sun className="w-4 h-4" />,
  porcelain: <Gem className="w-4 h-4" />,
  "retro-newspaper": <Newspaper className="w-4 h-4" />,
  "candy-pop": <Candy className="w-4 h-4" />,
  editorial: <BookOpen className="w-4 h-4" />,
  "editorial-dark": <BookOpen className="w-4 h-4" />,
};

const ThemeSelect = ({ value, onValueChange, className, compact = false, iconOnly = false }: ThemeSelectProps = {}) => {
  const t = useTranslate();
  const currentTheme = value || "system";
  const themeOptions = THEME_OPTIONS.map((option) => ({ ...option, label: t(option.labelKey) }));
  const triggerLabel = themeOptions.find((option) => option.value === currentTheme)?.label ?? t("theme.system");

  const handleThemeChange = (newTheme: string) => {
    // Apply theme globally immediately
    loadTheme(newTheme);
    // Also notify parent component if callback is provided
    if (onValueChange) {
      onValueChange(newTheme);
    }
  };

  return (
    <Select value={currentTheme} items={themeOptions} onValueChange={handleThemeChange}>
      <SelectTrigger
        aria-label={iconOnly ? `Theme: ${triggerLabel}` : undefined}
        title={iconOnly ? triggerLabel : undefined}
        showChevron={!iconOnly}
        className={cn(
          iconOnly &&
            "size-8 justify-center border-0 bg-transparent p-0 text-muted-foreground shadow-none [&_svg]:text-current hover:bg-accent/65 hover:text-foreground",
          className,
        )}
      >
        {iconOnly ? (
          THEME_ICONS[currentTheme]
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {compact && THEME_ICONS[currentTheme]}
            {compact ? <span className="truncate">{triggerLabel}</span> : <SelectValue className="truncate" placeholder="Select theme" />}
          </div>
        )}
      </SelectTrigger>
      <SelectContent>
        {themeOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <div className="flex items-center gap-2">
              {THEME_ICONS[option.value]}
              <span>{option.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ThemeSelect;
