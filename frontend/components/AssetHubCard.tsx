"use client";

/**
 * AssetHubCard — "หน้าเครื่องจักร" ที่เปิดจาก QR บนตัวเครื่อง
 *
 * QR = https://liff.line.me/<LIFF_ID>?asset_code=A-BM06
 *   → LINE เปิด /repair/request?asset_code=A-BM06 (LIFF endpoint เดิม)
 *   → การ์ดนี้อ่าน asset_code จาก URL แล้วแสดง
 *       1) แจ้งซ่อม (ฟอร์มด้านล่าง — เลือกเครื่องให้แล้ว)
 *       2) PM ของเครื่องนี้ (ถึงกำหนด/ค้าง)
 *       3) ประวัติการซ่อม (ซ่อมอะไรมาบ้าง ใครซ่อม เมื่อไร)
 *
 * ข้อมูลมาจาก /api/v1/asset_hub.php ซึ่งตรวจ LIFF ID token ฝั่งเซิร์ฟเวอร์แล้ว
 * จึงรู้ว่าเป็น LINE user คนไหน — ไม่ได้เชื่อ userId ที่ client ส่งมา
 * token/สถานะ LIFF รับจาก LiffBridge ผ่าน useLiffSession() (event) ไม่ต้องรอ/วนอ่าน localStorage
 * ยังไม่ผูกบัญชีจะเห็นแค่ชื่อเครื่อง + คำแนะนำให้แอดมินเพิ่มผู้ใช้
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, Wrench, CalendarClock, Loader2, ShieldAlert, ChevronDown } from "lucide-react";
import { useLiffSession } from "@/lib/liff-session";

type HubAsset = {
  code: string;
  name: string;
  category?: string | null;
  location?: string | null;
  department?: string | null;
  criticality?: string | null;
  status?: string | null;
};

type HubPm = {
  id: number;
  title: string;
  due_date: string | null;
  status: string | null;
  frequency_type: string | null;
  assigned_name?: string | null;
};

type HubWorkOrder = {
  work_order_no: string;
  title: string;
  status: string | null;
  created_at: string | null;
};

type HubHistory = {
  work_order_no: string;
  title: string;
  status: string | null;
  created_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  downtime_minutes: number | string | null;
  resolution: string | null;
  root_cause: string | null;
  technician: string | null;
};

type HubResponse = {
  success?: boolean;
  registered?: boolean;
  staff?: boolean;
  error?: string;
  asset?: HubAsset;
  pm?: { open: HubPm[]; next_due: string | null; last_done_at: string | null };
  active_work_orders?: HubWorkOrder[];
  history?: HubHistory[];
  counts?: { pm_open: number; active_work_orders: number; repairs_total: number; repairs_done: number };
};

type Tab = "repair" | "pm" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "repair", label: "แจ้งซ่อม" },
  { id: "pm", label: "PM" },
  { id: "history", label: "ประวัติ" },
];

function assetCodeFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get("asset_code") || params.get("code") || "").trim();
  } catch {
    return "";
  }
}

function tabFromUrl(): Tab {
  try {
    const v = (new URLSearchParams(window.location.search).get("view") || "").toLowerCase();
    if (v === "pm") return "pm";
    if (v === "history" || v === "repairs") return "history";
  } catch {
    /* ignore */
  }
  return "repair";
}

function thaiDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

/** id ของฟอร์มแจ้งซ่อมด้านล่างการ์ด (ปุ่ม "แจ้งซ่อมเครื่องนี้" เลื่อนไปที่นั่น) */
const FORM_ANCHOR_ID = "repair-request-form";

export default function AssetHubCard() {
  const [assetCode, setAssetCode] = useState("");
  const [tab, setTab] = useState<Tab>("repair");
  const [data, setData] = useState<HubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const mounted = useRef(true);
  const liff = useLiffSession();
  // LiffBridge ประกาศสถานะเมื่อ init จบ (ready = อยู่ใน LINE, external = เปิดนอก LINE, error = init ไม่ผ่าน)
  const liffResolved = liff.status !== "idle";

  const load = useCallback(async (code: string, idToken: string) => {
    setLoading(true);
    setError(null);
    try {
      // LIFF ID token = หลักฐานตัวตนที่เซิร์ฟเวอร์ตรวจกับ LINE (ได้จาก LiffBridge โดยตรง)
      const qs = new URLSearchParams({ code });
      const res = await fetch(`/api/v1/asset_hub.php?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
        headers: idToken ? { "X-LIFF-Id-Token": idToken } : undefined,
      });
      const json = (await res.json()) as HubResponse;
      if (!res.ok || json.success === false) {
        throw new Error(json.error || "โหลดข้อมูลเครื่องจักรไม่สำเร็จ");
      }
      if (!mounted.current) return;
      setData(json);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : "โหลดข้อมูลเครื่องจักรไม่สำเร็จ");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const code = assetCodeFromUrl();
    setAssetCode(code);
    setTab(tabFromUrl());
    if (!code) {
      setLoading(false);
      return;
    }
    // รอผล init จาก LiffBridge (event ผ่าน useLiffSession) — ไม่มี timer/วนอ่าน localStorage
    if (!liffResolved) return;
    void load(code, liff.idToken);
    return () => {
      mounted.current = false;
    };
  }, [load, liffResolved, liff.idToken]);

  const jumpToForm = () => {
    const el = document.getElementById(FORM_ANCHOR_ID);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const counts = data?.counts;
  const pmOpen = data?.pm?.open ?? [];
  const active = data?.active_work_orders ?? [];
  const history = data?.history ?? [];

  const badge = useMemo(() => {
    if (loading) return { text: "กำลังโหลด", tone: "muted" as const };
    if (error) return { text: "โหลดไม่สำเร็จ", tone: "warn" as const };
    if (!data?.registered) return { text: "ยังไม่ผูกบัญชี", tone: "warn" as const };
    return { text: data.staff ? "ช่าง/ผู้ดูแล" : "ผู้แจ้งซ่อม", tone: "ok" as const };
  }, [loading, error, data]);

  if (!assetCode) return null;

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg)" }}>
      {/* header */}
      <div
        style={{
          background: "linear-gradient(150deg,#0B1F4B 0%,#193264 60%,#0068B5 100%)",
          color: "#fff",
          padding: "14px 16px 12px",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0" style={{ fontSize: 10.5, letterSpacing: ".12em", color: "#9FBBD6" }}>
              MACHINE · {assetCode.toUpperCase()}
            </p>
            <h2 className="mt-1 mb-0 truncate" style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>
              {data?.asset?.name || "เครื่องจักร"}
            </h2>
            <p className="mt-1 mb-0" style={{ fontSize: 12, color: "#C6D9EE" }}>
              {[data?.asset?.location, data?.asset?.department].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "ย่อข้อมูลเครื่อง" : "ขยายข้อมูลเครื่อง"}
            style={{
              flex: "0 0 auto",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,.28)",
              background: "rgba(255,255,255,.10)",
              color: "#fff",
              padding: 6,
              lineHeight: 0,
            }}
          >
            <ChevronDown size={16} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2" style={{ fontSize: 11 }}>
          <span style={{ background: badge.tone === "ok" ? "rgba(6,199,85,.22)" : "rgba(255,255,255,.14)", color: badge.tone === "warn" ? "#FFD8A8" : "#D6F5E3", borderRadius: 999, padding: "3px 9px", fontWeight: 700 }}>
            {badge.text}
          </span>
          {typeof counts?.active_work_orders === "number" && (
            <span style={{ background: "rgba(255,255,255,.12)", borderRadius: 999, padding: "3px 9px" }}>
              งานเปิด {counts.active_work_orders}
            </span>
          )}
          {typeof counts?.pm_open === "number" && (
            <span style={{ background: "rgba(255,255,255,.12)", borderRadius: 999, padding: "3px 9px" }}>
              PM ค้าง {counts.pm_open}
            </span>
          )}
          {typeof counts?.repairs_done === "number" && (
            <span style={{ background: "rgba(255,255,255,.12)", borderRadius: 999, padding: "3px 9px" }}>
              ซ่อมแล้ว {counts.repairs_done}
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 px-4 py-3" style={{ fontSize: 13, color: "var(--cmms-text-secondary)" }}>
          <Loader2 size={16} className="animate-spin" /> กำลังโหลดข้อมูลเครื่องนี้…
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-2 px-4 py-3" style={{ fontSize: 13, color: "#9A3412" }}>
          <ShieldAlert size={16} className="mt-0.5 flex-none" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && data?.registered === false && (
        <div className="flex items-start gap-2 px-4 py-3" style={{ fontSize: 13, color: "var(--cmms-text-secondary)" }}>
          <ShieldAlert size={16} className="mt-0.5 flex-none" />
          <span>
            บัญชี LINE นี้ยังไม่ถูกเพิ่มในระบบ — <b>ติดต่อแอดมินเพื่อเพิ่มผู้ใช้</b> แล้วเปิดลิงก์นี้อีกครั้ง
            (ถ้ามีเลขพนักงานแล้ว สามารถผูกบัญชีได้จากฟอร์มด้านล่าง)
          </span>
        </div>
      )}

      {!loading && !error && data?.registered && expanded && (
        <>
          {/* tabs */}
          <div className="flex gap-1 px-2 pt-2" role="tablist" aria-label="ข้อมูลเครื่องจักร">
            {TABS.map((t) => {
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setTab(t.id)}
                  style={{
                    flex: 1,
                    border: 0,
                    cursor: "pointer",
                    borderRadius: 10,
                    padding: "8px 6px",
                    fontSize: 13,
                    fontWeight: 700,
                    background: isActive ? "var(--cmms-primary)" : "transparent",
                    color: isActive ? "#fff" : "var(--cmms-text-secondary)",
                  }}
                >
                  {t.label}
                  {t.id === "pm" && counts?.pm_open ? ` (${counts.pm_open})` : ""}
                  {t.id === "history" && counts?.repairs_done ? ` (${counts.repairs_done})` : ""}
                </button>
              );
            })}
          </div>

          <div className="px-3 pb-3 pt-2">
            {tab === "repair" && (
              <div>
                {active.length > 0 ? (
                  <ul className="m-0 list-none space-y-2 p-0">
                    {active.map((wo) => (
                      <li key={wo.work_order_no} className="flex items-start gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--cmms-border)" }}>
                        <Wrench size={15} className="mt-0.5 flex-none" style={{ color: "var(--cmms-primary)" }} />
                        <div className="min-w-0">
                          <p className="m-0 truncate" style={{ fontSize: 13, fontWeight: 700 }}>{wo.title}</p>
                          <p className="m-0" style={{ fontSize: 11.5, color: "var(--cmms-text-secondary)" }}>
                            {wo.work_order_no} · เปิดเมื่อ {thaiDate(wo.created_at)} · {wo.status}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0" style={{ fontSize: 12.5, color: "var(--cmms-text-secondary)" }}>
                    ยังไม่มีงานซ่อมที่เปิดอยู่ของเครื่องนี้
                  </p>
                )}
                <button
                  type="button"
                  onClick={jumpToForm}
                  className="mt-2 w-full"
                  style={{
                    border: 0,
                    borderRadius: 10,
                    padding: "10px 12px",
                    fontSize: 13.5,
                    fontWeight: 800,
                    color: "#fff",
                    background: "var(--cmms-primary)",
                    cursor: "pointer",
                  }}
                >
                  แจ้งซ่อมเครื่องนี้ (ฟอร์มด้านล่าง)
                </button>
              </div>
            )}

            {tab === "pm" && (
              <div>
                {pmOpen.length > 0 ? (
                  <ul className="m-0 list-none space-y-2 p-0">
                    {pmOpen.map((pm) => (
                      <li key={pm.id} className="flex items-start gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--cmms-border)" }}>
                        <CalendarClock size={15} className="mt-0.5 flex-none" style={{ color: "var(--cmms-primary)" }} />
                        <div className="min-w-0">
                          <p className="m-0 truncate" style={{ fontSize: 13, fontWeight: 700 }}>{pm.title}</p>
                          <p className="m-0" style={{ fontSize: 11.5, color: "var(--cmms-text-secondary)" }}>
                            กำหนด {thaiDate(pm.due_date)}
                            {pm.frequency_type ? ` · ${pm.frequency_type}` : ""}
                            {pm.assigned_name ? ` · ${pm.assigned_name}` : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0" style={{ fontSize: 12.5, color: "var(--cmms-text-secondary)" }}>
                    ยังไม่มีแผน PM ของเครื่องนี้ — ผู้ดูแลระบบต้องวางแผน PM ก่อน (เมนู PM &amp; AM)
                    {data?.pm?.last_done_at ? ` · ทำ PM ล่าสุด ${thaiDate(data.pm.last_done_at)}` : ""}
                  </p>
                )}
              </div>
            )}

            {tab === "history" && (
              <div>
                {history.length > 0 ? (
                  <ul className="m-0 list-none space-y-2 p-0">
                    {history.map((h) => (
                      <li key={h.work_order_no} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--cmms-border)" }}>
                        <div className="flex items-start gap-2">
                          <History size={15} className="mt-0.5 flex-none" style={{ color: "var(--cmms-primary)" }} />
                          <div className="min-w-0 flex-1">
                            <p className="m-0" style={{ fontSize: 13, fontWeight: 700 }}>{h.title}</p>
                            <p className="m-0" style={{ fontSize: 11.5, color: "var(--cmms-text-secondary)" }}>
                              {h.work_order_no} · {thaiDate(h.closed_at || h.completed_at || h.created_at)}
                              {h.technician ? ` · ช่าง ${h.technician}` : ""}
                              {h.downtime_minutes ? ` · หยุด ${h.downtime_minutes} นาที` : ""}
                            </p>
                            {(h.resolution || h.root_cause) && (
                              <p className="mt-1 mb-0" style={{ fontSize: 11.5, color: "var(--cmms-text-secondary)" }}>
                                {h.resolution || h.root_cause}
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0" style={{ fontSize: 12.5, color: "var(--cmms-text-secondary)" }}>
                    ยังไม่มีประวัติการซ่อมที่ปิดแล้วของเครื่องนี้
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
