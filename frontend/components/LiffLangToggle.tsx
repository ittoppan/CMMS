"use client";

import { useEffect } from "react";
import { applyUserLang, useLang, setUserLang } from "@/lib/i18n";
import { tliff } from "@/lib/i18n-liff";

/**
 * ปุ่มสลับภาษา TH/EN สำหรับหน้า standalone/LIFF (scan, แจ้งซ่อม, เช็คชีท)
 * - อ่านภาษาประจำตัวจาก users.lang ตอน mount (applyUserLang) แล้วแสดงตามบัญชี
 * - ปุ่มเล็ก ๆ วางมุมขวาบนของหน้า (style ปรับได้ผ่าน prop)
 */
export default function LiffLangToggle({
  style,
}: {
  style?: React.CSSProperties;
}) {
  const lang = useLang();

  useEffect(() => {
    applyUserLang();
  }, []);

  return (
    <div
      role="group"
      aria-label={tliff("liff.lang_label")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 2,
        borderRadius: 999,
        border: "1px solid var(--cmms-border, #CBD5E1)",
        background: "var(--cmms-bg-wash, #F8FAFC)",
        ...style,
      }}
    >
      {[
        { value: "th", label: "ไทย" },
        { value: "en", label: "EN" },
      ].map((opt) => {
        const active = lang === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => setUserLang(opt.value as "th" | "en")}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              background: active ? "var(--cmms-primary, #0057A8)" : "transparent",
              color: active ? "#fff" : "var(--cmms-text-secondary, #475569)",
              transition: "all 150ms ease",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
