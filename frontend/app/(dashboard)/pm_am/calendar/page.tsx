"use client";

import { useState, useEffect } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Clock,
  CalendarDays,
  ClipboardList,
  Play,
  FileCheck2,
  Eye,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import AndonLamp from "@/components/AndonLamp";

const todayStr = new Date().toISOString().slice(0, 10);

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
const DOW_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

// สถานะ → ไฟ Andon: เขียวเสร็จ / เหลืองกำลังทำ / แดงเลยกำหนด / เทารอทำ
const andonOf = (s: string): "ok" | "warn" | "down" | "idle" => {
  const v = String(s || "").toLowerCase();
  if (v === "completed") return "ok";
  if (v === "in-progress" || v === "in_progress") return "warn";
  if (v === "overdue") return "down";
  return "idle";
};

const pmStatusLabel: Record<string, string> = {
  scheduled: "รอทำ", overdue: "เลยกำหนด", completed: "เสร็จสิ้น",
  "in-progress": "กำลังทำ", in_progress: "กำลังทำ",
};

const freqChipStyle: Record<string, React.CSSProperties> = {
  daily: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  weekly: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  monthly: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  quarterly: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  yearly: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
};

/** ปฏิทินเดือนขนาดกะทัดรัด (tokens) — แทน Astryx Calendar */
function MiniCalendar({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const [viewYear, setViewYear] = useState(() => Number(value.slice(0, 4)) || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (Number(value.slice(5, 7)) || new Date().getMonth() + 1) - 1);

  const shift = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  };

  const startDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: number) => `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="เดือนก่อนหน้า"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--cmms-bg-muted)]"
          style={{ color: "var(--cmms-text-secondary)" }}
        >
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <span className="text-sm font-bold">{THAI_MONTHS_SHORT[viewMonth]} {viewYear + 543}</span>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="เดือนถัดไป"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--cmms-bg-muted)]"
          style={{ color: "var(--cmms-text-secondary)" }}
        >
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold" style={{ color: "var(--cmms-text-muted)" }}>
        {DOW_SHORT.map((d) => (
          <span key={d} className="py-1">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} />;
          const iso = fmt(d);
          const selected = iso === value;
          const isToday = iso === todayStr;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onChange(iso)}
              aria-pressed={selected}
              aria-current={isToday ? "date" : undefined}
              className="inline-flex h-8 items-center justify-center rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: selected ? "var(--cmms-primary)" : "transparent",
                color: selected ? "#fff" : isToday ? "var(--cmms-primary-hover)" : "var(--cmms-text-primary)",
                boxShadow: isToday && !selected ? "inset 0 0 0 1px var(--cmms-primary)" : "none",
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PMCalendarPage() {
  const hero = usePageHero("pm_am/calendar");
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [tasks, setTasks] = useState<any[]>([]);
  const [viewAll, setViewAll] = useState(false);

  useEffect(() => {
    fetch("/api/v1/index.php?resource=pm-plans")
      .then(res => res.json())
      .then(json => {
        if (json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
          const fetched = json.data.map((row: any) => ({
            id: row.plan_code || `PM-${row.id}`,
            asset: row.title || row.plan_name || "แผนงานซ่อมบำรุง",
            task: row.description || "เช็คสภาพเครื่องตามรอบ",
            date: row.due_date ? row.due_date.split(" ")[0] : "",
            assignee: row.assigned_to_name || "-",
            status: row.status || "scheduled",
            type: row.frequency_type || "monthly",
          }));
          setTasks(fetched);
        }
      })
      .catch(e => console.error("Fetch PM plans error:", e));
  }, []);

  const tasksForDate = tasks.filter((t) => t.date && t.date === selectedDate);
  const overdueCount = tasks.filter(t => t.status === "overdue").length;
  const todayCount = tasks.filter(t => t.date && t.date === todayStr).length;
  // จำนวนช่างที่กำลังปฏิบัติงานจริง (จากงานที่สถานะ in-progress)
  const activeTechCount = new Set(tasks.filter(t => t.status === "in-progress").map((t: any) => t.assignee)).size;
  const completedCount = tasks.filter(t => t.status === "completed" && t.date === todayStr).length;
  // โหมด "ดูแผนทั้งหมด" — เรียงตามวันที่แล้วค่อยตามรหัส
  const allTasksSorted = [...tasks].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)));
  const visibleTasks = viewAll ? allTasksSorted : tasksForDate;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              PM / AM
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{hero.desc}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => setViewAll((v) => !v)}
            className={
              viewAll
                ? "border-white bg-white text-[var(--cmms-primary)] hover:bg-white/90"
                : "border-white/20 bg-white/10 text-white hover:bg-white/20"
            }
          >
            <Clock size={16} strokeWidth={1.75} aria-hidden="true" />
            {viewAll ? "กลับไปดูตามวันที่" : "ดูแผนทั้งหมด"}
          </Button>
          <Button onClick={() => (window.location.href = "/pm_am/create")}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />{t("action.create_pm")}
          </Button>
          <Button variant="outline" onClick={() => window.open("/api/v1/pm_ical.php", "_blank")} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
            <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
            ส่งออก iCal
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Card className="cmms-kpi-card red">
          <CardContent className="flex items-center gap-3 p-4">
            <AndonLamp status="down" size="sm" />
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">งานเลยกำหนด</p>
              <h3 className="cmms-kpi-value">{overdueCount} <span className="cmms-kpi-unit">งาน</span></h3>
            </div>
          </CardContent>
        </Card>

        <Card className="cmms-kpi-card amber">
          <CardContent className="flex items-center gap-3 p-4">
            <AndonLamp status="warn" size="sm" />
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">แผนงานวันนี้ (Today)</p>
              <h3 className="cmms-kpi-value">{todayCount} <span className="cmms-kpi-unit">งาน</span></h3>
            </div>
          </CardContent>
        </Card>

        <Card className="cmms-kpi-card green">
          <CardContent className="flex items-center gap-3 p-4">
            <AndonLamp status="ok" size="sm" />
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">เสร็จแล้ววันนี้</p>
              <h3 className="cmms-kpi-value">{completedCount} <span className="cmms-kpi-unit">งาน</span></h3>
            </div>
          </CardContent>
        </Card>

        <Card className="cmms-kpi-card cyan">
          <CardContent className="flex items-center gap-3 p-4">
            <AndonLamp status="idle" size="sm" />
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">ช่างที่กำลังปฏิบัติงาน</p>
              <h3 className="cmms-kpi-value">{activeTechCount} <span className="cmms-kpi-unit">คน</span></h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <MiniCalendar value={selectedDate} onChange={(d) => setSelectedDate(d)} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h5 className="font-bold">สัญลักษณ์ (Legend)</h5>
              <div className="flex items-center gap-2">
                <AndonLamp status="down" size="sm" />
                <span className="text-sm">เลยกำหนด (Overdue)</span>
              </div>
              <div className="flex items-center gap-2">
                <AndonLamp status="warn" size="sm" />
                <span className="text-sm">กำลังทำ (In Progress)</span>
              </div>
              <div className="flex items-center gap-2">
                <AndonLamp status="idle" size="sm" />
                <span className="text-sm">รอทำ (Scheduled)</span>
              </div>
              <div className="flex items-center gap-2">
                <AndonLamp status="ok" size="sm" />
                <span className="text-sm">เสร็จสิ้น (Completed)</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3" style={{ borderColor: "var(--cmms-border)" }}>
                <div className="flex items-center gap-2">
                  <div className="cmms-icon-tile h-8 w-8 rounded-lg">
                    <ClipboardList size={16} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <h4 className="font-bold">
                    {viewAll ? "แผน PM ทั้งหมด (ทุกวันที่)" : `รายการ PM ประจำวันที่ ${selectedDate || "ไม่ได้เลือกวันที่"}`}
                  </h4>
                </div>
                <span className="cmms-count-pill">{visibleTasks.length} งาน</span>
              </div>

              {visibleTasks.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays size={28} strokeWidth={1.5} aria-hidden="true" />}
                  title={viewAll ? "ยังไม่มีแผน PM ในระบบ" : "ไม่มีแผน PM สำหรับวันนี้"}
                  description={viewAll ? "ลองกดสร้างแผน PM ใหม่ หรือนำเข้าแผนจากระบบเดิม" : "เลือกวันที่อื่นจากปฏิทิน หรือกด \"ดูแผนทั้งหมด\""}
                />
              ) : (
                <div className="space-y-3">
                  {visibleTasks.map((t) => (
                    <div key={t.id} className="rounded-lg border p-4 transition-all" style={{ borderColor: "var(--cmms-border)", backgroundColor: "var(--cmms-bg-card)" }}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-3">
                            {viewAll && (
                              <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                                {t.date}
                              </span>
                            )}
                            <span className="font-bold">{t.id}</span>
                            <span className="cmms-andon-chip" style={freqChipStyle[t.type] || freqChipStyle.monthly}>
                              {t.type.charAt(0).toUpperCase() + t.type.slice(1)}
                            </span>
                            <span className={`cmms-status ${andonOf(t.status)}`}>
                              <span className="cmms-status-dot" />
                              {pmStatusLabel[t.status] || t.status}
                            </span>
                          </div>
                          <h5 className="font-bold" style={{ color: "var(--cmms-primary)" }}>{t.task}</h5>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <p className="text-sm text-[var(--cmms-text-secondary)]">
                              <span className="font-semibold">เครื่องจักร:</span> {t.asset}
                            </p>
                            <p className="text-sm text-[var(--cmms-text-secondary)]">
                              <span className="font-semibold">ผู้รับผิดชอบ:</span> {t.assignee}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {t.status === "scheduled" && (
                            <button type="button" className="cmms-btn-primary cmms-btn-primary--sm">
                              <Play size={14} strokeWidth={1.75} aria-hidden="true" />
                              เริ่มงาน
                            </button>
                          )}
                          {t.status === "in-progress" && (
                            <button
                              type="button"
                              onClick={() => (window.location.href = "/pm_am/checksheet")}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-300"
                              style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}
                            >
                              <FileCheck2 size={14} strokeWidth={1.75} aria-hidden="true" />
                              ทำเช็คชีท
                            </button>
                          )}
                          {t.status === "completed" && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-300"
                              style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}
                            >
                              <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
                              ดูผลตรวจ
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
