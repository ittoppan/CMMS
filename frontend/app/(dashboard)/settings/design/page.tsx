"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageShell } from "@/components/PageShell";
import { THEME_PRESETS, buildGradient } from "../../../../components/ThemeProvider";
import AndonLamp from "../../../../components/AndonLamp";
import { ALL_PAGES, isWired } from "../../../../lib/pageLayout";
import {
  SwatchBook as SwatchIcon,
  Menu as Bars3Icon,
  LayoutGrid as Squares2X2Icon,
  SquarePen as PencilSquareIcon,
  ArrowLeft as ArrowLeftIcon,
  ChevronRight as ChevronRightIcon,
  CheckCircle2 as CheckCircleIcon,
  CircleAlert as ExclamationCircleIcon,
  RefreshCw as ArrowPathIcon,
  AppWindow as WindowIcon,
  Paintbrush as PaintBrushIcon,
} from "lucide-react";

// ── แทน useMediaQuery ของ core hooks ──
function useIsNarrow(): boolean {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = () => setIsNarrow(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isNarrow;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config — sections, keys, defaults
// ─────────────────────────────────────────────────────────────────────────────

interface SectionDef {
  id: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties; strokeWidth?: number | string }>;
}

const SECTIONS: SectionDef[] = [
  { id: "theme", label: "ธีม & สีทั้งระบบ", desc: "Preset + สีหลัก / gradient", icon: SwatchIcon },
  { id: "sidenav", label: "เมนูข้าง (SideNav)", desc: "พื้นหลัง ตัวหนังสือ ตัวชี้ตำแหน่ง", icon: Bars3Icon },
  { id: "cards", label: "การ์ด KPI & ไฟ Andon", desc: "มุมโค้ง เงา หลอดไฟสถานะ", icon: Squares2X2Icon },
  { id: "typography", label: "ตัวอักษร (ฟอนต์)", desc: "ฟอนต์หลัก + ขนาดตัวหนังสือ", icon: PaintBrushIcon },
  { id: "pages", label: "สตูดิโอปรับแต่งรายหน้า", desc: "สี/สไตล์/ข้อความเฉพาะแต่ละหน้า", icon: PencilSquareIcon },
];

const DESIGN_META: Record<string, { label: string; group: string }> = {
  design_sidebar_bg: { label: "สีพื้นหลัง SideNav", group: "SideNav" },
  design_sidebar_text: { label: "สีตัวหนังสือเมนู", group: "SideNav" },
  design_sidebar_indicator: { label: "สีตัวชี้ตำแหน่งเมนู", group: "SideNav" },
  design_card_radius: { label: "มุมโค้งการ์ด", group: "การ์ด" },
  design_card_shadow: { label: "ความเข้มเงาการ์ด", group: "การ์ด" },
  design_body_bg: { label: "สีพื้นหลังหน้า", group: "การ์ด" },
  design_andon_ok: { label: "หลอดเขียว (พร้อมใช้งาน)", group: "Andon" },
  design_andon_warn: { label: "หลอดเหลือง (ต้องดูแล)", group: "Andon" },
  design_andon_down: { label: "หลอดแดง (หยุดทำงาน)", group: "Andon" },
  design_font_family: { label: "ฟอนต์หลักทั้งระบบ", group: "ตัวอักษร" },
  design_font_size: { label: "ขนาดตัวหนังสือฐาน", group: "ตัวอักษร" },
};

const DESIGN_DEFAULTS: Record<string, string> = {
  design_sidebar_bg: "", // เว้นว่าง = ใช้สี SideNav จากธีม preset อัตโนมัติ
  design_sidebar_text: "", // เว้นว่าง = ใช้สีตัวหนังสือจากธีม (โฉมใหม่: น้ำเงินเข้มบนพื้นขาว)
  design_sidebar_indicator: "", // เว้นว่าง = ใช้สีตัวชี้ตำแหน่งจากธีม
  design_card_radius: "12px",
  design_card_shadow: "0 10px 25px -12px rgba(25, 50, 100, 0.18)",
  design_body_bg: "#F5F7FA",
  design_andon_ok: "#10B981",
  design_andon_warn: "#F59E0B",
  design_andon_down: "#EF4444",
  design_font_family: "'Noto Sans Thai', 'Sarabun', 'Roboto', 'Inter', sans-serif",
  design_font_size: "16px",
};

// คีย์ที่ต้องเป็น #RRGGBB ก่อนบันทึก
const HEX_KEYS = [
  "design_sidebar_bg",
  "design_sidebar_text",
  "design_sidebar_indicator",
  "design_andon_ok",
  "design_andon_warn",
  "design_andon_down",
  "theme_primary_hex",
  "theme_secondary_hex",
];

const THEME_KEYS = ["theme_preset", "theme_primary_hex", "theme_secondary_hex"];

const RADIUS_OPTIONS = [
  { label: "เหลี่ยมคม (0px)", value: "0px" },
  { label: "มนเล็กน้อย (8px)", value: "8px" },
  { label: "มนมาตรฐาน (12px)", value: "12px" },
  { label: "มนโค้งสวยงาม (16px)", value: "16px" },
  { label: "มนเต็มขั้น (24px)", value: "24px" },
];

const SHADOW_OPTIONS = [
  { label: "เบา (Soft)", value: "0 2px 8px -2px rgba(25, 50, 100, 0.10)" },
  { label: "ปานกลาง (Medium)", value: "0 10px 25px -12px rgba(25, 50, 100, 0.18)" },
  { label: "เข้ม (Strong)", value: "0 20px 40px -12px rgba(25, 50, 100, 0.30)" },
];

const FONT_OPTIONS = [
  { label: "Noto Sans Thai (มาตรฐาน)", value: "'Noto Sans Thai', 'Sarabun', 'Roboto', 'Inter', sans-serif" },
  { label: "Sarabun (ทางการ ISO)", value: "'Sarabun', 'Noto Sans Thai', 'Roboto', sans-serif" },
  { label: "Kanit (โมเดิร์น)", value: "'Kanit', 'Noto Sans Thai', 'Roboto', sans-serif" },
  { label: "Prompt (ทันสมัย)", value: "'Prompt', 'Noto Sans Thai', 'Roboto', sans-serif" },
];

const FONT_SIZE_OPTIONS = [
  { label: "เล็ก (14px)", value: "14px" },
  { label: "มาตรฐาน (15px)", value: "15px" },
  { label: "ปกติ (16px)", value: "16px" },
  { label: "ใหญ่ (17px)", value: "17px" },
  { label: "ใหญ่พิเศษ (18px)", value: "18px" },
];

const isHex6 = (v: string) => /^#[0-9a-fA-F]{6}$/.test(String(v).trim());

// ─────────────────────────────────────────────────────────────────────────────
// Small field helpers
// ─────────────────────────────────────────────────────────────────────────────

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const safe = isHex6(value) ? value : "#0068B5";
  return (
    <VStack gap={1}>
      <span className="text-sm font-medium">
        {label}
      </span>
      <HStack gap={2} vAlign="center">
        <input
          type="color"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 48,
            height: 32,
            border: "1px solid var(--cmms-border)",
            borderRadius: 8,
            cursor: "pointer",
            background: "transparent",
            padding: 2,
          }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#RRGGBB"
          style={{
            width: 110,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid var(--cmms-border)",
            font: "inherit",
            fontSize: 13,
          }}
        />
        {isHex6(value) ? (
          <CheckCircleIcon className="h-4 w-4 text-[var(--cmms-success)]" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <ExclamationCircleIcon className="h-4 w-4 text-[var(--cmms-warning)]" strokeWidth={1.75} aria-hidden="true" />
        )}
      </HStack>
    </VStack>
  );
}

function SectionTitle({ eyebrow, title, desc }: { eyebrow: string; title: string; desc: string }) {
  return (
    <VStack gap={1}>
      <p className="cmms-eyebrow text-sm text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">
        {desc}
      </p>
    </VStack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function PageDesignerPage() {
  const router = useRouter();
  const isNarrow = useIsNarrow();
  const [activeSection, setActiveSection] = useState<string>("theme");
  const [mobileView, setMobileView] = useState<"nav" | "detail">("nav");

  const [rows, setRows] = useState<Record<string, { id: number; value: string }>>({});
  const [form, setForm] = useState<Record<string, string>>({ ...DESIGN_DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");

  const designKeys = Object.keys(DESIGN_DEFAULTS);
  const allKeys = [...designKeys, ...THEME_KEYS];

  // ส่งค่าปัจจุบันให้ทั้งระบบ preview แบบเรียลไทม์ (ไม่ต้องบันทึก)
  const dispatchLive = useCallback((next: Record<string, string>) => {
    const preset = (next.theme_preset as string) || "toppan";
    const base = THEME_PRESETS[preset] ?? THEME_PRESETS.toppan;
    const primary = isHex6(next.theme_primary_hex as string) ? (next.theme_primary_hex as string) : base.primary;
    const gradient = buildGradient(primary, (next.theme_secondary_hex as string) || "", preset);
    window.dispatchEvent(
      new CustomEvent("cmms-theme-preview", {
        detail: { primary, gradient, sidebar: base.sidebar, body: base.body },
      })
    );
    const design: Record<string, string> = {};
    for (const k of designKeys) {
      if (next[k]) design[k] = next[k]; // ข้ามค่าว่าง (เช่น sidebar bg = ตาม preset)
    }
    window.dispatchEvent(new CustomEvent("cmms-design-preview", { detail: design }));
  }, [designKeys]);

  const setField = useCallback(
    (key: string, value: string) => {
      setForm((f) => {
        const next = { ...f, [key]: value };
        dispatchLive(next);
        return next;
      });
    },
    [dispatchLive]
  );

  // โหลดค่าจากฐานข้อมูล
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/settings.php", { cache: "no-store" });
        const json = await res.json();
        if (!Array.isArray(json) || cancelled) return;
        const nextRows: Record<string, { id: number; value: string }> = {};
        const nextForm: Record<string, string> = { ...DESIGN_DEFAULTS };
        for (const s of json as any[]) {
          if (allKeys.includes(s.setting_key)) {
            nextRows[s.setting_key] = { id: Number(s.id), value: String(s.setting_value ?? "") };
            nextForm[s.setting_key] = String(s.setting_value ?? "");
          }
        }
        setRows(nextRows);
        setForm(nextForm);
        // apply ค่าจาก DB ทันทีเมื่อเปิดหน้า (เผื่อ ThemeProvider ยังไม่โหลดทัน)
        dispatchLive(nextForm);
      } catch (e) {
        console.error("PageDesigner load error", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaveErr("");
    setSaveMsg("");
    for (const k of HEX_KEYS) {
      const v = String(form[k] ?? "");
      if (v && !isHex6(v)) {
        setSaveErr(`ค่า "${DESIGN_META[k]?.label ?? k}" ต้องเป็นรหัสสี #RRGGBB (6 หลัก)`);
        return;
      }
    }
    setSaving(true);
    try {
      let saved = 0;
      for (const key of allKeys) {
        const value = form[key] ?? DESIGN_DEFAULTS[key] ?? "";
        const existing = rows[key];
        // คีย์ใหม่ที่ยังไม่เคยบันทึก + ค่าว่าง → ข้าม (เช่น sidebar bg ว่าง = ตาม preset)
        if (!existing && !value) continue;
        if (!existing) {
          const res = await fetch("/api/v1/settings.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              setting_key: key,
              setting_value: value,
              setting_group: DESIGN_META[key]?.group ?? "design",
              description: DESIGN_META[key]?.label ?? key,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error || `POST ${key} failed`);
          }
        } else {
          const res = await fetch(`/api/v1/settings.php?id=${existing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ setting_value: value }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error || `PUT ${key} failed`);
          }
        }
        saved++;
      }
      setSaveMsg(`บันทึกการปรับแต่ง ${saved} รายการสำเร็จ — ทั้งระบบเปลี่ยนตามแล้ว`);
      // reload ids (คีย์ใหม่อาจเพิ่งถูกสร้าง)
      const res = await fetch("/api/v1/settings.php", { cache: "no-store" });
      const json = await res.json();
      if (Array.isArray(json)) {
        const nextRows: Record<string, { id: number; value: string }> = {};
        for (const s of json as any[]) {
          if (allKeys.includes(s.setting_key)) {
            nextRows[s.setting_key] = { id: Number(s.id), value: String(s.setting_value ?? "") };
          }
        }
        setRows(nextRows);
      }
      setTimeout(() => setSaveMsg(""), 5000);
    } catch (e: any) {
      console.error(e);
      setSaveErr(e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleResetAll = () => {
    // reset เฉพาะ design keys — ธีม (theme_preset/hex) ปล่อยตามเดิม
    const next = { ...form };
    for (const k of designKeys) next[k] = DESIGN_DEFAULTS[k] ?? "";
    setForm(next);
    dispatchLive(next);
    setSaveMsg("คืนค่าเริ่มต้นของส่วนปรับแต่งแล้ว — กดบันทึกเพื่อยืนยันลงฐานข้อมูล");
    setTimeout(() => setSaveMsg(""), 5000);
  };

  // จำนวนค่าที่ต่างจากค่าใน DB (สำหรับป้าย "มีการแก้ไข")
  const dirtyCount = allKeys.filter((k) => {
    const cur = form[k] ?? "";
    const db = rows[k]?.value ?? "";
    return cur !== db;
  }).length;

  // ── Nav list (settings-sidebar pattern) ──
  const navList = (
    <nav className="flex flex-col gap-1 p-3" aria-label="หมวดการปรับแต่ง">
      {SECTIONS.map((s) => {
        const active = !isNarrow && activeSection === s.id;
        return (
          <button
            key={s.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => {
              setActiveSection(s.id);
              if (isNarrow) setMobileView("detail");
            }}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              width: "100%", padding: "10px 12px",
              border: "none", borderRadius: "var(--cmms-radius)",
              cursor: "pointer", textAlign: "left",
              background: active ? "var(--cmms-primary-light)" : "transparent",
              color: active ? "var(--cmms-primary)" : "var(--cmms-text-primary)",
              font: "inherit",
            }}
          >
            <s.icon
              className="h-5 w-5 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
              style={{ color: active ? "var(--cmms-primary)" : "var(--cmms-text-secondary)" }}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{s.label}</span>
              <span className="block text-xs text-muted-foreground">{s.desc}</span>
            </span>
            {isNarrow && (
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-[var(--cmms-text-secondary)]" strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        );
      })}
    </nav>
  );

  const section = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0];

  // ── Detail panels ──
  const detail = (
    <VStack gap={6}>
      {activeSection === "theme" && (
        <>
          <SectionTitle
            eyebrow="THEME & COLORS"
            title="ธีม & สีทั้งระบบ"
            desc="เลือก preset หรือกำหนดสีหลักเอง — สีจะเปลี่ยนทั้งระบบแบบเรียลไทม์"
          />
          <HStack gap={3} wrap="wrap">
            {Object.entries(THEME_PRESETS).map(([key, t]) => {
              const active = (form.theme_preset || "toppan") === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setField("theme_preset", key);
                    setField("theme_primary_hex", t.primary);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    border: active ? "2px solid var(--cmms-primary)" : "1px solid var(--cmms-border)",
                    borderRadius: "var(--cmms-radius)",
                    background: "var(--cmms-bg-card)",
                    cursor: "pointer",
                  }}
                >
                  <span
                    className="cmms-design-grad"
                    style={{ width: 34, height: 34, ["--design-grad-a" as any]: t.primary } as React.CSSProperties}
                  />
                  <VStack gap={0} hAlign="start">
                    <span className="text-[13px] font-bold">{t.label}</span>
                    <span className="text-[11px] text-muted-foreground">{t.primary}</span>
                  </VStack>
                </button>
              );
            })}
          </HStack>
          <HStack gap={5} wrap="wrap">
            <ColorField
              label="สีหลัก (Accent)"
              value={form.theme_primary_hex ?? ""}
              onChange={(v) => setField("theme_primary_hex", v)}
            />
            <ColorField
              label="สีรอง (Gradient ปลาย)"
              value={form.theme_secondary_hex ?? ""}
              onChange={(v) => setField("theme_secondary_hex", v)}
            />
          </HStack>
          <VStack gap={2}>
            <span className="text-sm font-medium">
              ตัวอย่าง gradient
            </span>
            <div
              className="cmms-design-grad"
              style={
                {
                  height: 56,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 16px",
                  color: "#FFFFFF",
                  fontWeight: 700,
                  fontSize: 14,
                  ["--design-grad-a" as any]: isHex6(form.theme_primary_hex as string)
                    ? form.theme_primary_hex
                    : (THEME_PRESETS[form.theme_preset || "toppan"]?.primary ?? "#0068B5"),
                  ["--design-grad-b" as any]: isHex6(form.theme_secondary_hex as string)
                    ? form.theme_secondary_hex
                    : (THEME_PRESETS[form.theme_preset || "toppan"]?.gradient.split(",").pop()?.trim() ?? "#0093FF"),
                } as React.CSSProperties
              }
            >
              {THEME_PRESETS[form.theme_preset || "toppan"]?.label ?? "TOPPAN Blue"} —{" "}
              {form.theme_primary_hex || "auto"}
            </div>
          </VStack>
        </>
      )}

      {activeSection === "sidenav" && (
        <>
          <SectionTitle
            eyebrow="SIDE NAVIGATION"
            title="เมนูข้าง (SideNav)"
            desc="ปรับโทนสีเมนูด้านข้าง — เห็นผลกับทุกหน้าทันที"
          />
          <HStack gap={6} wrap="wrap" vAlign="start">
            <VStack gap={4} style={{ flex: "1 1 260px" }}>
              <ColorField
                label="สีพื้นหลัง"
                value={form.design_sidebar_bg ?? ""}
                onChange={(v) => setField("design_sidebar_bg", v)}
              />
              <p className="text-sm text-muted-foreground">
                เว้นว่าง = ใช้สี SideNav จากธีมที่เลือกอัตโนมัติ
              </p>
              <ColorField
                label="สีตัวหนังสือเมนู"
                value={form.design_sidebar_text ?? ""}
                onChange={(v) => setField("design_sidebar_text", v)}
              />
              <ColorField
                label="สีตัวชี้ตำแหน่งเมนูปัจจุบัน"
                value={form.design_sidebar_indicator ?? ""}
                onChange={(v) => setField("design_sidebar_indicator", v)}
              />
            </VStack>
            <Card style={{ flex: "1 1 220px", maxWidth: 260 }}>
              <CardContent className="p-4">
                <p className="cmms-eyebrow text-sm text-muted-foreground">
                  LIVE PREVIEW
                </p>
                <div className="cmms-design-sidenav" style={{ padding: 12, marginTop: 8 }}>
                  <VStack gap={2}>
                    <HStack gap={2} vAlign="center" style={{ padding: "6px 10px" }}>
                      <span className="cmms-design-sidenav-dot" />
                      <span className="text-sm font-bold" style={{ color: "var(--cmms-sidebar-text-strong)" }}>
                        CMMS-TOPPAN
                      </span>
                    </HStack>
                    {["แดชบอร์ดภาพรวม", "ใบสั่งงานซ่อม", "แจ้งซ่อมด่วน", "งานของฉัน"].map((m, i) => (
                      <div
                        key={m}
                        className={`cmms-design-sidenav-item ${i === 2 ? "selected" : ""}`}
                        style={{ padding: "7px 10px", display: "flex", alignItems: "center", gap: 8 }}
                      >
                        <span className="cmms-design-sidenav-dot" />
                        <span className="text-sm" style={{ color: "inherit" }}>
                          {m}
                        </span>
                      </div>
                    ))}
                    <div style={{ padding: "8px 10px" }}>
                      <AndonLamp status="ok" size="sm" showLabel />
                    </div>
                  </VStack>
                </div>
              </CardContent>
            </Card>
          </HStack>
        </>
      )}

      {activeSection === "cards" && (
        <>
          <SectionTitle
            eyebrow="CARDS & ANDON"
            title="การ์ด KPI & ไฟ Andon"
            desc="มุมโค้ง เงา พื้นหลัง และสีหลอดไฟสถานะแบบโรงงาน"
          />
          <HStack gap={5} wrap="wrap">
            <VStack gap={3} style={{ flex: "1 1 240px" }}>
              <VStack gap={1}>
                <span className="text-sm font-medium">
                  มุมโค้งการ์ด
                </span>
                <Select
                  value={form.design_card_radius ?? "12px"}
                  onValueChange={(v) => setField("design_card_radius", String(v))}
                >
                  <SelectTrigger aria-label="มุมโค้งการ์ด"><SelectValue placeholder="เลือกมุมโค้ง..." /></SelectTrigger>
                  <SelectContent>
                    {RADIUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </VStack>
              <VStack gap={1}>
                <span className="text-sm font-medium">
                  ความเข้มเงา
                </span>
                <Select
                  value={form.design_card_shadow ?? SHADOW_OPTIONS[1].value}
                  onValueChange={(v) => setField("design_card_shadow", String(v))}
                >
                  <SelectTrigger aria-label="ความเข้มเงา"><SelectValue placeholder="เลือกความเข้มเงา..." /></SelectTrigger>
                  <SelectContent>
                    {SHADOW_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </VStack>
              <ColorField
                label="สีพื้นหลังหน้า"
                value={form.design_body_bg ?? ""}
                onChange={(v) => setField("design_body_bg", v)}
              />
              <hr style={{ borderColor: "var(--cmms-border)" }} />
              <VStack gap={2}>
                <span className="text-sm font-medium">
                  สีหลอดไฟ Andon
                </span>
                <ColorField
                  label="หลอดเขียว (พร้อมใช้งาน)"
                  value={form.design_andon_ok ?? ""}
                  onChange={(v) => setField("design_andon_ok", v)}
                />
                <ColorField
                  label="หลอดเหลือง (ต้องดูแล)"
                  value={form.design_andon_warn ?? ""}
                  onChange={(v) => setField("design_andon_warn", v)}
                />
                <ColorField
                  label="หลอดแดง (หยุดทำงาน)"
                  value={form.design_andon_down ?? ""}
                  onChange={(v) => setField("design_andon_down", v)}
                />
              </VStack>
            </VStack>
            <VStack gap={3} style={{ flex: "1 1 280px" }}>
              <span className="cmms-eyebrow text-sm text-muted-foreground">
                LIVE PREVIEW
              </span>
              <div className="cmms-design-kpi" style={{ padding: 16 }}>
                <HStack hAlign="between" vAlign="center">
                  <VStack gap={0}>
                    <p className="text-sm text-muted-foreground">
                      งานที่ค้าง
                    </p>
                    <span className="cmms-kpi-value cmms-num" style={{ fontSize: 28, lineHeight: 1 }}>
                      9
                    </span>
                  </VStack>
                  <AndonLamp status="down" size="md" />
                </HStack>
              </div>
              <div className="cmms-design-kpi" style={{ padding: 16 }}>
                <HStack hAlign="between" vAlign="center">
                  <VStack gap={0}>
                    <p className="text-sm text-muted-foreground">
                      งานที่กำลังทำ
                    </p>
                    <span className="cmms-kpi-value cmms-num" style={{ fontSize: 28, lineHeight: 1 }}>
                      14
                    </span>
                  </VStack>
                  <AndonLamp status="warn" size="md" />
                </HStack>
              </div>
              <div className="cmms-design-kpi" style={{ padding: 16 }}>
                <HStack hAlign="between" vAlign="center">
                  <VStack gap={0}>
                    <p className="text-sm text-muted-foreground">
                      งานที่เสร็จวันนี้
                    </p>
                    <span className="cmms-kpi-value cmms-num" style={{ fontSize: 28, lineHeight: 1 }}>
                      32
                    </span>
                  </VStack>
                  <AndonLamp status="ok" size="md" />
                </HStack>
              </div>
            </VStack>
          </HStack>
        </>
      )}

      {activeSection === "typography" && (
        <>
          <SectionTitle
            eyebrow="TYPOGRAPHY"
            title="ตัวอักษร (ฟอนต์)"
            desc="เลือกฟอนต์หลักและขนาดฐาน — ใช้กับทั้งระบบ"
          />
          <HStack gap={6} wrap="wrap" vAlign="start">
            <VStack gap={4} style={{ flex: "1 1 260px" }}>
              <VStack gap={1}>
                <span className="text-sm font-medium">
                  ฟอนต์หลัก
                </span>
                <Select
                  value={form.design_font_family ?? FONT_OPTIONS[0].value}
                  onValueChange={(v) => setField("design_font_family", String(v))}
                >
                  <SelectTrigger aria-label="ฟอนต์หลัก"><SelectValue placeholder="เลือกฟอนต์..." /></SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </VStack>
              <VStack gap={1}>
                <span className="text-sm font-medium">
                  ขนาดตัวหนังสือฐาน
                </span>
                <Select
                  value={form.design_font_size ?? "16px"}
                  onValueChange={(v) => setField("design_font_size", String(v))}
                >
                  <SelectTrigger aria-label="ขนาดตัวหนังสือฐาน"><SelectValue placeholder="เลือกขนาด..." /></SelectTrigger>
                  <SelectContent>
                    {FONT_SIZE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </VStack>
            </VStack>
            <Card style={{ flex: "1 1 320px" }}>
              <CardContent className="p-6">
                <p className="cmms-eyebrow text-sm text-muted-foreground">
                  LIVE PREVIEW
                </p>
                <VStack gap={2} style={{ marginTop: 10 }}>
                  <h2 className="text-base font-semibold">หัวข้อตัวอย่าง</h2>
                  <p className="text-sm">
                    ข้อความเนื้อหาตัวอย่าง — แสดงฟอนต์และขนาดที่เลือกแบบเรียลไทม์
                    ทั้งหัวข้อ เนื้อหา และป้ายกำกับต่าง ๆ ทั่วทั้งระบบ
                  </p>
                  <HStack gap={2} wrap="wrap">
                    <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>
                      ป้ายสถานะ
                    </span>
                    <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                      หมายเลข 12345
                    </span>
                  </HStack>
                </VStack>
              </CardContent>
            </Card>
          </HStack>
        </>
      )}

      {activeSection === "pages" && (
        <>
          <SectionTitle
            eyebrow="PAGE STUDIO · ทุกหน้าในระบบ"
            title="สตูดิโอปรับแต่งรายหน้า"
            desc="ครบทุกหน้าในระบบ — เปิดสตูดิโอเพื่อปรับสี สไตล์ ข้อความ และจัดวาง Layout (ลาก-วาง) เฉพาะหน้านั้น"
          />
          <Card>
            <CardContent className="space-y-3 p-4">
              {Array.from(new Set(ALL_PAGES.map((p) => p.category))).map((cat) => (
                <div key={cat} className="space-y-1">
                  <p className="cmms-eyebrow text-sm text-muted-foreground">
                    {cat}
                  </p>
                  <div>
                    {ALL_PAGES.filter((p) => p.category === cat).map((p) => (
                      <div
                        key={p.value}
                        className="flex items-center gap-3 border-b py-2.5 last:border-b-0"
                        style={{ borderColor: "var(--cmms-border)" }}
                      >
                        <WindowIcon className="h-5 w-5 shrink-0 text-[var(--cmms-text-secondary)]" strokeWidth={1.75} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{p.label}</span>
                          <span className="block font-mono text-xs text-muted-foreground">{p.value}</span>
                        </span>
                        {isWired(p.value) && (
                          <span className="cmms-andon-chip shrink-0" style={{ background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" }}>
                            มีผลกับหน้าแล้ว
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => router.push(`/editor?page=${encodeURIComponent(p.value)}`)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--cmms-text-primary)] transition-colors hover:bg-[var(--cmms-bg-muted)]"
                          style={{ background: "var(--cmms-bg-muted)" }}
                        >
                          <PencilSquareIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          เปิดสตูดิโอ
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </VStack>
  );

  // ── Mobile: master → detail ──
  if (isNarrow && mobileView === "nav") {
    return (
      <PageShell
        breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ตั้งค่า", href: "/settings" }, { label: "ปรับแต่งหน้าตาของระบบ" }]}
        title="ปรับแต่งหน้าตาระบบทั้งหมด"
        description="ธีม สี เมนู การ์ด ฟอนต์ และรายหน้า — ดูตัวอย่างสดก่อนบันทึก"
      >
        <Card>
          <CardContent className="space-y-3 p-2">
            <HStack hAlign="between" vAlign="center" style={{ padding: "8px 12px 0" }}>
              <VStack gap={0}>
                <p className="cmms-eyebrow text-sm text-muted-foreground">
                  QUICK ACTIONS
                </p>
                <span className="font-semibold">
                  หมวดการปรับแต่ง
                </span>
              </VStack>
              {dirtyCount > 0 && (
                <span className="cmms-andon-chip" style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}>
                  แก้ {dirtyCount} รายการ
                </span>
              )}
            </HStack>
            <hr style={{ borderColor: "var(--cmms-border)" }} />
            {navList}
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ตั้งค่า", href: "/settings" }, { label: "ปรับแต่งหน้าตาของระบบ" }]}
      title="ปรับแต่งหน้าตาระบบทั้งหมด"
      description="ธีม สี เมนู การ์ด ฟอนต์ และรายหน้า — ดูตัวอย่างสดก่อนบันทึกลงฐานข้อมูล"
      actions={
        <>
          {dirtyCount > 0 && (
            <span className="cmms-andon-chip" style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}>
              มีการแก้ไข {dirtyCount} รายการ
            </span>
          )}
          <Button variant="secondary" onClick={handleResetAll}>
            <ArrowPathIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            คืนค่าเริ่มต้น
          </Button>
          <Button disabled={saving} onClick={handleSave}>
            {saving ? "กำลังบันทึก..." : "บันทึกการปรับแต่ง"}
          </Button>
        </>
      }
    >
      {saveMsg && (
        <Alert variant="success" title="สำเร็จ" description={saveMsg} />
      )}
      {saveErr && (
        <Alert variant="danger" title="เกิดข้อผิดพลาด" description={saveErr} />
      )}

      {loading ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              กำลังโหลดค่าปัจจุบันจากฐานข้อมูล...
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[300px_1fr]">
          {!isNarrow && (
            <Card className="lg:sticky lg:top-4 self-start">
              {navList}
            </Card>
          )}
          <div className="min-w-0 space-y-6">
            {isNarrow && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMobileView("nav")}
                  aria-label="กลับไปเมนูหมวด"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--cmms-text-primary)] transition-colors hover:bg-[var(--cmms-bg-muted)]"
                  style={{ background: "var(--cmms-bg-muted)" }}
                >
                  <ArrowLeftIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
                <h2 className="text-base font-semibold">{section.label}</h2>
              </div>
            )}
            {detail}
          </div>
        </div>
      )}
    </PageShell>
  );
}
