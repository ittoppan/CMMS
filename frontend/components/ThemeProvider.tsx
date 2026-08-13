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
    sidebar: "#0F1E3D",
    body: "#F5F7FA",
  },
  indigo: {
    label: "Indigo & Violet",
    primary: "#4F46E5",
    gradient: "linear-gradient(135deg, #4F46E5, #8B5CF6)",
    sidebar: "#0E1524",
    body: "#F5F6FB",
  },
  emerald: {
    label: "Emerald & Teal",
    primary: "#059669",
    gradient: "linear-gradient(135deg, #0D9488, #10B981)",
    sidebar: "#052E22",
    body: "#F4F8F6",
  },
  amber: {
    label: "Amber & Slate",
    primary: "#D97706",
    gradient: "linear-gradient(135deg, #EA580C, #F59E0B)",
    sidebar: "#1C1917",
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
  root.style.setProperty("--cmms-bg-sidebar-active", theme.gradient);
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
          root.style.setProperty("--cmms-bg-sidebar-active", gradient);
          root.style.setProperty("--cmms-gradient-primary", gradient);
          root.style.setProperty("--cmms-primary", primary);
          root.style.setProperty("--cmms-primary-hover", primary);
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

    window.addEventListener("cmms-theme-preview", onPreview);
    loadFromServer();
    return () => {
      cancelled = true;
      window.removeEventListener("cmms-theme-preview", onPreview);
    };
  }, []);

  return null;
}
