"use client";

import { useState } from "react";
import { BellRing, CalendarClock, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/dashboard/kit";
import { useApiQuery, apiJson, type ApiError } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";

interface SchedConfig {
  id: number;
  name: string;
  resource: string;
  schedule: string;
  day_of_week: number | null;
  day_of_month: number | null;
  time: string;
  channels: string[];
  recipients: string[];
  filters: Record<string, string>;
  user_id: number;
  enabled: boolean;
  created_by: number;
  created_at: string;
  last_sent_at: string | null;
}

interface SchedPayload {
  configs: SchedConfig[];
  resources: Record<string, string>;
  schedules: { value: string; label: string; needDay: boolean }[];
  channels: { value: string; label: string }[];
  ranges: { value: string; label: string }[];
}

const WEEKDAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];

const CHANNEL_TONE: Record<string, string> = {
  telegram: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  line: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  email: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};

const CHANNEL_ICON: Record<string, string> = { telegram: "✈", line: "🔵", email: "✉" };

const PRIORITY_OPTIONS = [
  { value: "critical", label: "วิกฤต" },
  { value: "high", label: "สูง" },
  { value: "medium", label: "ปานกลาง" },
  { value: "low", label: "ต่ำ" },
];

const STATUS_OPTIONS = [
  { value: "open", label: "เปิด (รอรับงาน)" },
  { value: "assigned", label: "มอบหมายแล้ว" },
  { value: "in_progress", label: "กำลังซ่อม" },
  { value: "waiting_parts", label: "รออะไหล่" },
  { value: "pending_verification", label: "รอตรวจรับ" },
  { value: "verified", label: "ตรวจรับแล้ว" },
];

function scheduleLabel(cfg: SchedConfig, schedules: SchedPayload["schedules"]): string {
  const s = schedules.find((x) => x.value === cfg.schedule);
  if (cfg.schedule === "weekly") {
    const d = cfg.day_of_week ?? 1;
    return `${s?.label ?? "รายสัปดาห์"} · ${WEEKDAYS[d - 1]} · ${cfg.time}`;
  }
  if (cfg.schedule === "monthly") {
    return `${s?.label ?? "รายเดือน"} · วันที่ ${cfg.day_of_month ?? 1} · ${cfg.time}`;
  }
  return `${s?.label ?? "ทุกวัน"} · ${cfg.time}`;
}

export default function ScheduledReportsPage() {
  const hero = usePageHero("reports/scheduled");
  const { data, isLoading, error, refetch } = useApiQuery<SchedPayload>(
    ["report-scheduled"],
    "/api/v1/report_schedule.php"
  );

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SchedConfig>(() => emptyForm());

  function emptyForm(): SchedConfig {
    return {
      id: 0,
      name: "",
      resource: "center",
      schedule: "daily",
      day_of_week: 1,
      day_of_month: 1,
      time: "08:00",
      channels: ["telegram"],
      recipients: [],
      filters: { range: "30d" },
      user_id: 0,
      enabled: true,
      created_by: 0,
      created_at: "",
      last_sent_at: null,
    };
  }

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (cfg: SchedConfig) => {
    setEditingId(cfg.id);
    setForm({ ...cfg, recipients: cfg.recipients ?? [] });
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setFormError("ตั้งชื่อกำหนดการก่อนบันทึก");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload: any = { ...form };
      if (!editingId) delete payload.id;
      await apiJson("/api/v1/report_schedule.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: payload }),
      });
      setOpen(false);
      await refetch();
    } catch (err) {
      const e = err as ApiError;
      setFormError(String(e?.message ?? "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (cfg: SchedConfig) => {
    const next = { ...cfg, enabled: !cfg.enabled };
    try {
      await apiJson("/api/v1/report_schedule.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: next }),
      });
      await refetch();
    } catch (err) {
      const e = err as ApiError;
      alert(String(e?.message ?? "อัปเดตไม่สำเร็จ"));
    }
  };

  const remove = async (cfg: SchedConfig) => {
    if (!window.confirm(`ลบกำหนดการ "${cfg.name}"?`)) return;
    try {
      await apiJson(`/api/v1/report_schedule.php?id=${cfg.id}`, { method: "DELETE" });
      await refetch();
    } catch (err) {
      const e = err as ApiError;
      alert(String(e?.message ?? "ลบไม่สำเร็จ"));
    }
  };

  const setChannels = (v: string, on: boolean) => {
    setForm((f) => ({
      ...f,
      channels: on ? [...f.channels, v] : f.channels.filter((c) => c !== v),
    }));
  };

  const denied = error && (error.status === 403 || error.status === 401);
  const scheduleNeedDay = data?.schedules.find((s) => s.value === form.schedule)?.needDay;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              ผู้จัดการ / ผู้ดูแลระบบ
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{hero.desc}</p>
        </div>
      </div>

      {denied && (
        <Alert variant="danger">
          <div className="font-semibold">ไม่มีสิทธิ์ตั้งค่ารายงานอัตโนมัติ</div>
          <p>{String(error?.message ?? "")}</p>
        </Alert>
      )}

      {error && !denied && (
        <Alert variant="danger">
          <div className="font-semibold">โหลดรายการไม่สำเร็จ</div>
          <p>{String(error?.message ?? "")}</p>
        </Alert>
      )}

      <div className="no-print">
        <SectionHeading
          title="กำหนดการรายงานอัตโนมัติ"
          sub="ระบบส่งรายงานตามรอบเวลาผ่าน Telegram / LINE / Email — scan รันทุก 5 นาที (scripts/report_scheduler.php)"
          right={
            data && (
              <Button onClick={openNew}>
                <Plus size={15} aria-hidden="true" />
                เพิ่มกำหนดการ
              </Button>
            )
          }
        />
      </div>

      {/* รายการ */}
      {isLoading && !data && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="mt-2 h-4 w-72" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && data.configs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="cmms-icon-tile blue h-12 w-12 rounded-xl">
              <BellRing size={22} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="font-bold">ยังไม่มีกำหนดการรายงานอัตโนมัติ</p>
              <p className="text-sm text-muted-foreground">
                กด “เพิ่มกำหนดการ” เพื่อให้ระบบส่งรายงานเข้าช่องทางที่ต้องการตามรอบเวลา
              </p>
            </div>
            <Button onClick={openNew}>
              <Plus size={15} aria-hidden="true" />
              เพิ่มกำหนดการแรก
            </Button>
          </CardContent>
        </Card>
      )}

      {data && data.configs.length > 0 && (
        <div className="space-y-3">
          {data.configs.map((cfg) => (
            <Card key={cfg.id}>
              <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{cfg.name}</h3>
                    <Badge variant={cfg.enabled ? "success" : "neutral"}>
                      {cfg.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                    </Badge>
                  </div>
                  <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarClock size={14} aria-hidden="true" />
                    {scheduleLabel(cfg, data.schedules)}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium text-foreground">
                      {data.resources[cfg.resource] ?? cfg.resource}
                    </span>
                    {Object.keys(cfg.filters ?? {}).length > 0 && (
                      <span className="text-muted-foreground">
                        {" · ตัวกรอง: "}
                        {Object.entries(cfg.filters)
                          .map(([k, v]) => `${k}=${v || "-"}`)
                          .join(", ")}
                      </span>
                    )}
                  </p>
                  {cfg.last_sent_at && (
                    <p className="text-xs text-muted-foreground">ส่งล่าสุด {cfg.last_sent_at}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    {(cfg.channels ?? []).map((ch) => (
                      <span
                        key={ch}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${CHANNEL_TONE[ch] ?? "bg-muted text-muted-foreground"}`}
                      >
                        <span aria-hidden="true">{CHANNEL_ICON[ch] ?? "•"}</span>
                        {data.channels.find((c) => c.value === ch)?.label ?? ch}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(cfg)} aria-label={`แก้ไข ${cfg.name}`}>
                      <Pencil size={14} aria-hidden="true" />
                      แก้ไข
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(cfg)} aria-label={`ลบ ${cfg.name}`}>
                      <Trash2 size={14} aria-hidden="true" />
                      ลบ
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-border px-2 py-1">
                    <input type="checkbox" role="switch" aria-label="เปิด/ปิดใช้งาน" className="sr-only" />
                    <button
                      type="button"
                      role="switch"
                      aria-checked={cfg.enabled}
                      aria-label={`เปิด/ปิด ${cfg.name}`}
                      onClick={() => toggleEnabled(cfg)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${cfg.enabled ? "bg-[var(--cmms-primary)]" : "bg-input"}`}
                    >
                      <span
                        className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${cfg.enabled ? "translate-x-5" : "translate-x-0"}`}
                      />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ฟอร์มเพิ่ม/แก้ไข */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "แก้ไขกำหนดการรายงาน" : "เพิ่มกำหนดการรายงาน"}
        description="ระบุรายงาน, รอบเวลา และช่องทางส่ง — ระบบจะส่งตามกำหนดโดยอัตโนมัติ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button loading={saving} onClick={save}>
              บันทึกกำหนดการ
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <Alert variant="danger">
              <p>{formError}</p>
            </Alert>
          )}

          <div className="space-y-2">
            <Input
              label="ชื่อกำหนดการ"
              placeholder="เช่น รายงานค่าใช้จ่ายรายเดือนให้ผู้จัดการ"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">รายงาน</label>
              <Select
                value={form.resource}
                onValueChange={(v) => setForm((f) => ({ ...f, resource: v }))}
              >
                <SelectTrigger aria-label="เลือกรายงาน" className="w-full">
                  <SelectValue placeholder="เลือกรายงาน" />
                </SelectTrigger>
                <SelectContent>
                  {data &&
                    Object.entries(data.resources).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">รอบเวลา</label>
              <Select
                value={form.schedule}
                onValueChange={(v) => setForm((f) => ({ ...f, schedule: v }))}
              >
                <SelectTrigger aria-label="รอบเวลา" className="w-full">
                  <SelectValue placeholder="รอบเวลา" />
                </SelectTrigger>
                <SelectContent>
                  {data &&
                    data.schedules.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {form.schedule === "weekly" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">วันในสัปดาห์</label>
                <Select
                  value={String(form.day_of_week ?? 1)}
                  onValueChange={(v) => setForm((f) => ({ ...f, day_of_week: Number(v) }))}
                >
                  <SelectTrigger aria-label="วันในสัปดาห์" className="w-full">
                    <SelectValue placeholder="วัน" />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.schedule === "monthly" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">วันในเดือน (1-28)</label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  aria-label="วันในเดือน"
                  value={form.day_of_month ?? 1}
                  onChange={(e) => setForm((f) => ({ ...f, day_of_month: Number(e.target.value) }))}
                />
              </div>
            )}
            {scheduleNeedDay === false && <div className="hidden sm:block" />}
            <div className="space-y-2">
              <label className="text-sm font-medium">เวลา (HH:MM)</label>
              <Input
                type="time"
                aria-label="เวลาส่ง"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">ช่องทางส่ง</label>
            <div className="flex flex-wrap gap-4">
              {data &&
                data.channels.map((ch) => (
                  <label key={ch.value} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={form.channels.includes(ch.value)} onCheckedChange={(c) => setChannels(ch.value, !!c)} />
                    {ch.label}
                  </label>
                ))}
            </div>
          </div>

          {form.channels.includes("email") && (
            <div className="space-y-2">
              <Input
                label="ผู้รับอีเมล (คั่นด้วย ,)"
                placeholder="manager@example.com, eng@example.com"
                value={form.recipients.join(", ")}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    recipients: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">ตัวกรองข้อมูล</label>
            <div className="grid gap-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  value={form.filters.range ?? "30d"}
                  onValueChange={(v) => setForm((f) => ({ ...f, filters: { ...f.filters, range: v } }))}
                >
                  <SelectTrigger aria-label="ช่วงเวลา" className="w-full">
                    <SelectValue placeholder="ช่วงเวลา" />
                  </SelectTrigger>
                  <SelectContent>
                    {data &&
                      data.ranges.map((r) => (
                        <SelectItem key={r.value || "__all__"} value={r.value || "__all__"}>
                          {r.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select
                  value={(form.filters.status ?? "") === "" ? "__all__" : form.filters.status}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      filters: { ...f.filters, status: v === "__all__" ? "" : v },
                    }))
                  }
                >
                  <SelectTrigger aria-label="สถานะ" className="w-full">
                    <SelectValue placeholder="สถานะ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">สถานะทั้งหมด</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  value={(form.filters.priority ?? "") === "" ? "__all__" : form.filters.priority}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      filters: { ...f.filters, priority: v === "__all__" ? "" : v },
                    }))
                  }
                >
                  <SelectTrigger aria-label="ความสำคัญ" className="w-full">
                    <SelectValue placeholder="ความสำคัญ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">ทุกความสำคัญ</SelectItem>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="month"
                  label="เดือน (ปี-เดือน)"
                  isLabelHidden
                  aria-label="เดือน"
                  value={(form.filters.year ?? "") === "" ? "" : `${form.filters.year}-${form.filters.month ?? "01"}`}
                  onChange={(e) => {
                    const [y, m] = (e.target.value || "").split("-");
                    setForm((f) => ({ ...f, filters: { ...f.filters, year: y || "", month: m ?? "" } }));
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldAlert size={14} aria-hidden="true" />
            การส่งรายงานจะถูกบังคับขอบเขตข้อมูลตามบทบาทผู้ตั้งค่าที่กำหนด (user) เสมอ
          </div>
        </div>
      </Dialog>
    </div>
  );
}