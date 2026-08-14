"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import {
  VStack,
  HStack,
  Layout,
  LayoutContent,
  LayoutPanel,
} from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Selector } from "@astryxdesign/core/Selector";
import { List, ListItem } from "@astryxdesign/core/List";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Icon } from "@astryxdesign/core/Icon";
import { THEME_PRESETS, buildGradient } from "../../../../components/ThemeProvider";
import AndonLamp from "../../../../components/AndonLamp";
import {
  SwatchIcon,
  Bars3Icon,
  Squares2X2Icon,
  PencilSquareIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  WindowIcon,
  PaintBrushIcon,
} from "@heroicons/react/24/outline";

// ─────────────────────────────────────────────────────────────────────────────
// Config — sections, keys, defaults
// ─────────────────────────────────────────────────────────────────────────────

interface SectionDef {
  id: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
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
  design_sidebar_text: "#FFFFFF",
  design_sidebar_indicator: "#38BDF8",
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

const SYSTEM_PAGES: { value: string; label: string; category: string }[] = [
  { value: "/dashboard", label: "แดชบอร์ดภาพรวมระบบ", category: "งานซ่อมบำรุง" },
  { value: "/repair", label: "รายการใบสั่งงานซ่อม", category: "งานซ่อมบำรุง" },
  { value: "/repair/request", label: "ฟอร์มแจ้งซ่อมด่วน", category: "งานซ่อมบำรุง" },
  { value: "/repair/kanban", label: "กระดานคัมบัง", category: "งานซ่อมบำรุง" },
  { value: "/repair/tracking", label: "ติดตามงานซ่อม", category: "งานซ่อมบำรุง" },
  { value: "/pm_am/calendar", label: "ปฏิทินแผน PM/AM", category: "แผน PM & เครื่องจักร" },
  { value: "/asset_registry", label: "ทะเบียนเครื่องจักร", category: "แผน PM & เครื่องจักร" },
  { value: "/spare_parts", label: "คลังสต็อกอะไหล่", category: "คลังอะไหล่" },
  { value: "/spare_parts/issue_center", label: "ศูนย์เบิก-จ่ายอะไหล่", category: "คลังอะไหล่" },
  { value: "/analytics/kpi", label: "KPI ผู้บริหาร", category: "วิเคราะห์ & รายงาน" },
  { value: "/users", label: "การจัดการผู้ใช้งาน", category: "บุคลากร" },
  { value: "/settings", label: "ตั้งค่าระบบทั้งหมด", category: "ตั้งค่า" },
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
      <Text type="body" size="sm" weight="semibold">
        {label}
      </Text>
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
          <CheckCircleIcon className="w-4 h-4" style={{ color: "var(--cmms-success)" }} />
        ) : (
          <ExclamationCircleIcon className="w-4 h-4" style={{ color: "var(--cmms-warning)" }} />
        )}
      </HStack>
    </VStack>
  );
}

function SectionTitle({ eyebrow, title, desc }: { eyebrow: string; title: string; desc: string }) {
  return (
    <VStack gap={1}>
      <Text type="body" size="sm" className="cmms-eyebrow">
        {eyebrow}
      </Text>
      <Heading level={2}>{title}</Heading>
      <Text type="body" size="sm" color="secondary">
        {desc}
      </Text>
    </VStack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function PageDesignerPage() {
  const router = useRouter();
  const isNarrow = useMediaQuery("(max-width: 768px)");
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
    <VStack gap={3} style={{ padding: "var(--spacing-4) var(--spacing-3)" }}>
      <VStack gap={1} style={{ paddingInline: "var(--spacing-4)" }}>
        <Text type="body" size="sm" className="cmms-eyebrow">
          PAGE DESIGNER
        </Text>
        <Heading level={2}>ปรับแต่งหน้าตาระบบ</Heading>
        <Text type="body" size="sm" color="secondary">
          เลือกหมวดที่ต้องการปรับแต่ง — ดูตัวอย่างสดทันที ก่อนกดบันทึก
        </Text>
      </VStack>
      <Divider />
      <List density="spacious">
        {SECTIONS.map((s) => (
          <ListItem
            key={s.id}
            label={s.label}
            description={s.desc}
            startContent={<Icon icon={s.icon} />}
            endContent={
              isNarrow ? (
                <Icon icon={ChevronRightIcon} size="sm" color="secondary" />
              ) : undefined
            }
            isSelected={!isNarrow && activeSection === s.id}
            onClick={() => {
              setActiveSection(s.id);
              if (isNarrow) setMobileView("detail");
            }}
          />
        ))}
      </List>
    </VStack>
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
                    <Text type="body" weight="bold" style={{ fontSize: 13 }}>
                      {t.label}
                    </Text>
                    <Text type="body" size="sm" color="secondary" style={{ fontSize: 11 }}>
                      {t.primary}
                    </Text>
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
            <Text type="body" size="sm" weight="semibold">
              ตัวอย่าง gradient
            </Text>
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
              <Text type="body" size="sm" color="secondary">
                เว้นว่าง = ใช้สี SideNav จากธีมที่เลือกอัตโนมัติ
              </Text>
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
            <Card padding={4} style={{ flex: "1 1 220px", maxWidth: 260 }}>
              <Text type="body" size="sm" className="cmms-eyebrow">
                LIVE PREVIEW
              </Text>
              <div className="cmms-design-sidenav" style={{ padding: 12, marginTop: 8 }}>
                <VStack gap={2}>
                  <HStack gap={2} vAlign="center" style={{ padding: "6px 10px" }}>
                    <span className="cmms-design-sidenav-dot" />
                    <Text type="body" size="sm" weight="bold" style={{ color: "var(--cmms-sidebar-text-strong)" }}>
                      CMMS-TOPPAN
                    </Text>
                  </HStack>
                  {["แดชบอร์ดภาพรวม", "ใบสั่งงานซ่อม", "แจ้งซ่อมด่วน", "งานของฉัน"].map((m, i) => (
                    <div
                      key={m}
                      className={`cmms-design-sidenav-item ${i === 2 ? "selected" : ""}`}
                      style={{ padding: "7px 10px", display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span className="cmms-design-sidenav-dot" />
                      <Text type="body" size="sm" style={{ color: "inherit" }}>
                        {m}
                      </Text>
                    </div>
                  ))}
                  <div style={{ padding: "8px 10px" }}>
                    <AndonLamp status="ok" size="sm" showLabel />
                  </div>
                </VStack>
              </div>
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
                <Text type="body" size="sm" weight="semibold">
                  มุมโค้งการ์ด
                </Text>
                <Selector
                  label="มุมโค้งการ์ด"
                  isLabelHidden
                  value={form.design_card_radius ?? "12px"}
                  onChange={(v) => setField("design_card_radius", String(v))}
                  options={RADIUS_OPTIONS}
                />
              </VStack>
              <VStack gap={1}>
                <Text type="body" size="sm" weight="semibold">
                  ความเข้มเงา
                </Text>
                <Selector
                  label="ความเข้มเงา"
                  isLabelHidden
                  value={form.design_card_shadow ?? SHADOW_OPTIONS[1].value}
                  onChange={(v) => setField("design_card_shadow", String(v))}
                  options={SHADOW_OPTIONS}
                />
              </VStack>
              <ColorField
                label="สีพื้นหลังหน้า"
                value={form.design_body_bg ?? ""}
                onChange={(v) => setField("design_body_bg", v)}
              />
              <Divider />
              <VStack gap={2}>
                <Text type="body" size="sm" weight="semibold">
                  สีหลอดไฟ Andon
                </Text>
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
              <Text type="body" size="sm" className="cmms-eyebrow">
                LIVE PREVIEW
              </Text>
              <div className="cmms-design-kpi" style={{ padding: 16 }}>
                <HStack hAlign="between" vAlign="center">
                  <VStack gap={0}>
                    <Text type="body" size="sm" color="secondary">
                      งานที่ค้าง
                    </Text>
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
                    <Text type="body" size="sm" color="secondary">
                      งานที่กำลังทำ
                    </Text>
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
                    <Text type="body" size="sm" color="secondary">
                      งานที่เสร็จวันนี้
                    </Text>
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
                <Text type="body" size="sm" weight="semibold">
                  ฟอนต์หลัก
                </Text>
                <Selector
                  label="ฟอนต์หลัก"
                  isLabelHidden
                  value={form.design_font_family ?? FONT_OPTIONS[0].value}
                  onChange={(v) => setField("design_font_family", String(v))}
                  options={FONT_OPTIONS}
                />
              </VStack>
              <VStack gap={1}>
                <Text type="body" size="sm" weight="semibold">
                  ขนาดตัวหนังสือฐาน
                </Text>
                <Selector
                  label="ขนาดตัวหนังสือฐาน"
                  isLabelHidden
                  value={form.design_font_size ?? "16px"}
                  onChange={(v) => setField("design_font_size", String(v))}
                  options={FONT_SIZE_OPTIONS}
                />
              </VStack>
            </VStack>
            <Card padding={6} style={{ flex: "1 1 320px" }}>
              <Text type="body" size="sm" className="cmms-eyebrow">
                LIVE PREVIEW
              </Text>
              <VStack gap={2} style={{ marginTop: 10 }}>
                <Heading level={2}>หัวข้อตัวอย่าง</Heading>
                <Text type="body">
                  ข้อความเนื้อหาตัวอย่าง — แสดงฟอนต์และขนาดที่เลือกแบบเรียลไทม์
                  ทั้งหัวข้อ เนื้อหา และป้ายกำกับต่าง ๆ ทั่วทั้งระบบ
                </Text>
                <HStack gap={2} wrap="wrap">
                  <Badge label="ป้ายสถานะ" variant="info" />
                  <Badge label="หมายเลข 12345" variant="neutral" />
                </HStack>
              </VStack>
            </Card>
          </HStack>
        </>
      )}

      {activeSection === "pages" && (
        <>
          <SectionTitle
            eyebrow="PAGE STUDIO"
            title="สตูดิโอปรับแต่งรายหน้า"
            desc="เลือกหน้าเพื่อปรับสี สไตล์ และข้อความเฉพาะหน้านั้น ๆ — เปิดตัวแก้ไขแบบเต็มจอ"
          />
          <Card padding={4}>
            <VStack gap={3}>
              {Array.from(new Set(SYSTEM_PAGES.map((p) => p.category))).map((cat) => (
                <VStack key={cat} gap={1}>
                  <Text type="body" size="sm" className="cmms-eyebrow">
                    {cat}
                  </Text>
                  <List density="balanced" hasDividers={false}>
                    {SYSTEM_PAGES.filter((p) => p.category === cat).map((p) => (
                      <ListItem
                        key={p.value}
                        label={p.label}
                        description={p.value}
                        startContent={<Icon icon={WindowIcon} />}
                        endContent={
                          <Button
                            label="เปิดสตูดิโอ"
                            size="sm"
                            variant="secondary"
                            icon={<Icon icon={PencilSquareIcon} size="sm" />}
                            onClick={() => router.push(`/editor?page=${encodeURIComponent(p.value)}`)}
                          />
                        }
                      />
                    ))}
                  </List>
                </VStack>
              ))}
            </VStack>
          </Card>
        </>
      )}
    </VStack>
  );

  // ── Mobile: master → detail ──
  if (isNarrow && mobileView === "nav") {
    return (
      <VStack gap={4}>
        <div className="cmms-page-hero">
          <VStack gap={1}>
            <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>
              PAGE DESIGNER · CMMS-TOPPAN
            </Text>
            <Heading level={2} style={{ color: "#FFFFFF" }}>
              ปรับแต่งหน้าตาระบบทั้งหมด
            </Heading>
            <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
              ธีม สี เมนู การ์ด ฟอนต์ และรายหน้า — ดูตัวอย่างสดก่อนบันทึก
            </Text>
          </VStack>
        </div>
        <Card padding={2}>
          <VStack gap={3}>
            <HStack hAlign="between" vAlign="center" style={{ padding: "8px 12px 0" }}>
              <VStack gap={0}>
                <Text type="body" size="sm" className="cmms-eyebrow">
                  QUICK ACTIONS
                </Text>
                <Text type="body" weight="bold">
                  หมวดการปรับแต่ง
                </Text>
              </VStack>
              {dirtyCount > 0 && <Badge label={`แก้ ${dirtyCount} รายการ`} variant="warning" />}
            </HStack>
            <Divider />
            <VStack gap={1}>
              {SECTIONS.map((s) => (
                <ListItem
                  key={s.id}
                  label={s.label}
                  description={s.desc}
                  startContent={<Icon icon={s.icon} />}
                  endContent={<Icon icon={ChevronRightIcon} size="sm" color="secondary" />}
                  onClick={() => {
                    setActiveSection(s.id);
                    setMobileView("detail");
                  }}
                />
              ))}
            </VStack>
          </VStack>
        </Card>
      </VStack>
    );
  }

  return (
    <VStack gap={4}>
      {/* Hero header */}
      <div className="cmms-page-hero">
        <HStack hAlign="between" vAlign="center" wrap="wrap" gap={4}>
          <VStack gap={1}>
            <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>
              PAGE DESIGNER · ระบบ & ตั้งค่า
            </Text>
            <Heading level={2} style={{ color: "#FFFFFF" }}>
              ปรับแต่งหน้าตาระบบทั้งหมด
            </Heading>
            <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
              ธีม สี เมนู การ์ด ฟอนต์ และรายหน้า — ดูตัวอย่างสดก่อนบันทึกลงฐานข้อมูล
            </Text>
          </VStack>
          <HStack gap={2} wrap="wrap">
            {dirtyCount > 0 && <Badge label={`มีการแก้ไข ${dirtyCount} รายการ`} variant="warning" />}
            <Button
              label="คืนค่าเริ่มต้น"
              variant="ghost"
              icon={<Icon icon={ArrowPathIcon} size="sm" />}
              onClick={handleResetAll}
            />
            <Button
              label={saving ? "กำลังบันทึก..." : "บันทึกการปรับแต่ง"}
              variant="primary"
              isLoading={saving}
              isDisabled={saving}
              onClick={handleSave}
            />
          </HStack>
        </HStack>
      </div>

      {saveMsg && (
        <Card padding={3} style={{ background: "var(--cmms-success-light)", border: "1px solid var(--cmms-success)" }}>
          <HStack gap={3} vAlign="center">
            <CheckCircleIcon className="w-5 h-5" style={{ color: "var(--cmms-success)" }} />
            <Text type="body" weight="bold" style={{ color: "var(--cmms-success-dark)" }}>
              {saveMsg}
            </Text>
          </HStack>
        </Card>
      )}
      {saveErr && (
        <Card padding={3} style={{ background: "var(--cmms-danger-light)", border: "1px solid var(--cmms-danger)" }}>
          <HStack gap={3} vAlign="center">
            <ExclamationCircleIcon className="w-5 h-5" style={{ color: "var(--cmms-danger)" }} />
            <Text type="body" weight="bold" style={{ color: "var(--cmms-danger-dark)" }}>
              {saveErr}
            </Text>
          </HStack>
        </Card>
      )}

      {loading ? (
        <Card padding={6}>
          <Text type="body" color="secondary">
            กำลังโหลดค่าปัจจุบันจากฐานข้อมูล...
          </Text>
        </Card>
      ) : (
        <Layout
          height="fill"
          start={
            isNarrow ? undefined : (
              <LayoutPanel hasDivider padding={0} style={{ minWidth: 300 }}>
                {navList}
              </LayoutPanel>
            )
          }
          content={
            <LayoutContent padding={4}>
              <VStack gap={0}>
                {isNarrow && (
                  <Toolbar
                    label={`Back to Page Designer — ${section.label}`}
                    gap={2}
                    startContent={
                      <>
                        <Button
                          label="Back to Page Designer"
                          variant="ghost"
                          size="sm"
                          isIconOnly
                          icon={<Icon icon={ArrowLeftIcon} size="sm" />}
                          onClick={() => setMobileView("nav")}
                        />
                        <Heading level={2}>{section.label}</Heading>
                      </>
                    }
                  />
                )}
                {detail}
              </VStack>
            </LayoutContent>
          }
        />
      )}
    </VStack>
  );
}
