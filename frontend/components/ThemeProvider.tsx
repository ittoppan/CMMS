"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

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

const isDark = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark");

let lastApplied: { primary: string; gradient: string; sidebar: string; body: string } | null = null;
// เก็บ getter ของ settings ล่าสุดไว้ re-apply ตอนสลับ light/dark (design vars ผูกกับโหมด)
let lastSettingsGet: ((k: string) => string) | null = null;

const applyTheme = (theme: { primary: string; gradient: string; sidebar: string; body: string }) => {
  lastApplied = theme;
  const root = document.documentElement;
  const dark = isDark();
  root.style.setProperty("--color-accent", theme.primary);
  root.style.setProperty("--color-accent-muted", `${theme.primary}1F`);
  root.style.setProperty("--color-text-accent", theme.primary);
  root.style.setProperty("--color-icon-accent", theme.primary);
  root.style.setProperty("--color-border-blue", theme.primary);
  root.style.setProperty("--color-icon-blue", theme.primary);
  // พื้นหลัง/พื้นผิว light-only — dark mode ต้องลบ inline เพื่อให้ .dark tokens ชนะ
  if (!dark) {
    root.style.setProperty("--color-background-body", theme.body);
    root.style.setProperty("--color-background-muted", `${theme.body}E6`);
    root.style.setProperty("--cmms-bg-sidebar", theme.sidebar);
    // ค่าตรงๆ สำหรับของที่ใช้ตัวแปรสี hardcode จาก theme.css ของ astryx
    root.style.setProperty("--color-background-surface", "#FFFFFF");
    root.style.setProperty("--color-background-card", "#FFFFFF");
  } else {
    root.style.removeProperty("--color-background-body");
    root.style.removeProperty("--color-background-muted");
    root.style.removeProperty("--cmms-bg-sidebar");
    root.style.removeProperty("--color-background-surface");
    root.style.removeProperty("--color-background-card");
    // ค่าที่ design_body_bg เคย pin ไว้ — ต้องลบให้ .dark tokens ชนะ
    root.style.removeProperty("--cmms-bg-page");
    root.style.removeProperty("--cmms-bg-wash");
  }
  // SideNav โฉมใหม่: active = สีทึบของแบรนด์ (ไม่ใช้ gradient)
  root.style.setProperty("--cmms-bg-sidebar-active", theme.primary);
  root.style.setProperty("--cmms-gradient-primary", theme.gradient);
  root.style.setProperty("--cmms-primary", theme.primary);
  root.style.setProperty("--cmms-primary-hover", theme.primary);
  root.style.setProperty("--cmms-border-focus", theme.primary);
  root.style.setProperty("--cmms-shadow-focus", `0 0 0 3px ${theme.primary}33`);
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

// keys ที่เป็น "สีพื้นหลังโหมดสว่าง" — ใน dark mode ต้องข้าม เพื่อให้ .dark tokens ชนะ
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
 * ผู้ดูแลปิดได้เองแม้ OS ตั้งค่าให้แสดง animation อยู่ — เติมคลาส
 * cmms-no-anim บน <html> ให้ CSS กัน animation/transition ทั้งระบบ
 * (แยกจาก prefers-reduced-motion ของ OS ต่างหาก)
 */
const applyAnimSetting = (get: (k: string) => string) => {
  const root = document.documentElement;
  const enabled = (get("animations_enabled") ?? "1") === "1";
  root.classList.toggle("cmms-no-anim", !enabled);
};

/**
 * Hero เฉพาะหน้า — ใส่ data-hero ตามเส้นทาง (repair/spare_parts/…) ให้ CSS
 * ธีมสี + ไอคอนลายน้ำเฉพาะหมวด แทนไล่สีน้ำเงินเดียวกันทุกหน้า
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

  // สลับ light/dark — re-apply ธีมล่าสุด + design vars ตามโหมด (พื้นหลัง light-only จะถูกข้าม/ลบใน dark)
  useEffect(() => {
    if (!resolvedTheme) return;
    if (lastApplied) applyTheme(lastApplied);
    if (lastSettingsGet) applyDesign(lastSettingsGet);
  }, [resolvedTheme]);

  // Hero เฉพาะหน้า — รีแท็กทุกครั้งที่เปลี่ยนเส้นทาง (ไคลเอนต์ nav ไม่ต้องโหลดใหม่)
  // + MutationObserver จัดการ hero ที่ mount ทีหลัง (หน้าบางหน้า render หลังโหลดข้อมูล)
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
          lastSettingsGet = get;
          applyTheme({ ...base, primary, gradient });
          // SideNav โฉมใหม่: active = สีทึบของแบรนด์ (ไม่ใช้ gradient)
          const root = document.documentElement;
          root.style.setProperty("--cmms-bg-sidebar-active", primary);
          root.style.setProperty("--cmms-gradient-primary", gradient);
          root.style.setProperty("--cmms-primary", primary);
          root.style.setProperty("--cmms-primary-hover", primary);
          // Page Designer: design_* keys ชนะ preset (ถ้ามีค่า) — dark-aware ตาม applyDesign
          applyDesign(get);
          // สวิตช์ปิด animation (ผู้ดูแล)
          applyAnimSetting(get);
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

    // สลับ "เปิด animation ของระบบ" ทันทีจากหน้า settings (ไม่ต้อง refresh)
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
