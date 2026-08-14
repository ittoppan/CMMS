"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

interface PanelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * ปุ่มเลื่อนเมนูขึ้น-ลงเร็ว + ตัวชี้ตำแหน่งเมนูปัจจุบัน (scroll indicator)
 * - แถบ progress บาง ๆ ริมขวา sidebar แสดงตำแหน่ง scroll + จุดตัวชี้เมนูปัจจุบัน
 * - ปุ่ม ▲▼ เลื่อนเมนูเร็ว (ครั้งละ ~75% ของความสูงจอเมนู)
 * - เมื่อเมนูปัจจุบันเลื่อนหลุดจอ → แสดงชิป "📍 ชื่อเมนู" กดแล้วกลับไปตำแหน่งนั้น
 * ซ่อนทั้งหมดเมื่อ: จอเล็ก (<1024px), sidebar ยุบ, หรือเมนูไม่ยาวพอจะเลื่อน
 */
export default function SideNavScrollControls({ pathname }: { pathname: string }) {
  const [rect, setRect] = useState<PanelRect | null>(null);
  const [progress, setProgress] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);
  const [active, setActive] = useState<{ label: string; relPos: number; visible: boolean }>({
    label: "",
    relPos: 0,
    visible: true,
  });

  const update = useCallback(() => {
    const panel = document.querySelector<HTMLElement>(".astryx-layout-panel");
    // ซ่อนเมื่อ sidebar กลายเป็น drawer ของมือถือ (<768px — astryx breakpoint 'md')
    // + เมื่อ sidebar ยุบ (collapsed)
    if (!panel || window.innerWidth < 768) {
      setRect(null);
      return;
    }
    const r = panel.getBoundingClientRect();
    if (r.width < 130) {
      setRect(null);
      return;
    }
    const max = Math.max(0, panel.scrollHeight - panel.clientHeight);
    setMaxScroll(max);
    setProgress(max > 0 ? Math.min(1, Math.max(0, panel.scrollTop / max)) : 0);
    setRect({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });

    const sel = `a[aria-current="page"], a[href="${CSS.escape(pathname)}"]`;
    const link = panel.querySelector<HTMLAnchorElement>(sel);
    if (link) {
      const lr = link.getBoundingClientRect();
      const label = (link.textContent || "").trim();
      const relPos = Math.min(1, Math.max(0, (lr.top + lr.height / 2 - r.top) / r.height));
      const visible = lr.top >= r.top + 2 && lr.bottom <= r.bottom - 2;
      setActive({ label, relPos, visible });
    } else {
      setActive({ label: "", relPos: 0, visible: true });
    }
  }, [pathname]);

  useEffect(() => {
    const t1 = setTimeout(update, 120); // รอ layout render รอบแรก
    const panel = document.querySelector<HTMLElement>(".astryx-layout-panel");
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    panel?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const ro = panel ? new ResizeObserver(update) : null;
    if (panel && ro) ro.observe(panel);
    const iv = setInterval(update, 2500); // safety: เมนูโหลดหลังสุด (permission async)

    // เลื่อนไปเมนูปัจจุบันอัตโนมัติ 1 ครั้งตอนเปิดหน้า
    // (เฉพาะเมนูยาวพอจะเลื่อน + เมนูปัจจุบันหลุดจอ — เช่น กดลิงก์จากหน้าแรกมาหน้าลึก)
    const t2 = setTimeout(() => {
      const p = document.querySelector<HTMLElement>(".astryx-layout-panel");
      if (!p || p.scrollHeight <= p.clientHeight) return;
      const link = p.querySelector<HTMLAnchorElement>(
        `a[aria-current="page"], a[href="${CSS.escape(pathname)}"]`
      );
      if (!link) return;
      const r = p.getBoundingClientRect();
      const lr = link.getBoundingClientRect();
      const visible = lr.top >= r.top && lr.bottom <= r.bottom;
      if (!visible) {
        const target = Math.max(0, link.offsetTop - p.clientHeight / 2 + link.offsetHeight / 2);
        p.scrollTo({ top: target, behavior: "smooth" });
      }
    }, 600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(iv);
      cancelAnimationFrame(raf);
      panel?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro?.disconnect();
    };
  }, [update, pathname]);

  const scrollByStep = (dir: 1 | -1) => {
    const panel = document.querySelector<HTMLElement>(".astryx-layout-panel");
    if (!panel) return;
    panel.scrollBy({ top: dir * Math.round(panel.clientHeight * 0.75), behavior: "smooth" });
  };

  const scrollToActive = () => {
    const panel = document.querySelector<HTMLElement>(".astryx-layout-panel");
    const link = panel?.querySelector<HTMLAnchorElement>(`a[aria-current="page"], a[href="${CSS.escape(pathname)}"]`);
    if (!panel || !link) return;
    const target = Math.max(0, link.offsetTop - panel.clientHeight / 2 + link.offsetHeight / 2);
    panel.scrollTo({ top: target, behavior: "smooth" });
  };

  if (!rect || maxScroll <= 0) return null;

  const trackX = rect.right - 16;
  const trackTop = rect.top + 12;
  const trackH = Math.max(0, rect.height - 24);
  const dotY = active.relPos * trackH - 5;

  return (
    <>
      {/* แถบตัวชี้ตำแหน่ง: progress เติมบน + จุดตำแหน่งเมนูปัจจุบัน */}
      <div
        style={{
          position: "fixed",
          left: trackX,
          top: trackTop,
          width: 4,
          height: trackH,
          background: "rgba(15,23,42,0.10)",
          borderRadius: 4,
          zIndex: 40,
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 4,
            height: Math.max(16, progress * trackH),
            background: "var(--cmms-primary, #0D4785)",
            borderRadius: 4,
          }}
        />
        {active.label && (
          <div
            style={{
              position: "absolute",
              left: -3,
              top: dotY,
              width: 10,
              height: 10,
              borderRadius: 999,
              background: active.visible ? "var(--cmms-primary, #0D4785)" : "#F59E0B",
              border: "2px solid #FFFFFF",
              boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
              transition: "top 120ms ease",
            }}
          />
        )}
      </div>

      {/* ปุ่มเลื่อนเมนูขึ้น-ลงเร็ว */}
      <div style={{ position: "fixed", left: rect.left + 10, bottom: rect.bottom - 56, display: "flex", gap: 6, zIndex: 40 }}>
        <button
          type="button"
          aria-label="เลื่อนเมนูขึ้น"
          title="เลื่อนเมนูขึ้น"
          onClick={() => scrollByStep(-1)}
          disabled={progress <= 0}
          style={{
            width: 30,
            height: 30,
            borderRadius: 999,
            border: "1px solid var(--cmms-border, #CBD5E1)",
            background: "rgba(255,255,255,0.95)",
            color: "var(--cmms-text-primary, #0F172A)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
            opacity: progress <= 0 ? 0.4 : 1,
          }}
        >
          <ChevronUpIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="เลื่อนเมนูลง"
          title="เลื่อนเมนูลง"
          onClick={() => scrollByStep(1)}
          disabled={progress >= 1}
          style={{
            width: 30,
            height: 30,
            borderRadius: 999,
            border: "1px solid var(--cmms-border, #CBD5E1)",
            background: "rgba(255,255,255,0.95)",
            color: "var(--cmms-text-primary, #0F172A)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
            opacity: progress >= 1 ? 0.4 : 1,
          }}
        >
          <ChevronDownIcon className="w-4 h-4" />
        </button>
      </div>

      {/* ชิปกลับไปเมนูปัจจุบัน — โชว์เมื่อเมนูปัจจุบันเลื่อนหลุดจอ */}
      {!active.visible && active.label && (
        <button
          type="button"
          onClick={scrollToActive}
          title={`กลับไปเมนู "${active.label}"`}
          aria-label={`กลับไปเมนู ${active.label}`}
          style={{
            position: "fixed",
            left: rect.left + 8,
            right: rect.right - 64,
            bottom: rect.bottom - 16,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "7px 12px",
            borderRadius: 999,
            border: "1px solid var(--cmms-primary, #0D4785)",
            background: "var(--cmms-primary, #0D4785)",
            color: "#FFFFFF",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(13,71,133,0.35)",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 12 }}>📍</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>{active.label}</span>
        </button>
      )}
    </>
  );
}
