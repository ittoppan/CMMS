"use client";

import { useState } from "react";
import { VStack, HStack } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { THEME_PRESETS } from "./ThemeProvider";

interface Props {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onSave: () => void;
  saving: boolean;
}

const hexToRgb = (hex: string): string => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return "79, 70, 229";
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};

const isHex = (v: string) => /^#[0-9a-fA-F]{3,8}$/.test(v);

// สถานะรหัสสีแบบเรียลไทม์ (#RRGGBB 6 หลักเต็ม)
function HexStatus({ value }: { value: string }) {
  const v = (value || "").trim();
  if (!v) return null;
  const ok = /^#[0-9a-fA-F]{6}$/.test(v);
  return (
    <p className="text-sm" style={{ color: ok ? "var(--cmms-success)" : "var(--cmms-danger)" }}>
      {ok ? "✓ รหัสสีถูกต้อง" : "✕ ต้องเป็น #RRGGBB (6 หลัก)"}
    </p>
  );
}

export default function ThemeSettingsPanel({ values, onChange, onSave, saving }: Props) {
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const primary = isHex(values.theme_primary_hex) ? values.theme_primary_hex : "#0068B5";
  const secondary = isHex(values.theme_secondary_hex) ? values.theme_secondary_hex : "";
  const preset = (values.theme_preset as string) || "indigo";

  // preview แบบสด (ไม่ต้องบันทึก) — ส่ง event ให้ ThemeProvider ทั้งระบบเปลี่ยนทันที
  const preview = (p: string, pri?: string, sec?: string) => {
    const base = THEME_PRESETS[p] ?? THEME_PRESETS.indigo;
    const primaryHex = pri || primary;
    const secondaryHex = sec || secondary;
    const gradient = isHex(secondaryHex)
      ? `linear-gradient(135deg, ${primaryHex}, ${secondaryHex})`
      : base.gradient;
    window.dispatchEvent(
      new CustomEvent("cmms-theme-preview", {
        detail: {
          primary: primaryHex,
          gradient,
          sidebar: base.sidebar,
          body: base.body,
        },
      })
    );
    setPreviewKey(p);
  };

  // เลือก preset → preview ทันที + ใส่ลง form (บันทึกเมื่อกดปุ่มล่าง)
  const pickPreset = (key: string) => {
    const base = THEME_PRESETS[key];
    onChange("theme_preset", key);
    onChange("theme_primary_hex", base.primary);
    if (!isHex(values.theme_secondary_hex)) onChange("theme_secondary_hex", base.gradient.split(",").pop()?.trim() || "#10B981");
    preview(key, base.primary);
  };

  const current = THEME_PRESETS[preset] ?? THEME_PRESETS.indigo;

  return (
    <VStack gap={4}>
      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
        <VStack gap={0}>
          <h3 className="text-base font-semibold">เลือกธีมสีทั้งระบบ</h3>
          <p className="text-sm text-muted-foreground">
            เปลี่ยนสี accent / gradient / sidebar ได้ทันทีแบบเรียลไทม์ — กดบันทึกเพื่อบันทึกลงฐานข้อมูล
          </p>
        </VStack>
        <Badge variant="info">แสดงผลสด</Badge>
      </HStack>

      {/* Preset Swatches A/B/C */}
      <HStack gap={3} wrap="wrap">
        {Object.entries(THEME_PRESETS).map(([key, t]) => {
          const active = previewKey === key || (previewKey === null && preset === key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => pickPreset(key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                border: active ? "2px solid var(--cmms-primary)" : "1px solid var(--cmms-border)",
                borderRadius: "var(--cmms-radius)",
                background: "var(--cmms-bg-card)",
                cursor: "pointer",
                boxShadow: active ? "var(--cmms-shadow-md)" : "var(--cmms-shadow-sm)",
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: t.gradient,
                  border: "2px solid #fff",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                }}
              />
              <VStack gap={0} hAlign="start">
                <span className="text-[13px] font-bold">{t.label}</span>
                <span className="text-[11px] text-muted-foreground">{t.primary}</span>
              </VStack>
            </button>
          );
        })}
      </HStack>

      {/* Custom color pickers */}
      <HStack gap={4} wrap="wrap">
        <VStack gap={1}>
          <span className="text-sm font-medium">สีหลัก (Accent)</span>
          <HStack gap={2} vAlign="center">
            <input
              type="color"
              value={primary}
              onChange={(e) => {
                onChange("theme_primary_hex", e.target.value);
                preview(preset, e.target.value);
              }}
              style={{ width: 56, height: 36, border: "1px solid var(--cmms-border)", borderRadius: 8, cursor: "pointer", background: "transparent", padding: 2 }}
            />
            <input
              type="text"
              value={values.theme_primary_hex ?? ""}
              onChange={(e) => onChange("theme_primary_hex", e.target.value)}
              onBlur={() => preview(preset, primary)}
              placeholder="#0068B5"
              style={{ width: 110, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--cmms-border)", font: "inherit", fontSize: 13 }}
            />
          </HStack>
          <HexStatus value={values.theme_primary_hex ?? ""} />
        </VStack>
        <VStack gap={1}>
          <span className="text-sm font-medium">สีรอง (Gradient ปลาย)</span>
          <HStack gap={2} vAlign="center">
            <input
              type="color"
              value={isHex(secondary) ? secondary : "#0093FF"}
              onChange={(e) => {
                onChange("theme_secondary_hex", e.target.value);
                preview(preset, primary, e.target.value);
              }}
              style={{ width: 56, height: 36, border: "1px solid var(--cmms-border)", borderRadius: 8, cursor: "pointer", background: "transparent", padding: 2 }}
            />
            <input
              type="text"
              value={values.theme_secondary_hex ?? ""}
              onChange={(e) => onChange("theme_secondary_hex", e.target.value)}
              onBlur={() => preview(preset, primary, secondary)}
              placeholder="#0093FF"
              style={{ width: 110, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--cmms-border)", font: "inherit", fontSize: 13 }}
            />
          </HStack>
          <HexStatus value={values.theme_secondary_hex ?? ""} />
        </VStack>
        <Button disabled={saving} onClick={onSave}>
          {saving ? "กำลังบันทึก..." : "บันทึกธีมลงฐานข้อมูล"}
        </Button>
      </HStack>

      {/* Live gradient preview bar */}
      <VStack gap={1}>
        <span className="text-sm font-medium">ตัวอย่าง gradient</span>
        <div
          style={{
            height: 56,
            borderRadius: "var(--cmms-radius-lg)",
            background: isHex(secondary)
              ? `linear-gradient(135deg, ${primary}, ${secondary})`
              : (THEME_PRESETS[preset] ?? THEME_PRESETS.indigo).gradient,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            boxShadow: "var(--cmms-shadow-md)",
          }}
        >
          🎨 {current.label} — {primary}
          {isHex(secondary) ? ` → ${secondary}` : ""}
        </div>
      </VStack>
    </VStack>
  );
}
