"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  /** ค่าเป้าหมายที่ต้องการนับถึง */
  end: number;
  /** ระยะเวลานับ (ms) default 900 */
  duration?: number;
  /** ดีเลย์ก่อนเริ่มนับ (ms) default 0 */
  delay?: number;
  /** ฟอร์แมตตัวเลข (default: ไทย comma เช่น 1,234) */
  format?: (n: number) => string;
  /** จัดรูปแบบตัวเลขให้ตรงกับช่วงเวลา */
  className?: string;
  /** ติดกันกับ child? default true */
  inline?: boolean;
  children?: React.ReactNode;
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("th-TH");
}

/**
 * ตัวเลขนับจาก 0 -> end เมื่อ element เข้าจอ (IntersectionObserver)
 * เคารพ prefers-reduced-motion: ถ้าผู้ใช้ปิด animation จะแสดงค่าสุดท้ายทันที
 */
export default function CountUp({
  end,
  duration = 900,
  delay = 0,
  format = formatNumber,
  className,
  inline = true,
  children,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const startedRef = useRef(false);
  const [display, setDisplay] = useState(() => (end === 0 ? "0" : format(0)));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // ใช้ค่าสุดท้ายทันทีถ้าผู้ใช้ปิด animation หรือค่าเป็น 0
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || end === 0) {
      setDisplay(format(end));
      return;
    }

    let raf = 0;
    let timer = 0;

    const run = () => {
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min((now - t0) / duration, 1);
        // easeOutCubic — ช้าลงอย่างนุ่มนวลช่วงท้าย
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(format(end * eased));
        if (p < 1) raf = requestAnimationFrame(step);
        else setDisplay(format(end));
      };
      raf = requestAnimationFrame(step);
    };

    // เริ่มนับเมื่อ element เข้า viewport (ครั้งเดียว)
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          timer = window.setTimeout(run, delay);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [end, duration, delay, format]);

  return (
    <span ref={ref} className={className} style={inline ? { display: "inline" } : undefined}>
      {display}
      {children}
    </span>
  );
}
