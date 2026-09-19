"use client";

/**
 * QrScanner — ตัวสแกน QR/บาร์โค้ดในแอป (Phase 24)
 *
 * - ใช้ @zxing/browser (bundled — CSP `script-src 'self'` ไม่โหลด CDN)
 * - เปิดกล้องหลังอัตโนมัติ (facingMode=environment) + สลับไฟฉายถ้าอุปกรณ์รองรับ
 * - ต้องเป็น secure context (HTTPS หรือ localhost) — ถ้าไม่ใช่จะแจ้งและให้กรอกรหัสแทน
 * - payload ที่ถอดได้เป็น input ที่ไม่น่าเชื่อถือ → ต้อง resolve ผ่าน API ที่ตรวจสิทธิ์เสมอ
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, CameraOff, Zap, Keyboard, RefreshCw } from "lucide-react";

interface ScannerControls {
  stop: () => void;
  switchTorch?: (onOff: boolean) => Promise<void>;
}

export interface QrScannerProps {
  onResult: (text: string, format?: string) => void;
  onClose: () => void;
  title?: string;
  hint?: string;
}

export function QrScanner({ onResult, onClose, title = "สแกน QR / บาร์โค้ด", hint }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const doneRef = useRef(false);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torch, setTorch] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      /* ignore */
    }
    controlsRef.current = null;
  }, []);

  const start = useCallback(async () => {
    doneRef.current = false;
    setError(null);
    setStatus("starting");
    if (typeof window === "undefined") return;
    if (!window.isSecureContext) {
      setStatus("error");
      setError("กล้องใช้ได้เฉพาะผ่าน HTTPS หรือ localhost — กรุณากรอกรหัสด้านล่างแทน");
      setManualOpen(true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("อุปกรณ์/เบราว์เซอร์นี้ไม่รองรับการเปิดกล้อง");
      setManualOpen(true);
      return;
    }
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current ?? undefined,
        (result) => {
          if (result && !doneRef.current) {
            doneRef.current = true;
            const text = result.getText();
            let format = "";
            try {
              format = String(result.getBarcodeFormat());
            } catch {
              /* ignore */
            }
            stop();
            onResult(text, format);
          }
        }
      );
      controlsRef.current = controls as unknown as ScannerControls;
      setStatus("scanning");
      if (typeof controls.switchTorch === "function") {
        setHasTorch(true);
      }
    } catch (e) {
      const name = (e as { name?: string })?.name ?? "";
      let msg = "เปิดกล้องไม่สำเร็จ กรุณาลองใหม่";
      if (name === "NotAllowedError" || name === "SecurityError") {
        msg = "ไม่ได้รับอนุญาตให้ใช้กล้อง — กรุณาอนุญาตในตั้งค่าเบราว์เซอร์แล้วลองใหม่";
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        msg = "ไม่พบกล้องที่ใช้งานได้บนอุปกรณ์นี้";
      } else if (name === "NotReadableError") {
        msg = "กล้องถูกใช้งานโดยแอปอื่นอยู่ กรุณาปิดแอปนั้นแล้วลองใหม่";
      }
      setError(msg);
      setStatus("error");
      setManualOpen(true);
    }
  }, [onResult, stop]);

  useEffect(() => {
    void start();
    return () => stop();
  }, [start, stop]);

  const toggleTorch = async () => {
    const fn = controlsRef.current?.switchTorch;
    if (!fn) return;
    try {
      await fn(!torch);
      setTorch((t) => !t);
    } catch {
      setHasTorch(false);
    }
  };

  const submitManual = () => {
    const value = manual.trim();
    if (!value) return;
    doneRef.current = true;
    stop();
    onResult(value, "MANUAL");
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <p className="text-base font-semibold">{title}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดกล้อง"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
          aria-label="ภาพจากกล้องสำหรับสแกน"
        />

        {status === "scanning" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-56 w-56 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
        )}

        {status === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <RefreshCw className="animate-spin" size={28} aria-hidden="true" />
            <p className="text-sm">กำลังเปิดกล้อง…</p>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
            <CameraOff size={34} aria-hidden="true" />
            <p className="text-sm leading-relaxed">{error}</p>
            <Button variant="outline" onClick={() => void start()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              ลองเปิดกล้องใหม่
            </Button>
          </div>
        )}
      </div>

      {hint && <p className="px-4 pb-2 text-center text-xs text-white/70">{hint}</p>}

      <div className="flex items-center justify-center gap-3 px-4 pb-6 pt-2">
        {hasTorch && (
          <button
            type="button"
            onClick={() => void toggleTorch()}
            aria-pressed={torch}
            aria-label="เปิด/ปิดไฟฉาย"
            className={`flex h-12 items-center gap-2 rounded-full px-4 ${torch ? "bg-amber-400 text-black" : "bg-white/10"}`}
          >
            <Zap size={18} aria-hidden="true" />
            <span className="text-sm">ไฟฉาย</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          aria-expanded={manualOpen}
          className="flex h-12 items-center gap-2 rounded-full bg-white/10 px-4 active:bg-white/20"
        >
          <Keyboard size={18} aria-hidden="true" />
          <span className="text-sm">กรอกรหัสเอง</span>
        </button>
      </div>

      {manualOpen && (
        <div className="border-t border-white/15 bg-black/80 px-4 py-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitManual();
            }}
          >
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="เช่น MCH-001 หรือ CMMS-A-XXXX"
              autoFocus
              className="h-12 flex-1 min-w-0 rounded-lg border border-white/20 bg-white/10 px-3 text-base text-white outline-none placeholder:text-white/40 focus:border-white/50"
              aria-label="กรอกรหัสด้วยตนเอง"
            />
            <Button type="submit" className="h-12">
              ค้นหา
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
