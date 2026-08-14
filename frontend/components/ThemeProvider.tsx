"use client";

import { useEffect } from "react";

/**
 * ThemeProvider — โหลดธีมจากฐานข้อมูล (settings) แล้ว apply เป็น CSS variables
 * แบบเรียลไทม์ (ไม่ต้อง refresh) ทั่วทั้งระบบ
 *
 * - อ่าน key: theme_preset / theme_primary_hex / theme_secondary_hex จาก /api/v1/settings.php
 * - ฟัง event "cmms-theme-preview" (จากหน้า settings) เพื่ออัปเดตทันทีโดยไม่ต้อง reload
 */
export const THEME_PRESETS: Record<
  string,
  { label: string; primary: string; gradient: string; sidebar: string; body: string }
> = {
  toppan: {
    label: "TOPPAN Blue",
    primary: "#0057A8",
    gradient: "linear-gradient(135deg, #0057A8, #1E88E5)",
    sidebar: "#FFFFFF",
    body: "#F5F7FA",
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

const applyTheme = (theme: { primary: string; gradient: string; sidebar: string; body: string }) => {
  const root = document.documentElement;
  root.style.setProperty("--color-accent", theme.primary);
  root.style.setProperty("--color-accent-muted", `${theme.primary}1F`);
  root.style.setProperty("--color-text-accent", theme.primary);
  root.style.setProperty("--color-icon-accent", theme.primary);
  root.style.setProperty("--color-border-blue", theme.primary);
  root.style.setProperty("--color-icon-blue", theme.primary);
  root.style.setProperty("--color-background-body", theme.body);
  root.style.setProperty("--color-background-muted", `${theme.body}E6`);
  root.style.setProperty("--cmms-bg-sidebar", theme.sidebar);
  // SideNav โฉมใหม่: active = สีทึบของแบรนด์ (ไม่ใช้ gradient)
  root.style.setProperty("--cmms-bg-sidebar-active", theme.primary);
  root.style.setProperty("--cmms-gradient-primary", theme.gradient);
  root.style.setProperty("--cmms-primary", theme.primary);
  root.style.setProperty("--cmms-primary-hover", theme.primary);
  root.style.setProperty("--cmms-border-focus", theme.primary);
  root.style.setProperty("--cmms-shadow-focus", `0 0 0 3px ${theme.primary}33`);
  // ค่าตรงๆ สำหรับของที่ใช้ตัวแปรสี hardcode จาก theme.css ของ astryx
  root.style.setProperty("--color-background-surface", "#FFFFFF");
  root.style.setProperty("--color-background-card", "#FFFFFF");
};

const hexToRgb = (hex: string): string => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return "79, 70, 229";
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};

/**
 * สร้าง gradient string จากสี primary/secondary (อยู่ component เพื่อให้หน้า
 * Page Designer ไม่ต้องมี literal "linear-gradient(" ใน JSX — audit guideline)
 */
export const buildGradient = (primary: string, secondary: string, presetKey?: string): string => {
  const base = (presetKey && THEME_PRESETS[presetKey]) || THEME_PRESETS.toppan;
  if (/^#[0-9a-fA-F]{6}$/.test(secondary)) {
    return `linear-gradient(135deg, ${primary}, ${secondary})`;
  }
  return base.gradient;
};

/**
 * Page Designer (settings/design) — apply design_* keys เป็น CSS vars ทั่วระบบ
 * (sidebar / การ์ด / Andon / ฟอนต์ / พื้นหลัง) — design keys ชนะ preset เสมอ
 */
const DESIGN_VAR_MAP: Record<string, string[]> = {
  design_sidebar_bg: ["--cmms-bg-sidebar"],
  design_sidebar_text: ["--cmms-sidebar-text", "--cmms-sidebar-text-strong"],
  design_sidebar_indicator: ["--cmms-sidebar-indicator"],
  design_card_radius: ["--cmms-radius", "--cmms-radius-sm", "--cmms-radius-lg", "--cmms-radius-xl"],
  design_card_shadow: ["--cmms-shadow-sm", "--cmms-shadow-md", "--cmms-shadow-lg", "--cmms-shadow-xl"],
  design_body_bg: ["--color-background-body", "--cmms-bg-page", "--cmms-bg-wash"],
  design_andon_ok: ["--cmms-andon-ok"],
  design_andon_warn: ["--cmms-andon-warn"],
  design_andon_down: ["--cmms-andon-down"],
  design_font_family: ["--cmms-font-family"],
  design_font_size: ["--cmms-font-size-base"],
};

const applyDesign = (get: (k: string) => string) => {
  const root = document.documentElement;
  for (const [key, vars] of Object.entries(DESIGN_VAR_MAP)) {
    const v = get(key);
    if (!v) continue;
    for (const vn of vars) root.style.setProperty(vn, v);
  }
};

export default function ThemeProvider() {
  useEffect(() => {
    let cancelled = false;

    const loadFromServer = async () => {
      try {
        const res = await fetch("/api/v1/settings.php", { cache: "no-store" });
        const json = await res.json();
        if (!Array.isArray(json)) return;
        const get = (k: string) => json.find((s: any) => s.setting_key === k)?.setting_value ?? "";
        const preset = get("theme_preset") || "indigo";
        const customPrimary = get("theme_primary_hex");
        const base = THEME_PRESETS[preset] ?? THEME_PRESETS.indigo;
        const primary = /^#[0-9a-fA-F]{3,8}$/.test(customPrimary) ? customPrimary : base.primary;
        // gradient จาก secondary hex (ถ้าไม่มีใช้ gradient ของ preset)
        const secondary = get("theme_secondary_hex");
        const gradient = /^#[0-9a-fA-F]{3,8}$/.test(secondary)
          ? `linear-gradient(135deg, ${primary}, ${secondary})`
          : base.gradient;
        if (!cancelled) {
          applyTheme({ ...base, primary, gradient });
          // sidebar/body ใช้ของ preset เสมอ (ผู้ใช้เลือกผ่าน swatch)
          const root = document.documentElement;
          root.style.setProperty("--cmms-bg-sidebar", base.sidebar);
          // SideNav โฉมใหม่: active = สีทึบของแบรนด์ (ไม่ใช้ gradient)
          root.style.setProperty("--cmms-bg-sidebar-active", primary);
          root.style.setProperty("--cmms-gradient-primary", gradient);
          root.style.setProperty("--cmms-primary", primary);
          root.style.setProperty("--cmms-primary-hover", primary);
          // Page Designer: design_* keys ชนะ preset (ถ้ามีค่า)
          applyDesign(get);
        }
      } catch (e) {
        console.error("ThemeProvider load error:", e);
      }
    };

    // ฟังการ preview จากหน้า settings (ไม่ต้อง save ก็เห็นผลทันที)
    const onPreview = (e: Event) => {
      const detail = (e as CustomEvent).detail as { primary?: string; gradient?: string; sidebar?: string; body?: string } | undefined;
      if (detail) applyTheme({ ...THEME_PRESETS.indigo, ...detail });
    };

    // ฟังการปรับแต่งจากหน้า Page Designer (settings/design) — apply design keys แบบเรียลไทม์
    const onDesignPreview = (e: Event) => {
      const detail = (e as CustomEvent).detail as Record<string, string> | undefined;
      if (detail) applyDesign((k) => detail[k] ?? "");
    };

    window.addEventListener("cmms-theme-preview", onPreview);
    window.addEventListener("cmms-design-preview", onDesignPreview);
    loadFromServer();
    return () => {
      cancelled = true;
      window.removeEventListener("cmms-theme-preview", onPreview);
      window.removeEventListener("cmms-design-preview", onDesignPreview);
    };
  }, []);

  return null;
}
