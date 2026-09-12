"use client";

import { useEffect, useState } from "react";
import { mutateSupervisor, assignWork, getTechnicians } from "@/lib/supervisor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ToastProvider";

type ThenFn = () => void;

function useMutate(okMsg: string, then?: ThenFn) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (payload: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setErr(null);
    try {
      await mutateSupervisor(payload);
      if (okMsg) showToast("success", okMsg);
      then?.();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, setErr, run };
}

/* ───────────── Assign (1 รายการ หรือ bulk) ───────────── */

export function AssignDialog({
  ids,
  codes,
  open,
  onOpenChange,
  onDone,
}: {
  ids: number[];
  codes: string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: ThenFn;
}) {
  const { showToast } = useToast();
  const [techs, setTechs] = useState<{ id: number; full_name: string }[]>([]);
  const [lead, setLead] = useState<string>("");
  const [team, setTeam] = useState<number[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      getTechnicians()
        .then((r) => {
          const list = (r.items || []).map((x) => ({ id: x.id, full_name: x.full_name }));
          setTechs(list);
          if (!lead && list.length) setLead(String(list[0].id));
        })
        .catch(() => {});
      setErr(null);
      setConflicts(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (uid: number) =>
    setTeam((p) => (p.includes(uid) ? p.filter((u) => u !== uid) : [...p, uid]));

  const submit = async () => {
    const lid = Number(lead);
    if (!lid) {
      setErr("ต้องเลือกหัวหน้าชุดรับผิดชอบ (Lead)");
      return;
    }
    const teamIds = [...new Set([...team.filter((u) => u !== lid), lid])];
    setBusy(true);
    setErr(null);
    setConflicts(null);
    try {
      const res = await assignWork({
        action: ids.length > 1 ? "bulk_assign" : "assign",
        ids: ids.length > 1 ? ids : undefined,
        id: ids.length === 1 ? ids[0] : undefined,
        lead_id: lid,
        team_ids: teamIds,
        planned_start_at: start || undefined,
        planned_end_at: end || undefined,
        note: note || undefined,
        force: force || undefined,
      });
      const failed = (res.results || []).filter((r) => !r.success);
      if (!res.success && failed.length && !force) {
        setErr(failed.map((f) => `${f.code || f.id}: ${f.error || ""}`).join("\n"));
        const cList = failed.filter((f) => Array.isArray(f.conflicts) && f.conflicts.length);
        if (cList.length)
          setConflicts(`มีงานขัดกับช่วงเวลาที่วางแผนของทีม ${cList.length} รายการ — ต้องเลือก "บังคับมอบหมาย" หรือเลื่อนเวลา`);
      } else if (!res.success && failed.length) {
        showToast("error", `มอบหมายบางรายการไม่สำเร็จ (${failed.length})`);
        onDone?.();
        onOpenChange(false);
      } else {
        showToast("success", `มอบหมายงานแล้ว ${ids.length} ใบ`);
        onDone?.();
        onOpenChange(false);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={`มอบหมายงาน${ids.length > 1 ? ` (${ids.length} ใบ)` : ""}`}
      description={codes.join(", ")}
      className="sm:max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "กำลังมอบหมาย…" : "มอบหมายงาน"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && <Alert variant="danger" className="whitespace-pre-line">{err}</Alert>}
        {conflicts && <Alert variant="warning">{conflicts}</Alert>}
        <div className="space-y-2">
          <Label>หัวหน้าชุด (Lead)</Label>
          <Select value={lead} onValueChange={setLead}>
            <SelectTrigger><SelectValue placeholder="เลือกช่าง" /></SelectTrigger>
            <SelectContent>
              {techs.map((x) => (
                <SelectItem key={x.id} value={String(x.id)}>{x.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>ทีมช่าง (เพิ่มเติม)</Label>
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
            {techs.map((x) => (
              <label key={x.id} className="flex items-center gap-2 py-0.5 text-sm">
                <Checkbox checked={team.includes(x.id)} onCheckedChange={() => toggle(x.id)} />
                {String(x.id) === lead ? <span className="font-semibold">{x.full_name} (lead)</span> : x.full_name}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>เริ่มวางแผน</Label>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>สิ้นสุดวางแผน</Label>
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>หมายเหตุ (แจ้งผ่าน LINE)</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={force} onCheckedChange={(v) => setForce(Boolean(v))} />
          บังคับมอบหมาย (ข้าม conflict check)
        </label>
      </div>
    </Dialog>
  );
}

/* ───────────── Pause / Resume ───────────── */

export function PauseDialog({
  id,
  code,
  open,
  onOpenChange,
  onDone,
}: {
  id: number;
  code: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: ThenFn;
}) {
  const { busy, err, setErr, run } = useMutate("หยุดพักงานแล้ว", onDone);
  const [reason, setReason] = useState("waiting_parts");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) { setErr(null); setReason("waiting_parts"); setNote(""); }
  }, [open, setErr]);

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={`หยุดพักงาน ${code}`}
      description="ต้องระบุเหตุผล — ระบบบันทึก Log การหยุดพัก"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button variant="secondary" onClick={() => run({ action: "pause", id, reason, note })} disabled={busy}>
            {busy ? "บันทึก…" : "หยุดพักงาน"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && <Alert variant="danger">{err}</Alert>}
        <div className="space-y-2">
          <Label>เหตุผล</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="waiting_parts">รออะไหล่ (Waiting Parts)</SelectItem>
              <SelectItem value="waiting_spare">รอเบิกอะไหล่จากคลัง</SelectItem>
              <SelectItem value="production_stop">หยุดผลิต / รอเครื่องกลับมาเดิน</SelectItem>
              <SelectItem value="contractor">รอหน่วยภายนอก / งานจ้างเหมา</SelectItem>
              <SelectItem value="waiting_approval">รออนุมัติเพิ่มเติม</SelectItem>
              <SelectItem value="other">อื่น ๆ</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>รายละเอียด (ไม่บังคับ)</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>
      </div>
    </Dialog>
  );
}

export function ResumeButton({ id, onDone }: { id: number; onDone?: ThenFn }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await mutateSupervisor({ action: "resume", id });
          showToast("success", "กลับมาทำงานต่อแล้ว");
          onDone?.();
        } catch (e) {
          showToast("error", e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
        } finally {
          setBusy(false);
        }
      }}
    >
      กลับมาทำ
    </Button>
  );
}

/* ───────────── Verify / Close / Reopen ───────────── */

export function VerifyDialog({
  id,
  code,
  open,
  onOpenChange,
  onDone,
}: {
  id: number;
  code: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: ThenFn;
}) {
  const { busy, err, setErr, run } = useMutate("ตรวจรับงานแล้ว", onDone);
  const [note, setNote] = useState("");
  const [autoClose, setAutoClose] = useState(true);

  useEffect(() => {
    if (open) { setErr(null); setNote(""); setAutoClose(true); }
  }, [open, setErr]);

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={`ตรวจรับงาน ${code}`}
      description="ยืนยันว่างานสำเร็จตามเงื่อนไข — ไม่ตรวจซ้ำ"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={() => run({ action: "verify", id, decision: "approved", note, auto_close: autoClose })} disabled={busy}>
            {busy ? "บันทึก…" : "ตรวจรับ (Verified)"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && <Alert variant="danger">{err}</Alert>}
        <div className="space-y-2">
          <Label>บันทึกการตรวจรับ</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={autoClose} onCheckedChange={(v) => setAutoClose(Boolean(v))} />
          ปิดใบงานเลย (Verified + Closed)
        </label>
      </div>
    </Dialog>
  );
}

export function CloseButton({ id, code, onDone }: { id: number; code: string; onDone?: ThenFn }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await mutateSupervisor({ action: "close", id });
          showToast("success", `ปิดใบงาน ${code} แล้ว`);
          onDone?.();
        } catch (e) {
          showToast("error", e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
        } finally {
          setBusy(false);
        }
      }}
    >
      ปิดใบงาน
    </Button>
  );
}

export function ReopenDialog({
  id,
  code,
  open,
  onOpenChange,
  onDone,
}: {
  id: number;
  code: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: ThenFn;
}) {
  const { busy, err, setErr, run } = useMutate("เปิดงานใหม่แล้ว", onDone);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) { setErr(null); setReason(""); }
  }, [open, setErr]);

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={`เปิดงานใหม่ ${code}`}
      description="งานถูกส่งกลับให้ช่างแก้ไข — ต้องระบุเหตุผล"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button variant="danger" onClick={() => run({ action: "verify", id, decision: "reopen", reopen_reason: reason })} disabled={busy || !reason.trim()}>
            {busy ? "บันทึก…" : "เปิดงานใหม่"}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {err && <Alert variant="danger">{err}</Alert>}
        <Label>เหตุผล</Label>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
      </div>
    </Dialog>
  );
}