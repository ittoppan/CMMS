"use client";

import { useEffect, useState } from "react";

export type ImageSize = { w: number; h: number };

// cache ระดับโมดูล: เปิดหน้าเดิมซ้ำ/สลับห้องแล้วได้ขนาดทันทีโดยไม่ต้องรอโหลดรูป
const cache = new Map<string, ImageSize>();

function readStored(storedW?: number, storedH?: number): ImageSize | null {
  return storedW && storedH ? { w: storedW, h: storedH } : null;
}

/**
 * useImageSize — คืนขนาดจริงของรูป (naturalWidth/Height) เพื่อใส่ width/height
 * ป้องกัน CLS โดยไม่ต้องเพิ่ม field ใน API/DB
 *
 * ลำดับ: ค่าที่บันทึกไว้ใน config -> cache ของ URL -> preload ด้วย new Image()
 * (ไม่มีการเรียก API; รูปเดียวกันถูก browser cache อยู่แล้ว)
 */
export function useImageSize(url?: string, storedW?: number, storedH?: number): ImageSize | null {
  const stored = readStored(storedW, storedH);
  const [size, setSize] = useState<ImageSize | null>(stored ?? (url ? cache.get(url) ?? null : null));

  useEffect(() => {
    if (!url) {
      setSize(null);
      return;
    }
    const known = readStored(storedW, storedH) ?? cache.get(url);
    if (known) {
      setSize(known);
      return;
    }
    let alive = true;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (!alive || !img.naturalWidth || !img.naturalHeight) return;
      const next = { w: img.naturalWidth, h: img.naturalHeight };
      cache.set(url, next);
      setSize(next);
    };
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url, storedW, storedH]);

  return size;
}
