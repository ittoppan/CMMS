"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, TriangleAlert } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { PageShell } from "@/components/PageShell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { sendOrEnqueueDetailed } from "@/lib/offlineQueue";
import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import {
  WORKFORCE_API,
  fmtMinutes,
  type LeaveRow,
  type ShiftRecord,
} from "@/lib/workforce";

/**
 * app/(dashboard)/workforce/shifts/page.tsx — shifts & leave (Phase 34)
 *
 * ความซื่อสัตย์ของข้อมูลที่หน้านี้บังคับ:
 *  - คอลัมน์ "ที่มา" แยกให้ชัดว่าเวลาทำงานมาจาก `wf_shift_assignments` หรือค่าเริ่มต้น
 *    ใน settings — ค่าเริ่มต้นไม่ใช่ตารางงานจริงของคนนั้น
 *  - วันลาที่ `approved` เท่านั้นที่หักความจุ; `planned` แสดงเป็นคำเตือนเท่านั้น
 *    เพราะยังไม่ใช่ข้อตกลงที่ผูกพัน
 *  - ทุกการบันทึกผ่าน sendOrEnqueue และแนบ reason เมื่อระบบกำหนด require_reason
 */

const DOW = [
  { v: 1, label: "จ" },
  { v: 2, label: "อ" },
  { v: 3, label: "พ" },
  { v: 4, label: "พฤ" },
  { v: 5, label: "ศ" },
  { v: 6, label: "ส" },
  { v: 7, label: "อา" },
];

const LEAVE_TYPES: Array<{ v: LeaveRow["leave_type"]; label: string }> = [
  { v: "annual", label: "ลาพักร้อน" },
  { v: "sick", label: "ลาป่วย" },
  { v: "unpaid", label: "ลาจ่ายเงินเดือน" },
  { v: "training", label: "อบรม" },
  { v: "other", label: "อื่น ๆ" },
];

const LEAVE_STATUS: Array<{ v: LeaveRow["status"]; label: string }> = [
  { v: "planned", label: "วางแผน" },
  { v: "approved", label: "อนุมัติแล้ว" },
  { v: "rejected", label: "ไม่อนุมัติ" },
  { v: "cancelled", label: "ยกเลิก" },
];

const LEAVE_STATUS_VARIANT: Record<
  LeaveRow["status"],
  "neutral" | "success" | "danger" | "warning"
> = {
  planned: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

function parseWorkDays(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((d) => parseInt(d.trim(), 10))
    .filter((d) => d >= 1 && d <= 7);
}

function hhmmToMinutes(v: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(v.trim());
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function shortTime(v: string): string {
  return v.slice(0, 5);
}

function firstOfMonth(): string {
  return new Date().toISOString().slice(0, 8) + "01";
}

function endOfNextMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

function isoAddDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function WorkforceShiftsPage() {
  const hero = usePageHero("workforce/shifts");
  const qc = useQueryClient();

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(endOfNextMonth);

  const [shiftTarget, setShiftTarget] = useState<{
    userId: number;
    name: string;
    existing: ShiftRecord | null;
  } | null>(null);
  const [shiftUser, setShiftUser] = useState<number | "">("");
  const [leaveUser, setLeaveUser] = useState<number | "">("");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [banner, setBanner] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(null);

  const { data: cfg } = useApiQuery<{
    config: { require_reason: number | boolean };
    can: { manage: boolean };
  }>(["workforce", "config"], `${WORKFORCE_API}?action=config`);

  const { data: options } = useApiQuery<{
    people: Array<{ id: number; full_name: string; employee_code: string | null; department_id: number | null }>;
  }>(["workforce", "options"], `${WORKFORCE_API}?action=options`);

  const { data: shiftData, isLoading: shiftsLoading } = useApiQuery<{ shifts: ShiftRecord[] }>(
    ["workforce", "shifts"],
    `${WORKFORCE_API}?action=shifts`
  );

  const { data: leaveData, isLoading: leaveLoading } = useApiQuery<{
    leave: LeaveRow[];
  }>(["workforce", "leave", from, to], `${WORKFORCE_API}?action=leave&from=${from}&to=${to}`);

  const canManage = cfg?.can.manage === true;
  const requireReason = cfg?.config.require_reason === 1 || cfg?.config.require_reason === true;

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 8000);
    return () => clearTimeout(t);
  }, [banner]);

  const saveShift = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      sendOrEnqueueDetailed({
        url: WORKFORCE_API,
        method: "POST",
        body,
        kind: "workforce_shift",
        label: `บันทึกกะของ ${options?.people.find((p) => p.id === body.user_id)?.full_name ?? "ช่าง"}`,
      }),
    onSuccess: (res, body) => {
      if (res.outcome === "sent") {
        setBanner({ tone: "success", text: "บันทึกกะทำงานเรียบร้อย" });
        setShiftTarget(null);
        setShiftUser("");
        void qc.invalidateQueries({ queryKey: ["workforce"] });
      } else if (res.outcome === "queued") {
        setBanner({
          tone: "warning",
          text: "บันทึกไว้ในคิวออฟไลน์แล้ว — จะส่งอัตโนมัติเมื่อกลับมาออนไลน์",
        });
        setShiftTarget(null);
        setShiftUser("");
      } else {
        setBanner({
          tone: "danger",
          text: res.message ? `บันทึกกะไม่สำเร็จ: ${res.message}` : "บันทึกกะไม่สำเร็จ โปรดลองอีกครั้ง",
        });
      }
      void body;
    },
  });

  const saveLeave = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      sendOrEnqueueDetailed({
        url: WORKFORCE_API,
        method: "POST",
        body,
        kind: "workforce_leave",
        label: `บันทึกวันลาของ ${options?.people.find((p) => p.id === body.user_id)?.full_name ?? "ช่าง"}`,
      }),
    onSuccess: (res) => {
      if (res.outcome === "sent") {
        setBanner({ tone: "success", text: "บันทึกวันลาเรียบร้อย" });
        setLeaveOpen(false);
        void qc.invalidateQueries({ queryKey: ["workforce"] });
      } else if (res.outcome === "queued") {
        setBanner({ tone: "warning", text: "บันทึกไว้ในคิวออฟไลน์แล้ว" });
        setLeaveOpen(false);
      } else {
        setBanner({
          tone: "danger",
          text: res.message ? `บันทึกวันลาไม่สำเร็จ: ${res.message}` : "บันทึกวันลาไม่สำเร็จ",
        });
      }
    },
  });

  const noShiftIds = useMemo(() => {
    const withShift = new Set((shiftData?.shifts ?? []).map((s) => s.user_id));
    return (options?.people ?? []).filter((p) => !withShift.has(p.id));
  }, [shiftData?.shifts, options?.people]);

  const shiftColumns: SimpleColumn<ShiftRecord>[] = [
    {
      key: "full_name",
      header: "ช่าง",
      renderCell: (r) => <span className="font-medium">{r.full_name}</span>,
    },
    {
      key: "window",
      header: "เวลาทำงาน",
      renderCell: (r) => {
        const net = hhmmToMinutes(r.shift_end) - hhmmToMinutes(r.shift_start) - r.break_minutes;
        return (
          <div>
            <div className="font-medium">
              {shortTime(r.shift_start)}–{shortTime(r.shift_end)}
            </div>
            <div className="text-xs text-muted-foreground">
              พัก {r.break_minutes} นาที · สุทธิ {fmtMinutes(net)}
            </div>
          </div>
        );
      },
    },
    {
      key: "work_days",
      header: "วันทำงาน",
      renderCell: (r) => {
        const days = parseWorkDays(r.work_days);
        return (
          <div className="flex flex-wrap gap-1">
            {DOW.map((d) => (
              <Badge key={d.v} variant={days.includes(d.v) ? "info" : "neutral"}>
                {d.label}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: "overtime_allowed",
      header: "ล่วงเวลา",
      align: "center",
      renderCell: (r) =>
        r.overtime_allowed ? <Badge variant="success">อนุญาต</Badge> : <Badge variant="neutral">ไม่อนุญาต</Badge>,
    },
    {
      key: "effective",
      header: "มีผล",
      renderCell: (r) => (
        <div className="text-sm">
          {r.effective_from ?? "ตลอดกาล"}
          {r.effective_to ? ` → ${r.effective_to}` : ""}
        </div>
      ),
    },
    {
      key: "source",
      header: "ที่มา",
      renderCell: (r) => (
        <Badge variant="info">
          <span className="sr-only">ที่มา: </span>กะรายบุคคล
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      hideLabelOnMobile: true,
      enableSorting: false,
      renderCell: (r) => (
        <Button
          size="sm"
          variant="outline"
          disabled={!canManage}
          onClick={() => setShiftTarget({ userId: r.user_id, name: r.full_name ?? "ช่าง", existing: r })}
        >
          แก้ไข
        </Button>
      ),
    },
  ];

  const leaveColumns: SimpleColumn<LeaveRow>[] = [
    {
      key: "full_name",
      header: "ช่าง",
      renderCell: (r) => <span className="font-medium">{r.full_name}</span>,
    },
    {
      key: "leave_type",
      header: "ประเภท",
      renderCell: (r) => LEAVE_TYPES.find((t) => t.v === r.leave_type)?.label ?? r.leave_type,
    },
    {
      key: "span",
      header: "ช่วงวัน",
      renderCell: (r) => (
        <div>
          <div>
            {r.start_date} → {r.end_date}
          </div>
          <div className="text-xs text-muted-foreground">{r.days} วัน</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      renderCell: (r) => (
        <div className="space-y-1">
          <Badge variant={LEAVE_STATUS_VARIANT[r.status]}>{LEAVE_STATUS.find((s) => s.v === r.status)?.label}</Badge>
          {r.reduces_capacity ? (
            <div className="text-xs text-muted-foreground">หักความจุ</div>
          ) : r.status === "planned" ? (
            <div className="text-xs text-amber-600">ยังไม่หัก (รออนุมัติ)</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "reason",
      header: "เหตุผล",
      renderCell: (r) => <span className="text-sm text-muted-foreground">{r.reason || "—"}</span>,
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: hero.title, href: "/workforce" },
        { label: "กะและวันลา" },
      ]}
      title={hero.title}
      description={hero.desc}
    >
      <div className="space-y-6">
        {banner && (
          <Alert variant={banner.tone}>
            <div>{banner.text}</div>
          </Alert>
        )}

        {noShiftIds.length > 0 && (
          <Alert variant="warning">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            <div>
              ยังไม่มีข้อมูลกะรายบุคคลสำหรับ {noShiftIds.length} คน
              ({noShiftIds.slice(0, 3).map((p) => p.full_name).join(", ")}
              {noShiftIds.length > 3 ? " และอีก…" : ""}) — ความจุของพวกเขาตอนนี้มาจาก
              ค่าเริ่มต้นของระบบ ไม่ใช่ตารางงานจริง
            </div>
          </Alert>
        )}

        <Card>
          <CardHeader className="flex flex-wrap items-end justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              กะทำงานรายบุคคล
            </CardTitle>
            {canManage && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem]">
                  <Label htmlFor="shift-user">ช่าง</Label>
                  <Select
                    value={shiftUser === "" ? "__none__" : String(shiftUser)}
                    onValueChange={(v) => setShiftUser(v === "__none__" ? "" : Number(v))}
                  >
                    <SelectTrigger id="shift-user" className="mt-1">
                      <SelectValue placeholder="เลือกช่าง" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— เลือกช่าง —</SelectItem>
                      {(options?.people ?? []).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  disabled={shiftUser === ""}
                  onClick={() => {
                    const pid = Number(shiftUser);
                    const person = options?.people.find((p) => p.id === pid);
                    setShiftTarget({
                      userId: pid,
                      name: person?.full_name ?? "ช่าง",
                      existing: null,
                    });
                  }}
                >
                  เพิ่ม/กำหนดกะ
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ผู้ที่ไม่มีรายการในตารางนี้จะใช้ค่าเริ่มต้นจากตั้งค่าแผนงาน —
              ลงกะเพื่อให้ตัวเลขความจุและการมอบหมายอิงข้อมูลจริง
            </p>
            <SimpleDataTable<ShiftRecord>
              columns={shiftColumns}
              data={shiftData?.shifts ?? []}
              idKey="id"
              loading={shiftsLoading}
              skeletonRows={6}
              pageSize={15}
              caption="กะทำงานรายบุคคล"
              emptyTitle="ยังไม่มีกะรายบุคคล"
              emptyDescription="ทุกช่างกำลังใช้ค่าเริ่มต้นจากตั้งค่าแผนงาน"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-wrap items-end justify-between gap-3">
            <CardTitle>วันลา</CardTitle>
            {canManage && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem]">
                  <Label htmlFor="leave-user">ช่าง</Label>
                  <Select
                    value={leaveUser === "" ? "__none__" : String(leaveUser)}
                    onValueChange={(v) => setLeaveUser(v === "__none__" ? "" : Number(v))}
                  >
                    <SelectTrigger id="leave-user" className="mt-1">
                      <SelectValue placeholder="เลือกช่าง" />
                    </SelectTrigger>
                    <SelectContent>
                      {(options?.people ?? []).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  disabled={leaveUser === ""}
                  variant="primary"
                  onClick={() => setLeaveOpen(true)}
                >
                  เพิ่มวันลา
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="lv-from" className="text-xs text-muted-foreground">
                  ตั้งแต่
                </label>
                <Input
                  id="lv-from"
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => e.target.value && setFrom(e.target.value)}
                  className="mt-1 w-[10.5rem]"
                />
              </div>
              <div>
                <label htmlFor="lv-to" className="text-xs text-muted-foreground">
                  ถึง
                </label>
                <Input
                  id="lv-to"
                  type="date"
                  value={to}
                  min={from}
                  onChange={(e) => e.target.value && setTo(e.target.value)}
                  className="mt-1 w-[10.5rem]"
                />
              </div>
            </div>
            <SimpleDataTable<LeaveRow>
              columns={leaveColumns}
              data={leaveData?.leave ?? []}
              idKey="id"
              loading={leaveLoading}
              skeletonRows={6}
              pageSize={15}
              caption="วันลาในช่วงที่เลือก"
              emptyTitle="ไม่มีวันลา"
              emptyDescription="ยังไม่มีรายการลาในช่วงวันที่เลือก"
            />
          </CardContent>
        </Card>
      </div>

      {shiftTarget && (
        <ShiftDialog
          personName={shiftTarget.name}
          record={shiftTarget.existing}
          canManage={canManage}
          requireReason={requireReason}
          pending={saveShift.isPending}
          onClose={() => setShiftTarget(null)}
          onSubmit={(body) => saveShift.mutate({ ...body, user_id: shiftTarget.userId })}
        />
      )}

      <LeaveDialog
        open={leaveOpen}
        personName={options?.people.find((p) => p.id === Number(leaveUser))?.full_name ?? ""}
        pending={saveLeave.isPending}
        onClose={() => setLeaveOpen(false)}
        onSubmit={(body) => saveLeave.mutate({ ...body, user_id: Number(leaveUser) })}
      />
    </PageShell>
  );
}

/* ── shift editor ─────────────────────────────────────────────────────── */

function ShiftDialog({
  personName,
  record,
  canManage,
  requireReason,
  pending,
  onClose,
  onSubmit,
}: {
  personName: string;
  record: ShiftRecord | null;
  canManage: boolean;
  requireReason: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("17:00");
  const [brk, setBrk] = useState(60);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [ot, setOt] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");

  const isNew = record === null;

  useEffect(() => {
    if (!record) {
      setStart("08:00");
      setEnd("17:00");
      setBrk(60);
      setDays([1, 2, 3, 4, 5]);
      setOt(false);
      setFrom("");
      setTo("");
      setReason("");
      return;
    }
    setStart(shortTime(record.shift_start));
    setEnd(shortTime(record.shift_end));
    setBrk(record.break_minutes);
    setDays(parseWorkDays(record.work_days));
    setOt(Boolean(record.overtime_allowed));
    setFrom(record.effective_from ?? "");
    setTo(record.effective_to ?? "");
    setReason("");
  }, [record]);

  const net = hhmmToMinutes(end) - hhmmToMinutes(start) - brk;
  const invalidDays = days.length === 0;
  const missingReason = requireReason && reason.trim() === "";

  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? `กำหนดกะให้ ${personName}` : `แก้ไขกะของ ${personName}`}
      description={
        isNew
          ? "กะนี้จะแทนค่าเริ่มต้นของระบบสำหรับช่างคนนี้ และมีผลต่อความจุ ความพร้อมตามกะ และการตรวจจับช่วงซ้อนกัน"
          : "กะนี้มีผลต่อความจุ ความพร้อมตามกะ และการตรวจจับช่วงซ้อนกันของตัวช่าง"
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button
            disabled={!canManage || pending || net <= 0 || invalidDays || missingReason}
            onClick={() =>
              onSubmit({
                action: "shift_save",
                shift_start: start,
                shift_end: end,
                break_minutes: brk,
                work_days: [...days].sort((a, b) => a - b).join(","),
                effective_from: from,
                effective_to: to,
                overtime_allowed: ot ? 1 : 0,
                reason: reason.trim(),
              })
            }
          >
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="sh-start">เริ่ม</Label>
            <Input id="sh-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sh-end">สิ้นสุด</Label>
            <Input id="sh-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="sh-break">พัก (นาที)</Label>
          <Input
            id="sh-break"
            type="number"
            min={0}
            step={5}
            value={brk}
            onChange={(e) => setBrk(Math.max(0, Number(e.target.value) || 0))}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            เวลาทำงานสุทธิต่อวัน: {fmtMinutes(Math.max(0, net))}
            {net <= 0 && <span className="ml-2 text-red-600">เวลาสิ้นสุดต้องหลังเวลาเริ่ม</span>}
          </p>
        </div>
        <div>
          <Label>วันทำงาน</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {DOW.map((d) => {
              const on = days.includes(d.v);
              return (
                <Button
                  key={d.v}
                  type="button"
                  size="sm"
                  variant={on ? "primary" : "outline"}
                  aria-pressed={on}
                  onClick={() =>
                    setDays((prev) => (on ? prev.filter((x) => x !== d.v) : [...prev, d.v].sort()))
                  }
                >
                  {d.label}
                </Button>
              );
            })}
          </div>
          {invalidDays && <p className="mt-1 text-xs text-red-600">ต้องเลือกอย่างน้อย 1 วัน</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="sh-from">มีผลตั้งแต่ (ว่าง = ตลอดกาล)</Label>
            <Input id="sh-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sh-e">ถึง (ว่าง = ไม่สิ้นสุด)</Label>
            <Input id="sh-e" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ot} onChange={(e) => setOt(e.target.checked)} />
          อนุญาตทำงานล่วงเวลา
        </label>
        <div>
          <Label htmlFor="sh-reason">
            เหตุผล {requireReason && <span className="text-red-600">*</span>}
          </Label>
          <Textarea
            id="sh-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}

/* ── leave entry ──────────────────────────────────────────────────────── */

function LeaveDialog({
  open,
  personName,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  personName: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState<LeaveRow["leave_type"]>("annual");
  const [start, setStart] = useState(isoAddDays(todayIso, 1));
  const [end, setEnd] = useState(isoAddDays(todayIso, 1));
  const [status, setStatus] = useState<LeaveRow["status"]>("approved");
  const [reason, setReason] = useState("");

  const invalid = end < start;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`เพิ่มวันลา${personName ? ` — ${personName}` : ""}`}
      description="เฉพาะสถานะ “อนุมัติแล้ว” เท่านั้นที่หักออกจากความจุ — “วางแผน” จะแสดงเป็นคำเตือนว่าเสี่ยงเกิน"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button
            disabled={!personName || pending || invalid}
            onClick={() =>
              onSubmit({
                action: "leave_save",
                leave_type: type,
                start_date: start,
                end_date: end,
                status,
                reason: reason.trim(),
              })
            }
          >
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="lv-type">ประเภท</Label>
            <Select value={type} onValueChange={(v) => setType(v as LeaveRow["leave_type"])}>
              <SelectTrigger id="lv-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t.v} value={t.v}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="lv-status">สถานะ</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as LeaveRow["status"])}>
              <SelectTrigger id="lv-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_STATUS.map((s) => (
                  <SelectItem key={s.v} value={s.v}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="lv-s">ตั้งแต่</Label>
            <Input id="lv-s" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="lv-e">ถึง</Label>
            <Input id="lv-e" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {invalid && <p className="text-sm text-red-600">วันสิ้นสุดต้องไม่ก่อนวันเริ่ม</p>}
        <div>
          <Label htmlFor="lv-r">เหตุผล</Label>
          <Textarea id="lv-r" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}
