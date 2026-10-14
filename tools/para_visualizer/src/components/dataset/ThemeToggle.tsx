"use client";
/**
 * Theme toggle: light / dark / system.
 * Uses the `dark` class on <html>, persisted to localStorage.
 */
import { useEffect, useState } from "react";
import { Sun, Moon, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem("dib:theme") as Theme | null) || "system";
}

export function ThemeToggle() {
  // lazy init from localStorage — no setState-in-effect
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Apply theme to <html> as a side effect of theme changes
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const isDark =
        theme === "dark" ||
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", isDark);
    };
    apply();
    localStorage.setItem("dib:theme", theme);
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  const cycle = () => {
    setTheme((t) => (t === "light" ? "dark" : t === "dark" ? "system" : "light"));
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={cycle}
            aria-label={`Toggle theme, current: ${theme}`}
            aria-haspopup="listbox"
          >
            <div className="relative h-3.5 w-3.5">
              <Sun className={cn("h-3.5 w-3.5 absolute inset-0 transition-all", theme === "light" ? "scale-100 rotate-0" : "scale-0 rotate-90")} />
              <Moon className={cn("h-3.5 w-3.5 absolute inset-0 transition-all", theme === "dark" ? "scale-100 rotate-0" : "scale-0 -rotate-90")} />
              <MonitorSmartphone className={cn("h-3.5 w-3.5 absolute inset-0 transition-all", theme === "system" ? "scale-100 rotate-0" : "scale-0 rotate-90")} />
            </div>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Theme: {theme} (click to cycle)
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
