"use client";

/**
 * connectivity.tsx — connectivity provider (Phase 19)
 *
 * สถานะเครือข่าย (NetState):
 *   ONLINE        — navigator.onLine + HTTP probe ผ่าน
 *   RECONNECTING  — offline kick-in แล้ว รอ probe กลับ
 *   OFFLINE       — offline ยืนยัน (HTTP probe ล้มเหลว 2 ครั้งติด)
 *   (ENGINE ปิดบางส่วน: SYNCING / SYNC_ERROR มาจาก engine.emit)
 *
 * - probe: GET /api/v1/csrf.php (no-store) ทุก ~10s เมื่อคิดว่าออนไลน์ เพื่อจับ
 *   สถานะ "แป๊บเดียวจริง ๆ" (offline ที่ SW ไม่จับ)
 * - เมื่อกลับมาออนไลน์ → เรียก syncEngine.sync() (sends ที่สั่งค้างไว้)
 * - navigator.onLine ยังเป็นตัวตั้งต้นเสมอ (เร็ว ไม่ต้องรอ probe)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { syncEngine } from "./engine";
import type { SyncRunResult, SyncStats } from "./types";

export type NetState = "ONLINE" | "OFFLINE" | "RECONNECTING";

interface ConnectivityValue {
  net: NetState;
  /** navigator.onLine ปัจจุบัน (สำหรับเช็คคร่าว ๆ) */
  navigatorOnline: boolean;
  /** กำลัง sync อยู่หรือไม่ */
  syncing: boolean;
  /** มี error ล่าสุดไหม (sync ล่าสุดไม่สำเร็จบางรายการ) */
  hasSyncError: boolean;
  stats: SyncStats;
  /** สั่ง sync ทันที (Sync Center / ปุ่ม Refresh) */
  syncNow: () => Promise<SyncRunResult>;
}

const ConnectivityContext = createContext<ConnectivityValue | null>(null);

/** กลับ ONLINE → จัดการ sync หลัง probe ผ่าน 2 ครั้งติดกัน */
const PROBE_INTERVAL_MS = 10_000;
const PROBE_TIMEOUT_MS = 6_000;

function useConnectivityImpl(): ConnectivityValue {
  const [net, setNet] = useState<NetState>(() => (typeof navigator !== "undefined" && navigator.onLine) ? "ONLINE" : "OFFLINE");
  const [navigatorOnline, setNavigatorOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  const [syncing, setSyncing] = useState(false);
  const [stats, setStats] = useState<SyncStats>({
    pending: 0,
    failed: 0,
    conflict: 0,
    succeededToday: 0,
    lastRunAt: null,
    lastRun: null,
  });
  const [hasSyncError, setHasSyncError] = useState(false);

  const netRef = useRef<NetState>(net);
  netRef.current = net;
  const probeFailsRef = useRef(0);

  const applyNet = useCallback((next: NetState) => {
    setNet((cur) => {
      if (cur !== next) {
        // ขึ้น ONLINE เมื่อกลับมา → สั่ง sync
        if (next === "ONLINE" && (cur === "OFFLINE" || cur === "RECONNECTING")) {
          void syncEngine.sync();
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setNavigatorOnline(true);
      probeFailsRef.current = 0;
      applyNet("ONLINE");
      void syncEngine.onOnline();
    };
    const onOffline = () => {
      setNavigatorOnline(false);
      probeFailsRef.current = 0;
      applyNet("OFFLINE");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // ตัวรับ event จาก engine
    const bind = () => {
      syncEngine.onEmit((key, payload) => {
        if (key === "cmms:sync-changed") {
          try {
            const s = syncEngine.stats();
            setStats({ ...s });
            setHasSyncError(s.failed > 0 || s.conflict > 0);
            window.dispatchEvent(new Event("cmms:offline-queued"));
          } catch {
            /* ignore */
          }
        } else if (key === "cmms:synced") {
          const r = payload as SyncRunResult | undefined;
          setSyncing(false);
          if (r && r.failed === 0 && r.conflicts === 0 && r.retryable === 0) {
            // ปิด error state เมื่อรอบล่าสุดไม่มีปัญหา (จะรีเปิดถ้ามี item ใหม่)
            setHasSyncError(syncEngine.stats().failed > 0 || syncEngine.stats().conflict > 0);
          }
        }
      });
      void syncEngine.ensureLoaded().then(() => {
        setStats(syncEngine.stats());
      });
    };
    bind();

    // probe เป็นระยะเมื่อคิดว่าออนไลน์ (จับ "offline เงียบ")
    const timer = window.setInterval(() => {
      if (!navigator.onLine) return;
      // เช็คเฉพาะตอน net=ONLINE (RECONNECTING จะถูกจัดการโดย probe นี้)
      const stamp = Date.now();
      void fetch("/api/v1/csrf.php", {
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout ? AbortSignal.timeout(PROBE_TIMEOUT_MS) : undefined,
      })
        .then((r) => {
          if (r.ok || r.status === 401 || r.status === 403) {
            // server ตอบสนอง ถ้ารออยู่นานกว่า 2s ถือว่าเชื่อมต่อแล้ว
            probeFailsRef.current = 0;
            if (Date.now() - stamp < PROBE_INTERVAL_MS || netRef.current === "RECONNECTING") {
              if (netRef.current !== "ONLINE") applyNet("ONLINE");
              void syncEngine.onOnline();
            }
          } else {
            throw new Error(`probe ${r.status}`);
          }
        })
        .catch(() => {
          probeFailsRef.current += 1;
          if (probeFailsRef.current >= 2) {
            applyNet("OFFLINE");
          } else {
            applyNet("RECONNECTING");
          }
        });
    }, PROBE_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(timer);
    };
  }, [applyNet]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      return await syncEngine.sync();
    } finally {
      setSyncing(false);
      setStats(syncEngine.stats());
    }
  }, []);

  // ติดตาม syncing จากการเปลี่ยนแปลง (mirror ดูแลใน engine emit handler ข้างบน)
  return useMemo(
    () => ({
      net,
      navigatorOnline,
      syncing,
      hasSyncError,
      stats,
      syncNow,
    }),
    [net, navigatorOnline, syncing, hasSyncError, stats, syncNow]
  );
}

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const value = useConnectivityImpl();
  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): ConnectivityValue {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) throw new Error("useConnectivity ต้องใช้ภายใต้ <ConnectivityProvider>");
  return ctx;
}

/** hook ย่อ สำหรับ badge จำนวนค้างส่ง */
export function usePendingQueueCount(): number {
  const { stats } = useConnectivity();
  return stats.pending;
}