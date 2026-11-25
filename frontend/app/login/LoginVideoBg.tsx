"use client";

import { useEffect, useRef, useState } from "react";

/**
 * LoginVideoBg — พื้นหลังวิดีโอวนลูปของหน้า /login
 *
 * เลือกไฟล์ตามอุปกรณ์ (ไม่โหลดเกินจำเป็น):
 *   - จอกว้าง/เน็ตปกติ → ไฟล์หลัก 1080p (~3.2 MB)
 *   - จอ ≤820px, saveData เปิด, หรือเน็ต 2G → ไฟล์เบา 540p (~1 MB)
 * เลือกใน effect แล้วตั้ง video.src เอง (ไม่ใส่ src ใน JSX) เพื่อไม่ให้ SSR/CSR ไม่ตรงกัน
 * และให้ poster แสดงทันทีระหว่างรอไฟล์
 *
 * ทำไมตั้งค่าแบบ imperative: บราวเซอร์บล็อก autoplay ถ้า element ไม่ได้ถูก mark ว่า muted
 * จริง ๆ (React บางจังหวะตั้งแค่ property แต่ attribute ไม่ติดตอน hydration) ทำให้วิดีโอค้างที่
 * เฟรมแรกและดูเหมือน "ภาพนิ่ง" — จึงเซ็ต muted/playsInline แล้วเรียก play() เอง
 * ถ้ายังถูกบล็อก (นโยบาย autoplay เข้ม) จะลองอีกครั้งเมื่อผู้ใช้มี interaction แรก
 *
 * ถ้าวิดีโอโหลด/เล่นไม่ได้จริง ๆ → แจ้งหน้าพ่อด้วย onUnavailable เพื่อสลับไปฉาก three.js
 * (และ gradient/glow CSS ถ้า WebGL ใช้ไม่ได้อีก)
 */
export default function LoginVideoBg({
  src,
  mobileSrc,
  poster,
  onUnavailable,
}: {
  src: string;
  mobileSrc: string;
  poster: string;
  onUnavailable?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    // จอเล็ก/ประหยัดดาต้า/เน็ตช้า → ไฟล์เบา ไม่ต้องโหลด 1080p ให้เปลือง
    const smallScreen = window.matchMedia("(max-width: 820px)").matches;
    const conn = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    const saveData = conn?.saveData === true;
    const slowNet = /(^|-)2g$/.test(conn?.effectiveType ?? "");
    video.src = smallScreen || saveData || slowNet ? mobileSrc : src;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    let stopped = false;
    const tryPlay = () => {
      if (stopped) return;
      const attempt = video.play();
      if (attempt && typeof attempt.catch === "function") {
        attempt.catch(() => {
          /* ถูกบล็อก — จะลองใหม่ตอนผู้ใช้มี interaction */
        });
      }
    };

    tryPlay();

    const onFirstInteraction = () => {
      tryPlay();
      if (!video.paused) detach();
    };
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    const detach = () => {
      events.forEach((e) => window.removeEventListener(e, onFirstInteraction));
    };
    events.forEach((e) => window.addEventListener(e, onFirstInteraction, { passive: true }));

    // แท็บกลับมาแสดงผล: ถ้าหยุดอยู่ให้เล่นต่อ
    const onVisible = () => {
      if (!document.hidden && video.paused) tryPlay();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      detach();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [src, mobileSrc]);

  if (failed) {
    return <img className="cmms-login-video" src={poster} alt="" width={1920} height={1080} />;
  }

  return (
    <video
      ref={ref}
      className="cmms-login-video"
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      onError={() => {
        setFailed(true);
        onUnavailable?.();
      }}
    />
  );
}
