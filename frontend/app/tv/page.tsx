"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, Pause, Play, Monitor } from "lucide-react";

const DEFAULT_PAGES = ["/dashboard", "/dashboard/my"];
const DEFAULT_INTERVAL_SEC = 30;
const MIN_INTERVAL_SEC = 5;

function withKioskParams(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const [base, qs] = clean.split("?");
  const sp = new URLSearchParams(qs || "");
  sp.set("kiosk", "1");
  sp.set("tv", "0");
  sp.set("autorotate", "0");
  sp.set("display", "tv");
  return `${base}?${sp.toString()}`;
}

function normalizePath(p: string): string {
  const v = (p || "").trim();
  if (!v) return "";
  return v.startsWith("/") ? v : `/${v}`;
}

export default function TvRotatePage() {
  const [pages, setPages] = useState<string[]>(DEFAULT_PAGES);
  const [intervalSec, setIntervalSec] = useState(DEFAULT_INTERVAL_SEC);
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_INTERVAL_SEC);
  const [paused, setPaused] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [showHud, setShowHud] = useState(true);
  const timerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const hideHudRef = useRef<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawPages = (params.get("pages") || "")
      .split(",")
      .map(normalizePath)
      .filter(Boolean);
    const list = Array.from(new Set(rawPages.length ? rawPages : DEFAULT_PAGES));
    const sec = Math.max(
      MIN_INTERVAL_SEC,
      Number(params.get("interval") || params.get("every") || params.get("sec")) || DEFAULT_INTERVAL_SEC
    );
    setPages(list.length >= 1 ? list : DEFAULT_PAGES);
    setIntervalSec(sec);
    setSecondsLeft(sec);
    setIndex(0);
  }, []);

  const active = useMemo(() => pages.map(withKioskParams), [pages]);

  const next = useCallback(() => {
    setIndex((i) => (pages.length ? (i + 1) % pages.length : 0));
    setSecondsLeft(intervalSec);
  }, [pages.length, intervalSec]);

  useEffect(() => {
    if (paused || pages.length < 2) return;
    tickRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) return 0;
        return s - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [paused, pages.length, index, intervalSec]);

  useEffect(() => {
    if (paused || pages.length < 2) return;
    if (secondsLeft === 0) {
      next();
    }
  }, [secondsLeft, paused, pages.length, next]);

  useEffect(() => {
    const onFs = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFull = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* เบราว์เซอร์ไม่อนุญาต fullscreen */
    }
  }, []);

  const pokeHud = useCallback(() => {
    setShowHud(true);
    if (hideHudRef.current) window.clearTimeout(hideHudRef.current);
    hideHudRef.current = window.setTimeout(() => setShowHud(false), 4000);
  }, []);

  useEffect(() => {
    pokeHud();
    return () => {
      if (hideHudRef.current) window.clearTimeout(hideHudRef.current);
    };
  }, [pokeHud]);

  const currentLabel = pages[index] || "";

  return (
    <div
      className="fixed inset-0 bg-black text-white"
      onMouseMove={pokeHud}
      onClick={pokeHud}
      onKeyDown={pokeHud}
      role="application"
      aria-label="TV Dashboard Rotation"
    >
      {active.map((src, i) => (
        <iframe
          key={src}
          src={src}
          title={pages[i] || `page-${i}`}
          className="absolute inset-0 h-full w-full border-0 bg-white"
          style={{ display: i === index ? "block" : "none" }}
        />
      ))}

      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3 transition-opacity duration-300 ${showHud ? "opacity-100" : "opacity-0"}`}
      >
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-black/55 px-3 py-2 text-xs backdrop-blur">
          <Monitor className="h-4 w-4" aria-hidden="true" />
          <span className="flex flex-col leading-tight">
            <span className="cmms-eyebrow" data-on-dark="true">จอแสดงผลรวม</span>
            <span className="font-semibold">TV Display</span>
          </span>
          <span className="text-white/80">สลับอัตโนมัติ {pages.length} หน้า</span>
          <span className="rounded bg-white/15 px-2 py-0.5 font-mono">{currentLabel}</span>
          {pages.length > 1 && (
            <span className="text-white/80">
              {paused ? "หยุดชั่วคราว" : `ถัดไปใน ${secondsLeft}s`} · ทุก {intervalSec}s
            </span>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-1.5">
          {pages.length > 1 && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-black/55 px-3 text-xs font-medium backdrop-blur hover:bg-black/70"
              aria-label={paused ? "เล่นต่อ" : "หยุดชั่วคราว"}
              title={paused ? "เล่นต่อ" : "หยุดชั่วคราว"}
            >
              {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
              {paused ? "เล่นต่อ" : "หยุด"}
            </button>
          )}
          <button
            type="button"
            onClick={toggleFull}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-black/55 px-3 text-xs font-medium backdrop-blur hover:bg-black/70"
            aria-label={isFull ? "ออกจากเต็มจอ" : "เต็มจอ"}
            title={isFull ? "ออกจากเต็มจอ" : "เต็มจอ"}
          >
            {isFull ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
            {isFull ? "ย่อ" : "เต็มจอ"}
          </button>
        </div>
      </div>

      {pages.length < 1 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
          ไม่พบหน้าสำหรับแสดงผล
        </div>
      )}
    </div>
  );
}
