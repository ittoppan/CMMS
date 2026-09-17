"use client";

import { useState, useEffect, useCallback } from "react";
import { VStack, HStack } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/PageShell";
import { AccessDenied } from "@/components/access-denied";

type Group = {
  ok?: boolean;
  ms?: number;
  data?: Record<string, unknown> | null;
  error?: string;
};

type Health = {
  status: string;
  server_time: string;
  request_id: string;
  warnings?: string[];
  system?: { ssl?: boolean; php?: string; document_root?: string | null; web_ok?: boolean };
  db?: Group;
  sage?: Group;
  storage?: Group;
  errors?: Group;
  sync?: Group;
  cmms?: Group;
  spare?: Group;
  notifications?: Group;
  audit?: Group;
  data_quality?: Group;
  timing_ms?: number;
};

const fmtBytes = (n: number | null | undefined) => {
  if (n === null || n === undefined) return "—";
  if (n >= 1073741824) return (n / 1073741824).toFixed(2) + " GB";
  if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
  return n.toLocaleString("th-TH") + " B";
};

function KV({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "ok" | "warn" | "bad" }) {
  const chip = (tone ? (
    <span
      className="cmms-andon-chip"
      style={
        tone === "ok"
          ? { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" }
          : tone === "warn"
          ? { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }
          : { background: "var(--cmms-danger-light, #fee2e2)", color: "var(--cmms-danger-dark, #b91c1c)" }
      }
    >
      {value}
    </span>
  ) : (
    <span className="font-medium">{value}</span>
  ));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      {chip}
    </div>
  );
}

function SectionCard({ title, ok, ms, children }: { title: string; ok?: boolean; ms?: number; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <HStack hAlign="between" vAlign="center" gap={3}>
          <h3 className="m-0 text-base font-semibold">{title}</h3>
          <span className="text-xs text-muted-foreground">
            {ok === false ? "ไม่สามารถดึงข้อมูลได้" : ms !== undefined ? "ดึงใน " + ms + "ms" : ""}
          </span>
        </HStack>
        {ok === false ? (
          <p className="mt-2 text-sm text-destructive">ข้อมูลกลุ่มนี้โหลดไม่สำเร็จ — ดู logs/php-error.log</p>
        ) : (
          <div className="mt-2 divide-y divide-border">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/system_health.php", { cache: "no-store" });
      const json = await res.json();
      if (res.status === 403) {
        setError("FORBIDDEN");
        setLoading(false);
        return;
      }
      if (res.ok && json && typeof json === "object") {
        setHealth(json as Health);
      } else {
        setError(json?.error || "โหลดข้อมูลสุขภาพระบบไม่สำเร็จ");
      }
    } catch {
      setError("ไม่สามารถติดต่อ API ได้ — ระบบ API อาจหยุดทำงาน");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  if (error === "FORBIDDEN") {
    return <AccessDenied onRetry={fetchHealth} />;
  }

  const d = health;
  const status = d?.status || "unknown";
  const statusWarn =
    (d?.warnings?.length ?? 0) > 0 ||
    (d?.cmms?.data && ((d.cmms.data as { repair?: { open_stale_gt_30d?: number } })?.repair?.open_stale_gt_30d ?? 0) > 0);

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">SYSTEM HEALTH · PHASE 22 MONITORING</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ตั้งค่า", href: "/settings" }, { label: "สุขภาพระบบ" }]}
      title="Production Health Dashboard"
      description="สถานะระบบจากข้อมูลจริง ณ เวลานี้ — API, Sage 300, พื้นที่จัดเก็บ, ข้อผิดพลาด, Sync, งานซ่อม, การแจ้งเตือน และคุณภาพข้อมูล"
      actions={
        <>
          <span
            className="cmms-andon-chip"
            style={
              status === "ok" && !statusWarn
                ? { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" }
                : { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }
            }
          >
            {status === "ok" && !statusWarn ? "ระบบปกติ" : "ต้องตรวจสอบ"}
          </span>
          <Button variant="secondary" disabled={loading} onClick={() => fetchHealth()}>
            {loading ? "กำลังโหลด..." : "รีเฟรช"}
          </Button>
        </>
      }
    >
      <VStack gap={6}>
        {error && error !== "FORBIDDEN" && <Alert variant="danger" title="เกิดข้อผิดพลาด">{error}</Alert>}
        {(d?.warnings ?? []).map((w, i) => (
          <Alert key={i} variant="warning" title="คำเตือน">
            {w}
          </Alert>
        ))}

        {loading && !d ? (
          <HStack gap={2}>
            <Spinner size={20} />
            <span className="text-sm">กำลังตรวจสอบสถานะระบบ...</span>
          </HStack>
        ) : !d ? null : (
          <VStack gap={4}>
            <p className="text-sm text-muted-foreground">
              อัปเดตล่าสุด: {d.server_time || "-"} · request_id: {d.request_id} · ทั้งหน้าดึงข้อมูลใน{" "}
              {d.timing_ms != null ? d.timing_ms + "ms" : "-"}
            </p>

            <Card>
              <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
                <KV
                  label="Database ping"
                  value={d.db?.ok ? (d.db.data as { ping_ms?: number })?.ping_ms?.toFixed(1) + " ms" : "—"}
                  tone={d.db?.ok ? "ok" : "bad"}
                />
                <KV
                  label="Sage 300 ต่อได้"
                  value={(d.sage?.data as { probe?: { connected?: boolean } })?.probe?.connected ? "เชื่อมต่อแล้ว" : "เชื่อมต่อไม่ได้"}
                  tone={(d.sage?.data as { probe?: { connected?: boolean } })?.probe?.connected ? "ok" : "bad"}
                />
                <KV
                  label="พื้นที่ว่าง disk"
                  value={fmtBytes((d.storage?.data as { disk_free_bytes?: number })?.disk_free_bytes)}
                  tone={((d.storage?.data as { disk_free_percent?: number })?.disk_free_percent ?? 100) < 10 ? "bad" : "ok"}
                />
                <KV
                  label="ข้อผิดพลาด 30 วัน"
                  value={(d.errors?.data as { by_category_30d?: { count?: number }[] })?.by_category_30d?.reduce((s, r) => s + (r.count ?? 0), 0) ?? 0}
                  tone={((d.errors?.data as { by_category_30d?: { count?: number }[] })?.by_category_30d?.reduce((s, r) => s + (r.count ?? 0), 0) ?? 0) > 0 ? "warn" : "ok"}
                />
                <KV
                  label="งานซ่อมค้าง >30 วัน"
                  value={(d.cmms?.data as { repair?: { open_stale_gt_30d?: number } })?.repair?.open_stale_gt_30d ?? 0}
                  tone={((d.cmms?.data as { repair?: { open_stale_gt_30d?: number } })?.repair?.open_stale_gt_30d ?? 0) > 0 ? "warn" : "ok"}
                />
              </CardContent>
            </Card>

            {!d.system?.ssl && (
              <Alert variant="warning" title="HTTPS ยังไม่เปิดใช้งาน">
                เป็นข้อจำกัด P0 จาก Phase 21 (blocker B-1) — ยังไม่ผ่าน SSL/TLS สำหรับใช้งานบนอุปกรณ์จริงผ่านอินเทอร์เน็ต
              </Alert>
            )}

            <SectionCard title="Sage 300 Integration" ok={d.sage?.ok} ms={d.sage?.ms}>
              <KV label="การเชื่อมต่อ (probe จริง)" value={JSON.stringify((d.sage?.data as { probe?: { connected?: boolean; driver?: string } })?.probe, null, 0)} />
              <KV label="Sync ล่าสุดทั้งหมด" value={(d.sage?.data as { last_sync?: { sync_type?: string; status?: string; created_at?: string } })?.last_sync?.created_at || "—"} />
              <KV label="Sync สำเร็จล่าสุด" value={(d.sage?.data as { last_success_at?: string })?.last_success_at || "—"} />
            </SectionCard>

            <SectionCard title="Storage & php-error.log" ok={d.storage?.ok} ms={d.storage?.ms}>
              <KV label="พื้นที่ว่าง (percent)" value={(d.storage?.data as { disk_free_percent?: number })?.disk_free_percent + "%"} />
              <KV label="php-error.log ขนาด" value={fmtBytes((d.storage?.data as { php_error_log?: { bytes?: number } })?.php_error_log?.bytes)} />
              <KV label="php-error.log แก้ไขล่าสุด" value={(d.storage?.data as { php_error_log?: { mtime?: string } })?.php_error_log?.mtime || "—"} />
            </SectionCard>

            <SectionCard title="ข้อผิดพลาด (system_errors)" ok={d.errors?.ok} ms={d.errors?.ms}>
              <p className="text-xs text-muted-foreground">
                {(d.errors?.data as { note?: string })?.note || "เริ่มเก็บจาก Phase 22"}
              </p>
              {((d.errors?.data as { by_category_30d?: { category: string; count: number }[] })?.by_category_30d ?? []).map((r, i) => (
                <KV key={i} label={"หมวด " + r.category} value={r.count} />
              ))}
              {((d.errors?.data as { recent?: { id: number; created_at: string; module: string; error_code: string; user_message: string }[] })?.recent ?? []).slice(0, 5).map((r) => (
                <div key={r.id} className="py-1.5 text-sm">
                  <span className="text-muted-foreground">[{r.created_at}]</span> {r.module} · {r.error_code || "—"} — {r.user_message}
                </div>
              ))}
            </SectionCard>

            <SectionCard title="Sync / Action Log (30 วัน)" ok={d.sync?.ok} ms={d.sync?.ms}>
              {((d.sync?.data as { by_outcome_30d?: { outcome: string; c: number }[] })?.by_outcome_30d ?? []).map((r, i) => (
                <KV key={i} label={"ผลลัพธ์: " + r.outcome} value={r.c} tone={r.outcome === "conflict" ? "warn" : undefined} />
              ))}
              <KV
                label="ที่ไม่จบเกิน 24 ชม."
                value={(d.sync?.data as { possibly_stuck_24h?: unknown[] })?.possibly_stuck_24h?.length ?? 0}
                tone={(d.sync?.data as { possibly_stuck_24h?: unknown[] })?.possibly_stuck_24h?.length ? "warn" : "ok"}
              />
            </SectionCard>

            <SectionCard title="CMMS Work Status" ok={d.cmms?.ok} ms={d.cmms?.ms}>
              <KV label="งานซ่อมที่เปิดอยู่" value={(d.cmms?.data as { repair?: { open?: number } })?.repair?.open ?? 0} />
              <KV
                label="ค้างเปิดเกิน 30 วัน"
                value={(d.cmms?.data as { repair?: { open_stale_gt_30d?: number } })?.repair?.open_stale_gt_30d ?? 0}
                tone={((d.cmms?.data as { repair?: { open_stale_gt_30d?: number } })?.repair?.open_stale_gt_30d ?? 0) > 0 ? "warn" : "ok"}
              />
              <KV
                label="งานเสร็จแต่ไม่มีช่าง (completed)"
                value={(d.cmms?.data as { repair?: { completed_no_technician?: number } })?.repair?.completed_no_technician ?? 0}
                tone={((d.cmms?.data as { repair?: { completed_no_technician?: number } })?.repair?.completed_no_technician ?? 0) > 0 ? "warn" : "ok"}
              />
              <KV label="PM ค้างเกินกำหนด" value={(d.cmms?.data as { pm?: { overdue?: number } })?.pm?.overdue ?? 0} tone={(d.cmms?.data as { pm?: { overdue?: number } })?.pm?.overdue ? "warn" : "ok"} />
              <KV label="แผน PM ที่ active" value={(d.cmms?.data as { pm?: { active_plans?: number } })?.pm?.active_plans ?? 0} />
              <KV label="ผลตรวจรอบที่ fail" value={(d.cmms?.data as { inspections?: { failed?: number } })?.inspections?.failed ?? 0} tone={(d.cmms?.data as { inspections?: { failed?: number } })?.inspections?.failed ? "warn" : "ok"} />
            </SectionCard>

            <SectionCard title="Spare / Sage Stock Flow" ok={d.spare?.ok} ms={d.spare?.ms}>
              {((d.spare?.data as { issue_requests?: { status: string; c: number }[] })?.issue_requests ?? []).map((r, i) => (
                <KV key={i} label={"เบิก (issue) " + r.status} value={r.c} tone={String(r.status).toLowerCase() === "pending" || String(r.status).toLowerCase() === "requested" ? "warn" : undefined} />
              ))}
              {((d.spare?.data as { sage_shipments?: { status: string; c: number }[] })?.sage_shipments ?? []).map((r, i) => (
                <KV key={i} label={"Shipment " + r.status} value={r.c} />
              ))}
            </SectionCard>

            <SectionCard title="การแจ้งเตือน (30 วัน)" ok={d.notifications?.ok} ms={d.notifications?.ms}>
              {((d.notifications?.data as { by_channel_status_30d?: { channel: string; status: string; c: number }[] })?.by_channel_status_30d ?? []).map((r, i) => (
                <KV
                  key={i}
                  label={(r.channel || "?") + " → " + r.status}
                  value={r.c}
                  tone={r.status !== "SENT" ? "warn" : undefined}
                />
              ))}
              {(((d.notifications?.data as { recent_line_failures?: { id: number; status: string; raw_response: string }[] })?.recent_line_failures ?? []).length > 0) && (
                <p className="pt-2 text-xs text-warning">
                  LINE ส่งไม่สำเร็จล่าสุด — ตรวจสอบคิวอต้า:{" "}
                  {(d.notifications?.data as { recent_line_failures?: { raw_response?: string }[] })?.recent_line_failures?.slice(-1)[0]?.raw_response || ""}
                </p>
              )}
            </SectionCard>

            <SectionCard title="Audit & Security" ok={d.audit?.ok} ms={d.audit?.ms}>
              <KV label="ข้อยืนยันทุกประวัติ (รวม)" value={(d.audit?.data as { total?: number })?.total ?? 0} />
              {((d.audit?.data as { by_severity_30d?: { severity: string; c: number }[] })?.by_severity_30d ?? []).map((r, i) => (
                <KV key={i} label={"severity=" + r.severity} value={r.c} />
              ))}
            </SectionCard>

            <SectionCard title="คุณภาพข้อมูล (detected)" ok={d.data_quality?.ok} ms={d.data_quality?.ms}>
              <p className="text-xs text-muted-foreground">{(d.data_quality?.data as { note?: string })?.note || ""}</p>
              <KV
                label="งานซ่อมที่ completion ก่อน start"
                value={(d.data_quality?.data as { repair_completed_before_start?: number })?.repair_completed_before_start ?? 0}
                tone={((d.data_quality?.data as { repair_completed_before_start?: number })?.repair_completed_before_start ?? 0) > 0 ? "warn" : "ok"}
              />
              <KV
                label="ช่างที่อ้างอิงไม่มีใน users"
                value={(d.data_quality?.data as { work_assignees_orphan_users?: number })?.work_assignees_orphan_users ?? 0}
                tone={((d.data_quality?.data as { work_assignees_orphan_users?: number })?.work_assignees_orphan_users ?? 0) > 0 ? "warn" : "ok"}
              />
            </SectionCard>
          </VStack>
        )}
      </VStack>
    </PageShell>
  );
}