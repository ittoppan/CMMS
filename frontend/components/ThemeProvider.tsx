"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

/**
 * ThemeProvider — v3 port (ux-redesign).
 * โหลดธีมจากฐานข้อมูล (settings) แล้ว apply เป็น CSS variables แบบเรียลไทม์
 *
 * v3 change: writes ONLY the token names this codebase owns after the Astryx
 * removal — `--cmms-*` (app semantic layer) and the shadcn base tokens
 * (`--primary`, `--background`, ...). No more `--color-*` Astryx names.
 *
 * - อ่าน key: theme_preset / theme_primary_hex / theme_secondary_hex จาก /api/v1/settings.php
 * - ฟัง event "cmms-theme-preview" (หน้า settings) อัปเดตทันทีโดยไม่ reload
 */
export const THEME_PRESETS: Record<
  string,
  { label: string; primary: string; gradient: string; sidebar: string; body: string }
> = {
  toppan: {
    label: "TOPPAN Blue",
    primary: "#0068B5",
    gradient: "linear-gradient(135deg, #0068B5, #0093FF)",
    sidebar: "#FFFFFF",
    body: "#F4F5F7",
  },
  indigo: {
    label: "Indigo & Violet",
    primary: "#4F46E5",
    gradient: "linear-gradient(135deg, #4F46E5, #8B5CF6)",
    sidebar: "#FDFDFF",
    body: "#F5F6FB",
  },
  emerald: {
    label: "Emerald & Teal",
    primary: "#059669",
    gradient: "linear-gradient(135deg, #0D9488, #10B981)",
    sidebar: "#F6FCF9",
    body: "#F4F8F6",
  },
  amber: {
    label: "Amber & Slate",
    primary: "#D97706",
    gradient: "linear-gradient(135deg, #EA580C, #F59E0B)",
    sidebar: "#FDFAF4",
    body: "#FAF7F2",
  },
};

const isDark = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark");

let lastApplied: { primary: string; gradient: string; sidebar: string; body: string } | null = null;
// เก็บ getter ของ settings ล่าสุดไว้ re-apply ตอนสลับ light/dark
let lastSettingsGet: ((k: string) => string) | null = null;

/** hex → rgba tint string */
const tint = (hex: string, alpha: number): string => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return `rgba(0,104,181,${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/**
 * buildGradient — legacy helper still imported by settings/design preview.
 * Kept until that page converts to the v3 design (flat surfaces, no gradients).
 */
export const buildGradient = (primary: string, secondary: string, presetKey?: string): string => {
  const base = (presetKey && THEME_PRESETS[presetKey]) || THEME_PRESETS.toppan;
  if (/^#[0-9a-fA-F]{6}$/.test(secondary)) {
    return `linear-gradient(135deg, ${primary}, ${secondary})`;
  }
  return base.gradient;
};

const applyTheme = (theme: { primary: string; gradient: string; sidebar: string; body: string }) => {
  lastApplied = theme;
  const root = document.documentElement;
  const dark = isDark();

  // Brand / accent tokens (--cmms-* + shadcn base)
  root.style.setProperty("--cmms-primary", theme.primary);
  root.style.setProperty("--cmms-primary-hover", theme.primary);
  root.style.setProperty("--cmms-primary-light", tint(theme.primary, 0.10));
  root.style.setProperty("--cmms-primary-glow", tint(theme.primary, 0.22));
  root.style.setProperty("--cmms-border-focus", theme.primary);
  root.style.setProperty("--cmms-shadow-focus", `0 0 0 3px ${tint(theme.primary, 0.18)}`);
  root.style.setProperty("--cmms-bg-sidebar-active", theme.primary);
  root.style.setProperty("--cmms-sidebar-indicator", theme.primary);
  // legacy hook kept alive for not-yet-converted pages (hero gradient)
  root.style.setProperty("--cmms-gradient-primary", theme.gradient);
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--ring", theme.primary);

  // Light surfaces are light-mode-only — removed in dark so .dark tokens win
  if (!dark) {
    root.style.setProperty("--cmms-bg-page", theme.body);
    root.style.setProperty("--cmms-bg-wash", theme.body);
    root.style.setProperty("--cmms-bg-muted", theme.body);
    root.style.setProperty("--cmms-bg-sidebar", theme.sidebar);
    root.style.setProperty("--background", theme.body);
    root.style.setProperty("--secondary", theme.body);
    root.style.setProperty("--muted", theme.body);
  } else {
    for (const v of [
      "--cmms-bg-page", "--cmms-bg-wash", "--cmms-bg-muted", "--cmms-bg-sidebar",
      "--background", "--secondary", "--muted",
    ]) {
      root.style.removeProperty(v);
    }
  }
};

/**
 * Page Designer (settings/design) — apply design_* keys เป็น CSS vars
 * (sidebar / การ์ด / Andon / ฟอนต์ / พื้นหลัง) — design keys ชนะ preset เสมอ
 */
const DESIGN_VAR_MAP: Record<string, string[]> = {
  design_sidebar_bg: ["--cmms-bg-sidebar"],
  design_sidebar_text: ["--cmms-sidebar-text", "--cmms-sidebar-text-strong"],
  design_sidebar_indicator: ["--cmms-sidebar-indicator"],
  design_card_radius: ["--cmms-radius", "--cmms-radius-sm", "--cmms-radius-lg", "--cmms-radius-xl"],
  design_card_shadow: ["--cmms-shadow-sm", "--cmms-shadow-md", "--cmms-shadow-lg", "--cmms-shadow-xl"],
  design_body_bg: ["--cmms-bg-page", "--cmms-bg-wash", "--background"],
  design_andon_ok: ["--cmms-andon-ok"],
  design_andon_warn: ["--cmms-andon-warn"],
  design_andon_down: ["--cmms-andon-down"],
  design_font_family: ["--cmms-font-family"],
  design_font_size: ["--cmms-font-size-base"],
};

// keys ที่เป็น "สีพื้นหลังโหมดสว่าง" — ใน dark mode ต้องข้าม ให้ .dark tokens ชนะ
const LIGHT_ONLY_DESIGN_KEYS = new Set(["design_body_bg", "design_sidebar_bg"]);

const applyDesign = (get: (k: string) => string) => {
  const root = document.documentElement;
  const dark = isDark();
  for (const [key, vars] of Object.entries(DESIGN_VAR_MAP)) {
    if (dark && LIGHT_ONLY_DESIGN_KEYS.has(key)) continue;
    const v = get(key);
    if (!v) continue;
    for (const vn of vars) root.style.setProperty(vn, v);
  }
};

/**
 * สวิตช์ "เปิด animation ของระบบ" (settings → animations_enabled)
 */
const applyAnimSetting = (get: (k: string) => string) => {
  const root = document.documentElement;
  const enabled = (get("animations_enabled") ?? "1") === "1";
  root.classList.toggle("cmms-no-anim", !enabled);
};

/**
 * Hero เฉพาะหน้า — data-hero ตามเส้นทาง (legacy hero CSS; คงไว้จนกว่าทุกหน้า
 * จะ convert เป็น PageShell แล้ว Stage 5 จะลบ CSS นี้)
 */
const HERO_THEMES = new Set([
  "dashboard", "andon-board", "iot", "repair", "spare_parts", "pm_am",
  "analytics", "reports", "bi", "leaderboard", "asset_registry", "assets",
  "users", "profile", "settings", "approval", "loto", "inspections", "calibration",
]);

const applyHeroTheme = (pathname: string) => {
  const seg = (pathname || "/dashboard").split("/").filter(Boolean)[0] || "dashboard";
  const theme = HERO_THEMES.has(seg) ? seg : "";
  document.querySelectorAll<HTMLElement>(".cmms-page-hero").forEach((el) => {
    if (theme) el.setAttribute("data-hero", theme);
    else el.removeAttribute("data-hero");
  });
};

export default function ThemeProvider() {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();

  // สลับ light/dark — re-apply ธีมล่าสุด + design vars ตามโหมด
  useEffect(() => {
    if (!resolvedTheme) return;
    if (lastApplied) applyTheme(lastApplied);
    if (lastSettingsGet) applyDesign(lastSettingsGet);
  }, [resolvedTheme]);

  // Hero เฉพาะหน้า — retag ตามเส้นทาง
  useEffect(() => {
    const tag = () => applyHeroTheme(pathname ?? "");
    tag();
    const mo = new MutationObserver(() => {
      if (document.querySelector(".cmms-page-hero:not([data-hero])")) tag();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    const loadFromServer = async () => {
      try {
        const res = await fetch("/api/v1/settings.php", { cache: "no-store" });
        const json = await res.json();
        if (!Array.isArray(json)) return;
        const get = (k: string) => json.find((s: any) => s.setting_key === k)?.setting_value ?? "";
        const preset = get("theme_preset") || "toppan";
        const customPrimary = get("theme_primary_hex");
        const base = THEME_PRESETS[preset] ?? THEME_PRESETS.toppan;
        const primary = /^#[0-9a-fA-F]{3,8}$/.test(customPrimary) ? customPrimary : base.primary;
        const secondary = get("theme_secondary_hex");
        const gradient = /^#[0-9a-fA-F]{3,8}$/.test(secondary)
          ? `linear-gradient(135deg, ${primary}, ${secondary})`
          : base.gradient;
        if (!cancelled) {
          lastSettingsGet = get;
          applyTheme({ ...base, primary, gradient });
          applyDesign(get);
          applyAnimSetting(get);
        }
      } catch (e) {
        console.error("ThemeProvider load error:", e);
      }
    };

    // preview จากหน้า settings
    const onPreview = (e: Event) => {
      const detail = (e as CustomEvent).detail as { primary?: string; gradient?: string; sidebar?: string; body?: string } | undefined;
      if (detail) applyTheme({ ...THEME_PRESETS.toppan, ...detail });
    };
    const onDesignPreview = (e: Event) => {
      const detail = (e as CustomEvent).detail as Record<string, string> | undefined;
      if (detail) applyDesign((k) => detail[k] ?? "");
    };
    const onAnimSetting = (e: Event) => {
      const detail = (e as CustomEvent).detail as { enabled?: boolean } | undefined;
      document.documentElement.classList.toggle("cmms-no-anim", detail?.enabled === false);
    };

    window.addEventListener("cmms-theme-preview", onPreview);
    window.addEventListener("cmms-design-preview", onDesignPreview);
    window.addEventListener("cmms-anim-setting", onAnimSetting);
    loadFromServer();
    return () => {
      cancelled = true;
      window.removeEventListener("cmms-theme-preview", onPreview);
      window.removeEventListener("cmms-design-preview", onDesignPreview);
      window.removeEventListener("cmms-anim-setting", onAnimSetting);
    };
  }, []);

  return null;
}
