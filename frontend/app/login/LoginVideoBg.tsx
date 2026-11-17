"use client";

import { useEffect, useRef, useState } from "react";

/**
 * LoginVideoBg — พื้นหลังวิดีโอวนลูปของหน้า /login
 *
 * ทำไมต้องตั้งค่าแบบ imperative: บราวเซอร์บล็อก autoplay ถ้า element ไม่ได้ถูก mark ว่า muted
 * จริง ๆ (React บางจังหวะตั้งแค่ property แต่ attribute ไม่ติดตอน hydration) ทำให้วิดีโอค้างที่
 * เฟรมแรกและดูเหมือน "ภาพนิ่ง" — จึงเซ็ต muted/playsInline แล้วเรียก play() เอง
 * และถ้ายังถูกบล็อก (นโยบาย autoplay เข้ม) จะลองอีกครั้งเมื่อผู้ใช้มี interaction แรก
 *
 * ถ้าวิดีโอโหลด/เล่นไม่ได้จริง ๆ จะถอยไปใช้ภาพนิ่ง (poster) เพื่อไม่ให้พื้นหลังเป็นจอเปล่า
 */
export default function LoginVideoBg({
  src,
  poster,
  onUnavailable,
}: {
  src: string;
  poster: string;
  /** แจ้งให้หน้าพ่อสลับไปชั้นถัดไป (three.js → CSS gradient) ถ้าวิดีโอเล่นไม่ได้ */
  onUnavailable?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

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
  }, []);

  if (failed) {
    return <img className="cmms-login-video" src={poster} alt="" />;
  }

  return (
    <video
      ref={ref}
      className="cmms-login-video"
      src={src}
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
