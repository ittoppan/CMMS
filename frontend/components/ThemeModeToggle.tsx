"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

/**
 * ThemeModeToggle — สลับ light/dark/system (cycle: light → dark → system)
 * ใช้ใน TopNav ถัดจากปุ่มภาษา TH/EN
 */
const MODES = ["light", "dark", "system"] as const;
type Mode = (typeof MODES)[number];

const LABELS: Record<Mode, { th: string; en: string; icon: typeof Sun }> = {
  light: { th: "สลับเป็นโหมดมืด", en: "Switch to dark mode", icon: Sun },
  dark: { th: "สลับเป็นโหมดระบบ", en: "Switch to system mode", icon: Moon },
  system: { th: "สลับเป็นโหมดสว่าง", en: "Switch to light mode", icon: Sun },
};

export default function ThemeModeToggle({ lang = "th" }: { lang?: string }) {
  const { theme, setTheme } = useTheme();
  const mode: Mode = (theme as Mode) || "system";
  const label = LABELS[mode];
  const Icon = label.icon;

  const cycle = () => {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      title={lang === "th" ? label.th : label.en}
      aria-label={lang === "th" ? label.th : label.en}
      aria-pressed={mode === "dark"}
      className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-full border border-[var(--cmms-border)] bg-[var(--cmms-bg-wash)] text-[var(--cmms-text-secondary)] hover:bg-[var(--cmms-bg-muted)] hover:border-[var(--cmms-border-hover)] transition-all cursor-pointer select-none"
    >
      <Icon size={16} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
