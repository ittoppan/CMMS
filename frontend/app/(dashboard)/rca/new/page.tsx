"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ToastProvider";
import { ArrowLeft, Activity, Save } from "lucide-react";
import {
  FailureEvent, AssetOption, WoOption, Taxonomy, EngineUser,
  fetchEventOptions, rcaPost,
  FAILURE_SEVERITIES, RCA_PRODUCTION_IMPACT, fmtDuration,
} from "@/lib/rca";

const inputCls = "h-10 w-full rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg)] px-3 text-sm outline-none transition-colors focus:border-[var(--cmms-border-focus)] focus:ring-2 focus:ring-[var(--cmms-border-focus)]";

export default function RcaNewPage() {
  const hero = usePageHero("rca");
  const router = useRouter();
  const sp = useSearchParams();
  const { showToast } = useToast();

  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [wos, setWos] = useState<WoOption[]>([]);
  const [tax, setTax] = useState<Taxonomy | null>(null);
  const [users, setUsers] = useState<EngineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [eventId, setEventId] = useState<number>(Number(sp.get("event_id")) || 0);
  const [existing, setExisting] = useState<FailureEvent | null>(null);

  // event fields
  const [assetId, setAssetId] = useState("");
  const [repairId, setRepairId] = useState("");
  const [failureDate, setFailureDate] = useState("");
  const [sev, setSev] = useState("medium");
  const [prodImpact, setProdImpact] = useState("");
  const [downtimeMin, setDowntimeMin] = useState("");
  const [typeId, setTypeId] = useState("0");
  const [modeId, setModeId] = useState("0");
  const [causeId, setCauseId] = useState("0");
  const [symptom, setSymptom] = useState("");
  const [desc, setDesc] = useState("");
  const [operatingCondition, setOperatingCondition] = useState("");
  const [machineState, setMachineState] = useState("");

  // RCA fields
  const [makeRca, setMakeRca] = useState(true);
  const [rcaTitle, setRcaTitle] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [assigneeId, setAssigneeId] = useState("0");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    fetchEventOptions(eventId)
      .then((r) => {
        setAssets(r.assets); setWos(r.wos || []); setTax(r.taxonomy); setUsers(r.users);
        if (r.event) {
          setExisting(r.event);
          setAssetId(String(r.event.asset_id ?? ""));
          setRepairId(String(r.event.repair_id ?? ""));
          setSev(r.event.severity || "medium");
          setProdImpact(r.event.production_impact || "");
          setDowntimeMin(r.event.downtime_minutes != null ? String(r.event.downtime_minutes) : "");
          setTypeId(String(r.event.failure_type_id ?? 0));
          setModeId(String(r.event.failure_mode_id ?? 0));
          setCauseId(String(r.event.cause_id ?? 0));
          setSymptom(r.event.symptom || "");
          setDesc(r.event.description || "");
          setOperatingCondition(r.event.operating_condition || "");
          setMachineState(r.event.machine_state || "");
          setRcaTitle(`RCA: ${r.event.asset_name || r.event.event_code || ""} — ${r.event.symptom || r.event.description?.slice(0, 60) || ""}`);
        }
      })
      .catch((e: any) => setError(e?.message || "โหลดข้อมูลตัวเลือกไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [eventId]);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        action: "event_create",
        asset_id: Number(assetId) || 0,
        repair_id: Number(repairId) || 0,
        failure_date: failureDate || undefined,
        severity: sev,
        production_impact: prodImpact || undefined,
        downtime_minutes: downtimeMin ? Number(downtimeMin) : 0,
        failure_type_id: Number(typeId) || 0,
        failure_mode_id: Number(modeId) || 0,
        cause_id: Number(causeId) || 0,
        symptom,
        description: desc,
        operating_condition: operatingCondition || undefined,
        machine_state: machineState || undefined,
      };
      const res = await rcaPost<{ success: boolean; id: number; code: string; repeat_suspected: boolean; rca_required: boolean; reasons: string[] }>(payload);
      showToast("success", `บันทึกเหตุการณ์ ${res.code} สำเร็จ`);

      if (makeRca) {
        const rcaPayload: Record<string, unknown> = {
          action: "rca_create",
          failure_event_id: res.id,
          title: rcaTitle.trim() || `RCA ${res.code}`,
          problem_statement: problemStatement || undefined,
          assignee_id: Number(assigneeId) || 0,
          due_date: dueDate || undefined,
        };
        const r = await rcaPost<{ success: boolean; id: number; code: string }>(rcaPayload);
        showToast("success", `เปิด RCA ${r.code} สำเร็จ`);
        router.push(`/rca/${r.id}`);
      } else {
        router.push(`/rca/events?q=${res.code}`);
      }
    } catch (e: any) {
      setError(e?.message || "บันทึกไม่สำเร็จ");
      showToast("error", e?.message || "บันทึกเหตุการณ์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const sevTone = (s: string) => FAILURE_SEVERITIES.find((x) => x.value === s)?.tone || "neutral";
  const sevBadge = (s: string) => (
    <Badge variant={(({ green: "success", amber: "warning", orange: "warning", red: "danger" } as Record<string, any>)[sevTone(s)] || "neutral") as never}>
      {FAILURE_SEVERITIES.find((x) => x.value === s)?.label ?? s}
    </Badge>
  );

  if (loading) {
    return <div className="space-y-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            {existing && <Badge variant="primary">{existing.event_code}</Badge>}
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{hero.desc}</p>
        </div>
        <a href="/rca/events" className={buttonVariants({ variant: "secondary" })}><ArrowLeft size={16} aria-hidden="true" /> ย้อนกลับ</a>
      </div>

      {existing && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <Activity size={18} className="text-[var(--cmms-primary)]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--cmms-text-primary)]">{existing.event_code} — {existing.asset_name}</p>
              <p className="text-xs text-[var(--cmms-text-secondary)]">{existing.symptom || existing.description}</p>
            </div>
            {sevBadge(existing.severity)}
            <span className="text-xs text-[var(--cmms-text-secondary)]">{fmtDuration(existing.downtime_minutes)}</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลเหตุการณ์</CardTitle>
          <CardDescription>กรอกรายละเอียดเท่าที่รู้จริง — ช่องว่างบังคับไว้ที่เครื่องหมาย *</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">เครื่องจักร *</span>
              <Select value={assetId} onValueChange={setAssetId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="เลือกเครื่องจักร" /></SelectTrigger>
                <SelectContent>
                  {assets.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.code} — {a.name}{a.criticality ? ` (${a.criticality})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ใบสั่งงาน (ถ้ามี)</span>
              <Select value={repairId} onValueChange={setRepairId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">ไม่ระบุ</SelectItem>
                  {(wos || []).map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.work_order_no || `WO#${w.id}`} — {w.asset_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">วันที่เกิดเหตุ</span>
              <input type="datetime-local" value={failureDate} onChange={(e) => setFailureDate(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ความรุนแรง *</span>
              <Select value={sev} onValueChange={setSev}>
                <SelectTrigger className="w-full"><SelectValue placeholder="ระดับ" /></SelectTrigger>
                <SelectContent>
                  {FAILURE_SEVERITIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ผลกระทบการผลิต</span>
              <Select value={prodImpact} onValueChange={setProdImpact}>
                <SelectTrigger className="w-full"><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ไม่ระบุ</SelectItem>
                  {RCA_PRODUCTION_IMPACT.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">Downtime (นาที)</span>
              <input type="number" min={0} value={downtimeMin} onChange={(e) => setDowntimeMin(e.target.value)} placeholder="0" className={inputCls} />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">Failure Type</span>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">ไม่ระบุ</SelectItem>
                  {(tax?.failure_types ?? []).filter((t) => t.is_active).map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.code} — {t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">Failure Mode</span>
              <Select value={modeId} onValueChange={setModeId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">ไม่ระบุ</SelectItem>
                  {(tax?.failure_modes ?? []).filter((t) => t.is_active).map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.code} — {t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">Failure Cause (สาเหตุเบื้องต้น)</span>
              <Select value={causeId} onValueChange={setCauseId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">ไม่ระบุ</SelectItem>
                  {(tax?.failure_causes ?? []).filter((t) => t.is_active).map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.code} — {t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">อาการ (Symptom) <span className="text-[var(--cmms-text-muted)]">— ระบุเฉพาะสิ่งที่เห็นจริง</span></span>
            <textarea value={symptom} onChange={(e) => setSymptom(e.target.value)} rows={2} placeholder="เช่น มีเสียงดังผิดปกติที่หัวปั๊ม ก่อนเครื่องตัดใน 5 นาที" className="w-full resize-none rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--cmms-border-focus)] focus:ring-2 focus:ring-[var(--cmms-border-focus)]" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">รายละเอียดเหตุการณ์ *</span>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} placeholder="เล่าตามลำดับเหตุจริง: เกิดอะไรขึ้น ก่อน/ระหว่าง/หลัง ใครพบเห็น" className="w-full resize-none rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--cmms-border-focus)] focus:ring-2 focus:ring-[var(--cmms-border-focus)]" />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">สภาพการทำงานขณะเกิดเหตุ</span>
              <input value={operatingCondition} onChange={(e) => setOperatingCondition(e.target.value)} placeholder="เช่น วิ่งเต็มโหลด 3 กะ" className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">สถานะเครื่อง</span>
              <input value={machineState} onChange={(e) => setMachineState(e.target.value)} placeholder="เช่น กำลังตัด ระหว่างเปลี่ยนแม่พิมพ์" className={inputCls} />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>เปิด RCA เสร็จพร้อมกัน</CardTitle>
            <CardDescription>สร้าง RCA พร้อมบันทึกเหตุการณ์ หรือบันทึกเหตุการณ์อย่างเดียว</CardDescription>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={makeRca} onChange={(e) => setMakeRca(e.target.checked)} className="h-4 w-4 accent-[var(--cmms-primary)]" />
            <span className="text-sm font-medium text-[var(--cmms-text-primary)]">เปิด RCA</span>
          </label>
        </CardHeader>
        {makeRca && (
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">หัวข้อ RCA *</span>
                <input value={rcaTitle} onChange={(e) => setRcaTitle(e.target.value)} placeholder="เช่น วิเคราะห์ปั๊ม PE-04 พังซ้ำ" className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ผู้รับผิดชอบ (Investigator)</span>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">ไม่ระบุ</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.full_name}{u.role_id === 1 ? " (Admin)" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">คำอธิบายปัญหา (Problem Statement)</span>
              <textarea value={problemStatement} onChange={(e) => setProblemStatement(e.target.value)} rows={3} placeholder="ระบุปัญหาที่ชัดเจนที่ต้องสืบหา เช่น เครื่อง X หยุดเพราะมอเตอร์ม้วนไหม้ โดยก่อนหน้าซ่อมมาแล้ว 2 ครั้งใน 3 เดือน" className="w-full resize-none rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--cmms-border-focus)] focus:ring-2 focus:ring-[var(--cmms-border-focus)]" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">กำหนดเสร็จ (Due)</span>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
              </label>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="flex items-center justify-end gap-2">
        <a href="/rca/events" className={buttonVariants({ variant: "ghost" })}>ยกเลิก</a>
        <Button onClick={submit} loading={busy}><Save size={16} aria-hidden="true" /> {makeRca ? "บันทึกเหตุการณ์ + เปิด RCA" : "บันทึกเหตุการณ์"}</Button>
      </div>
    </div>
  );
}