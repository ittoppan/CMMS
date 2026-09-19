"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  Pause,
  CheckCircle2,
  Camera,
  Save,
  Undo2,
  Hand,
  Wrench,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ConnectivityStatus } from "@/components/ConnectivityStatus";
import { useToast } from "@/components/ToastProvider";
import {
  acceptWork,
  startWork,
  pauseWork,
  resumeWork,
  saveDiagnosis,
  completeWork,
  queueWorkPhoto,
  type SendOutcome,
  type PhotoCategory,
} from "@/lib/field";

type Wo = {
  id: number;
  work_order_no: string;
  title: string;
  description?: string | null;
  failure_report?: string | null;
  diagnosis?: string | null;
  root_cause?: string | null;
  solution?: string | null;
  status: string;
  priority?: string | null;
  asset_name?: string | null;
  assigned_name?: string | null;
  actual_start_at?: string | null;
  contaminate_checking?: string | null;
  created_at?: string | null;
};

const DONE_STATUSES = ["completed", "closed", "verified", "done", "cancelled", "rejected", "skipped"];

const STATUS_LABEL: Record<string, string> = {
  open: "เปิด",
  pending_approval: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  assigned: "มอบหมายแล้ว",
  accepted: "รับงานแล้ว",
  in_progress: "กำลังทำ",
  paused: "หยุดพัก",
  waiting_parts: "รออะไหล่",
  waiting_external: "รอภายนอก",
  pending_verification: "รอตรวจรับ",
  completed: "เสร็จ (รอตรวจ)",
  closed: "ปิดงาน",
  verified: "ตรวจรับแล้ว",
};

const PAUSE_REASONS = [
  { value: "waiting_parts", label: "รออะไหล่" },
  { value: "production_stop", label: "เครื่องจักรยังต้องเดิน (รอหยุดไลน์)" },
  { value: "contractor", label: "รอผู้รับเหมา / ผู้เชี่ยวชาญ" },
  { value: "other", label: "อื่น ๆ" },
];

const CONTAM_OPTIONS = [
  { value: "clean", label: "สะอาด" },
  { value: "contaminated", label: "ปนเปื้อน" },
  { value: "not_applicable", label: "ไม่เกี่ยวข้อง" },
];

export default function WorkModePage() {
  const params = useParams<{ id: string }>();
  const woId = Number(params?.id);
  const { showToast } = useToast();

  const [wo, setWo] = useState<Wo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState("waiting_parts");
  const [pauseNote, setPauseNote] = useState("");
  const [contam, setContam] = useState("clean");
  const [resolution, setResolution] = useState("");
  const [diag, setDiag] = useState({ diagnosis: "", root_cause: "", solution: "" });
  const [photoCount, setPhotoCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!woId) return;
    try {
      const res = await fetch(`/api/v1/repair.php?id=${woId}`, { credentials: "include" });
      if (!res.ok) throw new Error("โหลดใบงานไม่สำเร็จ");
      const row: Wo = await res.json();
      setWo(row);
      setDiag({
        diagnosis: row.diagnosis || "",
        root_cause: row.root_cause || "",
        solution: row.solution || "",
      });
      if (row.contaminate_checking) setContam(row.contaminate_checking);
      const att = await fetch(`/api/v1/repair_attachment.php?work_order_id=${woId}`, { credentials: "include" }).catch(() => null);
      if (att?.ok) {
        const j = await att.json();
        setPhotoCount(Array.isArray(j?.attachments) ? j.attachments.length : 0);
      }
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "โหลดใบงานไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [woId, showToast]);

  useEffect(() => {
    void load();
    const t = setTimeout(() => { document.title = `โหมดทำงาน #${woId} · CMMS-TOPPAN`; }, 350);
    return () => clearTimeout(t);
  }, [load, woId]);

  const handleOutcome = useCallback(
    async (outcome: SendOutcome, optimistic?: Partial<Wo>) => {
      if (outcome === "sent") {
        showToast("success", "บันทึกเรียบร้อย");
        await load();
      } else if (outcome === "queued") {
        showToast("info", "ออฟไลน์ — บันทึกในเครื่องแล้ว จะซิงก์อัตโนมัติเมื่อออนไลน์");
        if (optimistic) setWo((prev) => (prev ? { ...prev, ...optimistic } : prev));
      } else {
        showToast("error", "บันทึกไม่สำเร็จ — กรุณาลองใหม่หรือโหลดข้อมูลล่าสุด");
      }
    },
    [load, showToast]
  );

  const run = useCallback(
    async (key: string, fn: () => Promise<SendOutcome>, optimistic?: Partial<Wo>) => {
      setBusy(key);
      try {
        const outcome = await fn();
        await handleOutcome(outcome, optimistic);
        return outcome;
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
        return "failed" as SendOutcome;
      } finally {
        setBusy(null);
      }
    },
    [handleOutcome, showToast]
  );

  const status = wo?.status || "";
  const isDone = DONE_STATUSES.includes(status);
  const canAccept = ["pending_approval", "approved", "assigned", "open"].includes(status);
  const canStart = ["assigned", "accepted", "open", "approved"].includes(status);
  const canPause = ["in_progress", "accepted", "assigned"].includes(status);
  const canResume = ["paused", "waiting_parts", "waiting_external"].includes(status);
  const canComplete = ["in_progress", "paused", "waiting_parts", "waiting_external", "accepted", "assigned"].includes(status);

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>, category: PhotoCategory) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !woId) return;
    setBusy("photo");
    try {
      const { outcome, bytes } = await queueWorkPhoto(woId, file, category);
      if (outcome === "sent") {
        showToast("success", `แนบรูปแล้ว (${(bytes / 1024).toFixed(0)} KB)`);
        await load();
      } else if (outcome === "queued") {
        showToast("info", "เก็บรูปในเครื่องแล้ว — จะอัปโหลดเมื่อออนไลน์");
        setPhotoCount((c) => c + 1);
      } else {
        showToast("error", "อัปโหลดรูปไม่สำเร็จ");
      }
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "ไม่สามารถจัดเก็บรูปได้");
    } finally {
      setBusy(null);
    }
  };

  const headerBadge = useMemo(() => {
    const v = status === "in_progress" ? "success" : status === "paused" || status === "waiting_parts" || status === "waiting_external" ? "warning" : isDone ? "neutral" : "primary";
    return { variant: v as "success" | "warning" | "neutral" | "primary" | "info", label: STATUS_LABEL[status] || status };
  }, [status, isDone]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-[var(--cmms-text-secondary)]">
        <Spinner /> กำลังโหลดใบงาน…
      </div>
    );
  }

  if (!wo) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8">
          <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden="true" />
          <p className="m-0">ไม่พบใบงาน #{woId}</p>
          <Link href="/field">กลับหน้าโหมดภาคสนาม</Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-center justify-between gap-2">
        <Link href="/field" className="inline-flex items-center gap-1 text-sm no-underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> กลับ
        </Link>
        <ConnectivityStatus variant="chip" />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <p className="cmms-eyebrow m-0">WORK MODE · FIELD</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="m-0 text-xl font-bold">{wo.work_order_no}</h1>
            <Badge variant={headerBadge.variant}>{headerBadge.label}</Badge>
            {wo.priority && <Badge variant={wo.priority === "urgent" || wo.priority === "emergency" ? "danger" : "warning"}>{wo.priority}</Badge>}
          </div>
          <p className="m-0 font-medium">{wo.title}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--cmms-text-secondary)]">
            {wo.asset_name && <span>เครื่อง: {wo.asset_name}</span>}
            {wo.assigned_name && <span>ช่าง: {wo.assigned_name}</span>}
            {wo.actual_start_at && <span>เริ่ม: {wo.actual_start_at}</span>}
          </div>
        </CardContent>
      </Card>

      {/* ───── Action bar (ใหญ่ ใช้นิ้วกดสะดวก) ───── */}
      {!isDone && (
        <div className="grid grid-cols-2 gap-3">
          {canAccept && (
            <Button variant="outline" className="h-14" loading={busy === "accept"} onClick={() => void run("accept", () => acceptWork(woId), { status: "accepted" })}>
              <Hand className="mr-2 h-5 w-5" aria-hidden="true" /> รับงาน
            </Button>
          )}
          {canStart && (
            <Button className="h-14" loading={busy === "start"} onClick={() => void run("start", () => startWork(woId), { status: "in_progress" })}>
              <Play className="mr-2 h-5 w-5" aria-hidden="true" /> เริ่มงาน
            </Button>
          )}
          {canResume && (
            <Button className="h-14" loading={busy === "resume"} onClick={() => void run("resume", () => resumeWork(woId), { status: "in_progress" })}>
              <Undo2 className="mr-2 h-5 w-5" aria-hidden="true" /> กลับมาทำ
            </Button>
          )}
          {canPause && (
            <Button variant="secondary" className="h-14" onClick={() => setPauseOpen(true)}>
              <Pause className="mr-2 h-5 w-5" aria-hidden="true" /> หยุดพัก
            </Button>
          )}
          {canComplete && (
            <Button variant="danger" className="col-span-2 h-14" onClick={() => setCompleteOpen(true)}>
              <CheckCircle2 className="mr-2 h-5 w-5" aria-hidden="true" /> ปิดงาน (ส่งตรวจรับ)
            </Button>
          )}
        </div>
      )}

      {isDone && (
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-6 w-6 text-[var(--cmms-success)]" aria-hidden="true" />
            <p className="m-0">ใบงานนี้{DONE_STATUSES.includes(status) && status === "completed" ? "ส่งตรวจรับแล้ว" : "ปิดแล้ว"} — ไม่มีรายการให้ทำต่อ</p>
          </CardContent>
        </Card>
      )}

      {/* ───── รายละเอียดปัญหา ───── */}
      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <h2 className="m-0 text-base font-bold">รายละเอียดงาน</h2>
          <p className="m-0 whitespace-pre-wrap text-sm">{wo.description || wo.failure_report || "— ไม่ระบุ —"}</p>
        </CardContent>
      </Card>

      {/* ───── วินิจฉัย / วิธีแก้ ───── */}
      {!isDone && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <h2 className="m-0 text-base font-bold">บันทึกการวินิจฉัย</h2>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--cmms-text-secondary)]">สาเหตุ (Diagnosis)</span>
              <textarea
                value={diag.diagnosis}
                onChange={(e) => setDiag((d) => ({ ...d, diagnosis: e.target.value }))}
                rows={2}
                className="rounded-lg border p-3 text-base"
                style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg)" }}
                placeholder="สิ่งที่พบจากการตรวจสอบ"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--cmms-text-secondary)]">รากของปัญหา (Root cause)</span>
              <textarea
                value={diag.root_cause}
                onChange={(e) => setDiag((d) => ({ ...d, root_cause: e.target.value }))}
                rows={2}
                className="rounded-lg border p-3 text-base"
                style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg)" }}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--cmms-text-secondary)]">วิธีแก้ไข (Solution)</span>
              <textarea
                value={diag.solution}
                onChange={(e) => setDiag((d) => ({ ...d, solution: e.target.value }))}
                rows={2}
                className="rounded-lg border p-3 text-base"
                style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg)" }}
              />
            </label>
            <Button
              variant="secondary"
              className="h-12"
              loading={busy === "diag"}
              onClick={() => void run("diag", () => saveDiagnosis(woId, diag))}
            >
              <Save className="mr-2 h-5 w-5" aria-hidden="true" /> บันทึกผลวินิจฉัย
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ───── รูปหลักฐาน ───── */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="m-0 flex items-center gap-2 text-base font-bold">
              <Camera className="h-5 w-5" aria-hidden="true" /> รูปหลักฐาน
            </h2>
            <span className="text-sm text-[var(--cmms-text-secondary)]">{photoCount} รูป</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {!isDone && (
              <>
                <Button variant="outline" className="h-12" loading={busy === "photo"} onClick={() => fileRef.current?.click()}>
                  ถ่าย/เลือกรูป
                </Button>
                <label className="flex h-12 items-center">
                  <span className="sr-only">หมวดรูป</span>
                  <select
                    id="photo-cat"
                    className="h-12 w-full rounded-lg border px-3 text-base"
                    style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg)" }}
                    onChange={(e) => {
                      const el = e.target as HTMLSelectElement;
                      el.dataset.cat = el.value;
                    }}
                    defaultValue="failure_image"
                  >
                    <option value="failure_image">ก่อนซ่อม</option>
                    <option value="after_image">หลังซ่อม</option>
                    <option value="other">อื่น ๆ</option>
                  </select>
                </label>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const sel = document.getElementById("photo-cat") as HTMLSelectElement | null;
              const cat = (sel?.value as PhotoCategory) || "failure_image";
              void onPickPhoto(e, cat);
            }}
          />
          <p className="m-0 text-xs text-[var(--cmms-text-secondary)]">
            รูปจะถูกบีบอัดและเก็บในเครื่องก่อน — อัปโหลดอัตโนมัติเมื่อมีสัญญาณ
          </p>
        </CardContent>
      </Card>

      {/* ───── Pause modal ───── */}
      {pauseOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="หยุดพักงาน">
          <Card style={{ width: "100%", maxWidth: 420 }}>
            <CardContent className="flex flex-col gap-3 p-4">
              <h2 className="m-0 text-lg font-bold">หยุดพักงาน</h2>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--cmms-text-secondary)]">เหตุผล</span>
                <select
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  className="h-12 rounded-lg border px-3 text-base"
                  style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg)" }}
                >
                  {PAUSE_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--cmms-text-secondary)]">หมายเหตุ (ไม่บังคับ)</span>
                <input
                  value={pauseNote}
                  onChange={(e) => setPauseNote(e.target.value)}
                  className="h-12 rounded-lg border px-3 text-base"
                  style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg)" }}
                />
              </label>
              <div className="flex gap-3">
                <Button variant="ghost" className="h-12 flex-1" onClick={() => setPauseOpen(false)}>ยกเลิก</Button>
                <Button
                  variant="secondary"
                  className="h-12 flex-1"
                  loading={busy === "pause"}
                  onClick={async () => {
                    const outcome = await run("pause", () => pauseWork(woId, pauseReason, pauseNote), { status: pauseReason === "waiting_parts" ? "waiting_parts" : "paused" });
                    if (outcome !== "failed") setPauseOpen(false);
                  }}
                >
                  ยืนยันหยุดพัก
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ───── Complete modal ───── */}
      {completeOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="ปิดงาน">
          <Card style={{ width: "100%", maxWidth: 460, maxHeight: "92dvh", overflowY: "auto" }}>
            <CardContent className="flex flex-col gap-3 p-4">
              <h2 className="m-0 text-lg font-bold">ปิดงาน — ส่งตรวจรับ</h2>
              <div className="rounded-lg p-3 text-sm" style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}>
                <AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden="true" />
                ต้องระบุผลตรวจการปนเปื้อนก่อนปิดงาน (ข้อกำหนดโรงงานอาหาร)
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--cmms-text-secondary)]">ผลตรวจการปนเปื้อน</span>
                <select
                  value={contam}
                  onChange={(e) => setContam(e.target.value)}
                  className="h-12 rounded-lg border px-3 text-base"
                  style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg)" }}
                >
                  {CONTAM_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--cmms-text-secondary)]">สรุปวิธีแก้ไข (Resolution)</span>
                <textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={3}
                  className="rounded-lg border p-3 text-base"
                  style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg)" }}
                  placeholder="สรุปสิ่งที่ทำเพื่อปิดงาน"
                />
              </label>
              <div className="flex gap-3">
                <Button variant="ghost" className="h-12 flex-1" onClick={() => setCompleteOpen(false)}>ยกเลิก</Button>
                <Button
                  variant="danger"
                  className="h-12 flex-1"
                  loading={busy === "complete"}
                  onClick={async () => {
                    const outcome = await run(
                      "complete",
                      () => completeWork(woId, { contaminate_checking: contam, resolution, ...diag }),
                      { status: "completed" }
                    );
                    if (outcome !== "failed") setCompleteOpen(false);
                  }}
                >
                  ยืนยันปิดงาน
                </Button>
              </div>
              <p className="m-0 text-xs text-[var(--cmms-text-secondary)]">
                <Wrench className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                หลังปิดงานแล้วหัวหน้างานจะตรวจรับ (verify) ต่อไป
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
