"use client";

/**
 * MyRepairs — หน้า LIFF "ติดตามงานของฉัน" (rich menu ปุ่มที่ 2)
 *
 * เปิดได้ 2 ทาง:
 *   • https://liff.line.me/<LIFF_ID>?view=track   → /repair/request?view=track (LIFF endpoint เดิม)
 *   • /my-repairs (เว็บ/PWA — ใช้ session ที่ล็อกอินอยู่)
 *
 * ตัวตนมาจาก store ของ liff-session (LiffBridge เป็นผู้ประกาศ) — useLiffFetch รอสถานะ
 * จาก store แบบ event-driven แล้วแนบ X-LIFF-Id-Token ให้ /api/v1/my_repairs.php
 * ตรวจกับ LINE เอง ไม่มีการวนอ่าน localStorage และไม่ส่ง line_user_id จาก client
 */

import { useEffect, useMemo, useState } from "react";
import { useLiffFetch } from "@/lib/useLiffFetch";
import { useLiffSession } from "@/lib/liff-session";

import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  ClipboardList,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { UNBOUND_BODY, UNBOUND_TITLE, type SupportContact } from "@/lib/liff-bind-copy";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Item = {
  id: number;
  work_order_no: string;
  title: string;
  status: string | null;
  priority: string | null;
  created_at: string | null;
  acknowledged_at: string | null;
  actual_start_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  downtime_minutes: number | string | null;
  resolution: string | null;
  root_cause: string | null;
  rejection_note: string | null;
  asset_code: string | null;
  asset_name: string | null;
  asset_location: string | null;
  technician: string | null;
};

type Api = {
  success?: boolean;
  registered?: boolean;
  error?: string;
  user?: { full_name?: string; employee_code?: string };
  counts?: { open: number; done: number; total: number };
  items?: Item[];
};

type Tab = "all" | "open" | "done";

const STEPS = ["แจ้งแล้ว", "รับเรื่อง", "กำลังซ่อม", "เสร็จสิ้น"];

const STATUS_LABEL: Record<string, string> = {
  pending: "รอรับเรื่อง",
  open: "รอรับเรื่อง",
  assigned: "ช่างรับงานแล้ว",
  in_progress: "กำลังซ่อม",
  reopened: "เปิดงานใหม่",
  waiting_parts: "รออะไหล่",
  on_hold: "พักงาน",
  completed: "ซ่อมเสร็จ",
  verified: "ตรวจรับแล้ว",
  closed: "ปิดงาน",
  cancelled: "ยกเลิก",
  rejected: "ปฏิเสธ",
};

const OPEN_STATUSES = ["pending", "open", "assigned", "in_progress", "reopened", "waiting_parts", "on_hold"];
const DONE_STATUSES = ["completed", "verified", "closed"];

function statusStep(status: string | null): number {
  const s = (status || "").toLowerCase();
  if (DONE_STATUSES.includes(s)) return 3;
  if (s === "in_progress" || s === "waiting_parts" || s === "on_hold") return 2;
  if (s === "assigned") return 1;
  if (s === "cancelled" || s === "rejected") return -1;
  return 0;
}

function statusTone(status: string | null): { bg: string; color: string } {
  const s = (status || "").toLowerCase();
  if (s === "cancelled" || s === "rejected") return { bg: "#FDE8E8", color: "#B42318" };
  if (DONE_STATUSES.includes(s)) return { bg: "#E7F8EE", color: "#04703B" };
  if (s === "in_progress") return { bg: "#E6F0FA", color: "#0068B5" };
  if (s === "assigned") return { bg: "#EAF2FF", color: "#1D4ED8" };
  return { bg: "#FFF4E5", color: "#B45309" };
}

function formatDate(value?: string | null, withTime = false): string {
  if (!value) return "";
  const d = new Date(value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  const date = d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
  if (!withTime) return date;
  return `${date} ${d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function MyRepairs() {
  const [tab, setTab] = useState<Tab>("all");
  const [contact, setContact] = useState<SupportContact | null>(null);
  // ตัวตน: ไม่ส่ง line_user_id จาก client แล้ว — useLiffFetch แนบ X-LIFF-Id-Token
  // (LiffBridge เป็นคนประกาศ token) ให้เซิร์ฟเวอร์ตรวจกับ LINE เอง; ถ้าไม่มี token/session
  // จะได้ registered=false แล้วขึ้นคำแนะนำให้แอดมินเพิ่มผู้ใช้
  const session = useLiffSession();
  const url = "/api/v1/my_repairs.php";

  const { data, loading, error, reload: load } = useLiffFetch<Api>({
    url,
    errorMessage: "โหลดรายการงานไม่สำเร็จ",
  });

  // ยังไม่ผูกบัญชี → ขอช่องทางติดต่อแอดมิน (ชุดเดียวกับหน้า /repair/request)
  const unbound = data?.registered === false;
  useEffect(() => {
    if (!unbound) return;
    let alive = true;
    fetch("/api/v1/line_register.php?liff_id=1")
      .then((r) => r.json())
      .then((j) => {
        if (alive) setContact((j?.contact as SupportContact) || null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [unbound]);

  const items = data?.items ?? [];
  const filtered = useMemo(() => {
    if (tab === "open") return items.filter((i) => OPEN_STATUSES.includes((i.status || "").toLowerCase()));
    if (tab === "done") return items.filter((i) => DONE_STATUSES.includes((i.status || "").toLowerCase()));
    return items;
  }, [items, tab]);

  const counts = data?.counts ?? { open: 0, done: 0, total: 0 };
  // ชื่อจาก DB เมื่อผูกแล้ว ระหว่างโหลดใช้ชื่อจาก store (ไม่ต้องอ่าน localStorage)
  const viewerName = data?.user?.full_name || session.displayName;
  const viewerCode = data?.user?.employee_code || "";

  return (
    <div className="cmms-mobile-page">
      <div className="cmms-liff-hero">
        <div className="flex items-center gap-3">
          <div className="cmms-liff-logo">
            <ClipboardList size={20} strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="cmms-liff-eyebrow">MAINTENANCE TRACKING · F-EN-03</p>
            <h1 className="cmms-liff-title">ติดตามงานของฉัน</h1>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            aria-label="รีเฟรชรายการงาน"
            style={{
              border: "1px solid rgba(255,255,255,.28)",
              background: "rgba(255,255,255,.10)",
              color: "#fff",
              borderRadius: 999,
              padding: 8,
              lineHeight: 0,
            }}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
        {viewerName && (
          <p className="mt-2 mb-0" style={{ fontSize: 12.5, color: "#C6D9EE" }}>
            {viewerName}
            {viewerCode ? ` · ${viewerCode}` : ""}
          </p>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10" style={{ fontSize: 13, color: "var(--cmms-text-secondary)" }}>
          <Loader2 size={16} className="animate-spin" /> กำลังโหลดงานของคุณ…
        </div>
      )}

      {!loading && error && (
        <Card className="cmms-card-flat mx-4 my-4 p-5">
          <div className="flex items-start gap-2" style={{ fontSize: 13, color: "#9A3412" }}>
            <AlertCircle size={16} className="mt-0.5 flex-none" />
            <span>{error}</span>
          </div>
          <Button className="mt-3 w-full" onClick={() => void load()}>
            <RefreshCw className="w-4 h-4" /> ลองอีกครั้ง
          </Button>
        </Card>
      )}

      {!loading && !error && data?.registered === false && (
        <Card className="cmms-card-flat mx-4 my-4 p-5">
          <h2 className="m-0 mb-2 text-base font-bold">{UNBOUND_TITLE}</h2>
          <p className="m-0 text-sm text-[var(--cmms-text-secondary)]">{UNBOUND_BODY}</p>
          <p className="mt-2 mb-0 text-sm text-[var(--cmms-text-secondary)]">
            แจ้งแอดมิน/หัวหน้างานเพื่อเพิ่มผู้ใช้ก่อน แล้วเปิดลิงก์นี้อีกครั้ง
          </p>
          {(contact?.phone || contact?.email) && (
            <div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg)" }}>
              <p className="m-0 mb-1 text-xs font-bold text-[var(--cmms-text-secondary)]">ติดต่อแอดมิน</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                {contact?.phone && (
                  <a href={`tel:${contact.phone.replace(/[^0-9+]/g, "")}`} className="flex items-center gap-1.5" style={{ color: "var(--cmms-primary)" }}>
                    <Phone size={14} strokeWidth={1.75} /> {contact.phone}
                  </a>
                )}
                {contact?.email && (
                  <a href={`mailto:${contact.email}`} className="flex min-w-0 items-center gap-1.5 break-all" style={{ color: "var(--cmms-primary)" }}>
                    <Mail size={14} strokeWidth={1.75} /> {contact.email}
                  </a>
                )}
              </div>
            </div>
          )}
          <Button className="mt-3 w-full" onClick={() => (window.location.href = "/repair/request")}>
            ไปหน้าผูกบัญชี / แจ้งซ่อม
          </Button>
        </Card>
      )}

      {!loading && !error && data?.registered && (
        <div className="px-4 pt-3">
          <div className="flex gap-1 rounded-xl p-1" style={{ background: "var(--cmms-bg)" }} role="tablist" aria-label="ตัวกรองงาน">
            {([
              ["all", `ทั้งหมด ${counts.total}`],
              ["open", `กำลังทำ ${counts.open}`],
              ["done", `เสร็จแล้ว ${counts.done}`],
            ] as [Tab, string][]).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                style={{
                  flex: 1,
                  border: 0,
                  cursor: "pointer",
                  borderRadius: 9,
                  padding: "8px 4px",
                  fontSize: 12.5,
                  fontWeight: 700,
                  background: tab === id ? "var(--cmms-primary)" : "transparent",
                  color: tab === id ? "#fff" : "var(--cmms-text-secondary)",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="cmms-header-emoji"><Wrench size={24} strokeWidth={1.75} /></div>
              <p className="m-0 text-sm text-[var(--cmms-text-secondary)]">
                {items.length === 0 ? "ยังไม่มีงานที่คุณแจ้งไว้" : "ไม่มีงานในหมวดนี้"}
              </p>
              <Button onClick={() => (window.location.href = "/repair/request")}>
                <Wrench className="w-4 h-4" /> แจ้งซ่อมใหม่
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {filtered.map((item) => {
                const tone = statusTone(item.status);
                const step = statusStep(item.status);
                const ts = item.closed_at || item.completed_at || item.actual_start_at || item.acknowledged_at || item.created_at;
                return (
                  <Card key={item.id} className="cmms-card-flat p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="m-0" style={{ fontSize: 11, color: "var(--cmms-text-secondary)", letterSpacing: ".04em" }}>
                          {item.work_order_no} · {formatDate(item.created_at, true)}
                        </p>
                        <p className="m-0 mt-0.5" style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>
                          {item.title || "งานแจ้งซ่อม"}
                        </p>
                        {(item.asset_code || item.asset_name) && (
                          <p className="m-0 mt-0.5 truncate" style={{ fontSize: 12, color: "var(--cmms-text-secondary)" }}>
                            {[item.asset_code, item.asset_name].filter(Boolean).join(" — ")}
                          </p>
                        )}
                      </div>
                      <span
                        style={{
                          flex: "0 0 auto",
                          background: tone.bg,
                          color: tone.color,
                          borderRadius: 999,
                          padding: "3px 9px",
                          fontSize: 11.5,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {STATUS_LABEL[(item.status || "").toLowerCase()] || item.status || "—"}
                      </span>
                    </div>

                    {step >= 0 && (
                      <div className="mt-3">
                        <div className="flex items-center">
                          {STEPS.map((label, i) => {
                            const done = i <= step;
                            return (
                              <div key={label} className="flex flex-1 items-center last:flex-none">
                                <div className="flex flex-col items-center gap-1">
                                  <span
                                    style={{
                                      width: 12,
                                      height: 12,
                                      borderRadius: 999,
                                      background: done ? "var(--cmms-primary)" : "var(--cmms-border)",
                                      boxShadow: i === step ? "0 0 0 3px rgba(0,104,181,.16)" : "none",
                                    }}
                                  />
                                  <span style={{ fontSize: 10, color: done ? "var(--cmms-text-primary)" : "var(--cmms-text-secondary)", whiteSpace: "nowrap" }}>
                                    {label}
                                  </span>
                                </div>
                                {i < STEPS.length - 1 && (
                                  <span style={{ flex: 1, height: 2, background: i < step ? "var(--cmms-primary)" : "var(--cmms-border)", margin: "0 2px 14px" }} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ fontSize: 11.5, color: "var(--cmms-text-secondary)" }}>
                      {item.technician && (
                        <span className="flex items-center gap-1">
                          <Wrench size={12} /> ช่าง {item.technician}
                        </span>
                      )}
                      {ts && (
                        <span className="flex items-center gap-1">
                          <CalendarClock size={12} /> {DONE_STATUSES.includes((item.status || "").toLowerCase()) ? "เสร็จ" : "อัปเดต"} {formatDate(ts, true)}
                        </span>
                      )}
                      {item.downtime_minutes ? <span>หยุดเครื่อง {item.downtime_minutes} นาที</span> : null}
                    </div>

                    {(item.resolution || item.root_cause || item.rejection_note) && (
                      <p className="mt-2 mb-0" style={{ fontSize: 12, color: "var(--cmms-text-secondary)" }}>
                        {item.rejection_note
                          ? `เหตุผลที่ปฏิเสธ: ${item.rejection_note}`
                          : [item.resolution && `วิธีแก้: ${item.resolution}`, item.root_cause && `สาเหตุ: ${item.root_cause}`]
                              .filter(Boolean)
                              .join(" · ")}
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => (window.location.href = "/repair/request")}>
              <ArrowLeft className="w-4 h-4" /> กลับหน้าแจ้งซ่อม
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
