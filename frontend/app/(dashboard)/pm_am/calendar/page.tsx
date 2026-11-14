"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { usePageHero, t } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Clock,
  CalendarDays,
  ClipboardList,
  FileCheck2,
  Eye,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import AndonLamp from "@/components/AndonLamp";

const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const DOW_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const toYmd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const todayStr = toYmd(new Date());

const freqLabels: Record<string, string> = {
  daily: "รายวัน",
  weekly: "รายสัปดาห์",
  monthly: "รายเดือน",
  quarterly: "รายไตรมาส",
  semi_annual: "ทุก 6 เดือน",
  yearly: "รายปี",
  custom: "กำหนดเอง",
  meter_based: "ตามมิเตอร์",
};

const statusLabel: Record<string, string> = {
  pending: "รอดำเนินการ",
  due: "ถึงกำหนด",
  in_progress: "กำลังดำเนินการ",
  overdue: "เกินกำหนด",
  completed: "เสร็จสิ้น",
  skipped: "ข้ามรอบ",
  cancelled: "ยกเลิก",
};

const andonOf = (s: string): "ok" | "warn" | "down" | "idle" => {
  const v = String(s || "").toLowerCase();
  if (v === "completed") return "ok";
  if (v === "in_progress" || v === "due") return "warn";
  if (v === "overdue") return "down";
  return "idle";
};

const freqChipStyle: Record<string, React.CSSProperties> = {
  daily: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  weekly: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  monthly: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  quarterly: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  semi_annual: { background: "var(--cmms-info-light, #e0f2fe)", color: "var(--cmms-info, #0284c7)" },
  yearly: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
  custom: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
  meter_based: { background: "var(--cmms-info-light, #e0f2fe)", color: "var(--cmms-info, #0284c7)" },
};

function MiniCalendar({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const [viewYear, setViewYear] = useState(() => Number(value.slice(0, 4)) || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (Number(value.slice(5, 7)) || new Date().getMonth() + 1) - 1);

  useEffect(() => {
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(5, 7)) - 1;
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 0 && m <= 11) {
      setViewYear(y);
      setViewMonth(m);
    }
  }, [value]);

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
        <button type="button" onClick={() => shift(-1)} aria-label="เดือนก่อนหน้า" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--cmms-bg-muted)]" style={{ color: "var(--cmms-text-secondary)" }}>
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <span className="text-sm font-bold">{THAI_MONTHS_SHORT[viewMonth]} {viewYear + 543}</span>
        <button type="button" onClick={() => shift(1)} aria-label="เดือนถัดไป" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--cmms-bg-muted)]" style={{ color: "var(--cmms-text-secondary)" }}>
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold" style={{ color: "var(--cmms-text-muted)" }}>
        {DOW_SHORT.map((d) => <span key={d} className="py-1">{d}</span>)}
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
              className="inline-flex h-10 items-center justify-center rounded-lg text-xs font-semibold transition-colors"
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

function displayStatusOf(row: any, today: string) {
  const st = String(row?.status || "pending");
  if (st === "completed" || st === "skipped" || st === "cancelled" || st === "in_progress" || st === "overdue") return st;
  const due = row?.due_date ? String(row.due_date).slice(0, 10) : "";
  if (due && /^\d{4}-\d{2}-\d{2}$/.test(due)) {
    if (due < today) return "overdue";
    if (due === today) return "due";
  }
  return st || "pending";
}

export default function PMCalendarPage() {
  const hero = usePageHero("pm_am/calendar");
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [viewAll, setViewAll] = useState(false);
  const [assetMap, setAssetMap] = useState<Record<number, { location: string; department: string; code?: string }>>({});

  const [search, setSearch] = useState("");
  const [fAsset, setFAsset] = useState("all");
  const [fLoc, setFLoc] = useState("all");
  const [fDept, setFDept] = useState("all");
  const [fTech, setFTech] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fFreq, setFFreq] = useState("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    fetch("/api/v1/pm_am.php", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
        const fetched = rows.map((row: any) => {
          const due = row.due_date ? String(row.due_date).slice(0, 10) : "";
          const dStatus = displayStatusOf(row, todayStr);
          return {
            id: `PM-${String(row.id).padStart(3, "0")}`,
            rawId: Number(row.id),
            asset: row.asset_name || "ไม่ระบุเครื่องจักร",
            assetCode: row.asset_code || "",
            assetId: row.asset_id ? Number(row.asset_id) : null,
            task: row.title || row.description || "งานบำรุงรักษา",
            date: due,
            assignee: row.assigned_name || (row.assigned_to ? String(row.assigned_to) : "-"),
            status: String(row.status || "pending"),
            displayStatus: dStatus,
            type: row.frequency_type || "monthly",
            isOutsource: !!Number(row.is_outsource),
          };
        });
        setTasks(fetched);
      })
      .catch((e) => {
        console.error("Fetch PM cycles error:", e);
        if (!cancelled) setLoadError("โหลดข้อมูลรอบ PM ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    fetch("/api/v1/index.php?resource=assets")
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
        const map: Record<number, { location: string; department: string; code?: string }> = {};
        for (const a of list) {
          map[Number(a.id)] = { location: a.location || "", department: a.department || "", code: a.code || "" };
        }
        setAssetMap(map);
      })
      .catch(() => { /* optional */ });

    return () => { cancelled = true; };
  }, []);

  const filterOptions = useMemo(() => {
    const assets = new Set<string>();
    const locs = new Set<string>();
    const depts = new Set<string>();
    const techs = new Set<string>();
    const freqs = new Set<string>();
    for (const t of tasks) {
      const label = t.assetCode || t.asset;
      if (label) assets.add(label);
      const am = t.assetId ? assetMap[t.assetId] : undefined;
      if (am?.location) locs.add(am.location);
      if (am?.department) depts.add(am.department);
      if (t.assignee && t.assignee !== "-") techs.add(t.assignee);
      if (t.type) freqs.add(t.type);
    }
    return {
      assets: [...assets].sort(),
      locs: [...locs].sort(),
      depts: [...depts].sort(),
      techs: [...techs].sort(),
      freqs: [...freqs].sort(),
    };
  }, [tasks, assetMap]);

  const q = search.trim().toLowerCase();
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (!viewAll && t.date && t.date !== selectedDate) return false;
      if (!viewAll && !t.date && selectedDate) return false;
      if (q && !(`${t.id} ${t.asset} ${t.assetCode} ${t.task} ${t.assignee}`.toLowerCase().includes(q))) return false;
      if (fAsset !== "all" && (t.assetCode || t.asset) !== fAsset) return false;
      if (fStatus !== "all" && t.displayStatus !== fStatus) return false;
      if (fFreq !== "all" && t.type !== fFreq) return false;
      if (fTech !== "all" && t.assignee !== fTech) return false;
      const am = t.assetId ? assetMap[t.assetId] : undefined;
      if (fLoc !== "all" && (am?.location || "") !== fLoc) return false;
      if (fDept !== "all" && (am?.department || "") !== fDept) return false;
      return true;
    });
  }, [tasks, viewAll, selectedDate, q, fAsset, fLoc, fDept, fTech, fStatus, fFreq, assetMap]);

  const overdueCount = tasks.filter((t) => t.displayStatus === "overdue").length;
  const todayCount = tasks.filter((t) => t.date === todayStr && t.displayStatus !== "completed" && t.displayStatus !== "cancelled" && t.displayStatus !== "skipped").length;
  const activeTechCount = new Set(tasks.filter((t) => t.displayStatus === "in_progress").map((t: any) => t.assignee).filter((a: string) => a && a !== "-")).size;
  const completedTodayCount = tasks.filter((t) => t.displayStatus === "completed" && t.date === todayStr).length;

  const clearFilters = () => {
    setSearch(""); setFAsset("all"); setFLoc("all"); setFDept("all");
    setFTech("all"); setFStatus("all"); setFFreq("all");
  };

  const statusOptions = [
    { v: "all", l: "ทั้งหมด" },
    { v: "overdue", l: "เกินกำหนด" },
    { v: "due", l: "ถึงกำหนดวันนี้" },
    { v: "pending", l: "รอดำเนินการ" },
    { v: "in_progress", l: "กำลังดำเนินการ" },
    { v: "completed", l: "เสร็จสิ้น" },
    { v: "skipped", l: "ข้ามรอบ" },
    { v: "cancelled", l: "ยกเลิก" },
  ];

  return (
    <div className="space-y-6">
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" data-on-dark="true">{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="cmms-hero-title text-2xl font-bold tracking-tight">{hero.title}</h1>
            <span className="cmms-andon-chip" data-on-dark="true">รอบ PM จริง (PM Cycles)</span>
          </div>
          <p className="cmms-hero-desc">แสดงรอบงาน PM/AM จากข้อมูลจริง พร้อมสถานะตามกำหนด (due/overdue) และการเข้าถึงเช็คชีท/รายละเอียด</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => setViewAll((v) => !v)}
            className={viewAll ? "border-white bg-white text-[var(--cmms-primary)] hover:bg-white/90" : "border-white/20 bg-white/10 text-white hover:bg-white/20"}
          >
            <Clock size={16} strokeWidth={1.75} aria-hidden="true" />
            {viewAll ? "กลับไปดูตามวันที่" : "ดูแผนทั้งหมด"}
          </Button>
          <Button onClick={() => router.push("/pm_am/create")}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />{t("action.create_pm")}
          </Button>
          <Button variant="outline" onClick={() => window.open("/api/v1/pm_ical.php", "_blank")} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
            <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />ส่งออก iCal
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h5 className="flex items-center gap-2 font-bold"><Search size={16} strokeWidth={1.75} aria-hidden="true" />กรอง (Filter)</h5>
            <span className="cmms-count-pill">{filteredTasks.length} งาน</span>
            <div className="ml-auto relative w-full sm:w-64">
              <Search size={15} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cmms-text-muted)]" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่องาน / เครื่องจักร / เลข PM…" className="pl-9" aria-label="ค้นหางาน PM" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--cmms-text-secondary)]">เครื่องจักร</label>
              <Select value={fAsset} onValueChange={(v) => setFAsset(v)}>
                <SelectTrigger aria-label="กรองเครื่องจักร"><SelectValue placeholder="ทั้งหมด" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {filterOptions.assets.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--cmms-text-secondary)]">ตำแหน่ง</label>
              <Select value={fLoc} onValueChange={(v) => setFLoc(v)}>
                <SelectTrigger aria-label="กรองตำแหน่ง"><SelectValue placeholder="ทั้งหมด" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {filterOptions.locs.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--cmms-text-secondary)]">แผนก</label>
              <Select value={fDept} onValueChange={(v) => setFDept(v)}>
                <SelectTrigger aria-label="กรองแผนก"><SelectValue placeholder="ทั้งหมด" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {filterOptions.depts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--cmms-text-secondary)]">ผู้รับผิดชอบ</label>
              <Select value={fTech} onValueChange={(v) => setFTech(v)}>
                <SelectTrigger aria-label="กรองผู้รับผิดชอบ"><SelectValue placeholder="ทั้งหมด" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {filterOptions.techs.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--cmms-text-secondary)]">สถานะ</label>
              <Select value={fStatus} onValueChange={(v) => setFStatus(v)}>
                <SelectTrigger aria-label="กรองสถานะ"><SelectValue placeholder="ทั้งหมด" /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--cmms-text-secondary)]">ความถี่</label>
              <Select value={fFreq} onValueChange={(v) => setFFreq(v)}>
                <SelectTrigger aria-label="กรองความถี่"><SelectValue placeholder="ทั้งหมด" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {filterOptions.freqs.map((f) => <SelectItem key={f} value={f}>{freqLabels[f] || f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={clearFilters}>
                <Clock size={16} strokeWidth={1.75} aria-hidden="true" />ล้างตัวกรอง
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Card className="cmms-kpi-card red">
          <CardContent className="flex items-center gap-3 p-4">
            <AndonLamp status="down" size="sm" />
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">งานเลยกำหนด (ค้าง)</p>
              <h3 className="cmms-kpi-value">{overdueCount} <span className="cmms-kpi-unit">งาน</span></h3>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card amber">
          <CardContent className="flex items-center gap-3 p-4">
            <AndonLamp status="warn" size="sm" />
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">งานที่ต้องทำวันนี้</p>
              <h3 className="cmms-kpi-value">{todayCount} <span className="cmms-kpi-unit">งาน</span></h3>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card green">
          <CardContent className="flex items-center gap-3 p-4">
            <AndonLamp status="ok" size="sm" />
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">เสร็จแล้ว (กำหนดวันนี้)</p>
              <h3 className="cmms-kpi-value">{completedTodayCount} <span className="cmms-kpi-unit">งาน</span></h3>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card cyan">
          <CardContent className="flex items-center gap-3 p-4">
            <AndonLamp status="idle" size="sm" />
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">กำลังดำเนินการโดยช่าง</p>
              <h3 className="cmms-kpi-value">{activeTechCount} <span className="cmms-kpi-unit">คน</span></h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {loadError && <div className="rounded-[10px] border p-4 text-sm font-medium" style={{ borderColor: "var(--cmms-danger)", background: "var(--cmms-danger-light)" }}>{loadError}</div>}

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
              <div className="flex items-center gap-2"><AndonLamp status="down" size="sm" /><span className="text-sm">เกินกำหนด (Overdue)</span></div>
              <div className="flex items-center gap-2"><AndonLamp status="warn" size="sm" /><span className="text-sm">ถึงกำหนด / กำลังทำ</span></div>
              <div className="flex items-center gap-2"><AndonLamp status="idle" size="sm" /><span className="text-sm">รอดำเนินการ</span></div>
              <div className="flex items-center gap-2"><AndonLamp status="ok" size="sm" /><span className="text-sm">เสร็จสิ้น</span></div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3" style={{ borderColor: "var(--cmms-border)" }}>
                <div className="flex items-center gap-2">
                  <div className="cmms-icon-tile h-8 w-8 rounded-lg"><ClipboardList size={16} strokeWidth={1.75} aria-hidden="true" /></div>
                  <h4 className="font-bold">{viewAll ? "รอบ PM ทั้งหมด" : `รอบ PM ประจำวันที่ ${selectedDate}`}</h4>
                </div>
                <span className="cmms-count-pill">{filteredTasks.length} งาน</span>
              </div>

              {loading ? (
                <div className="space-y-3 py-8 text-center text-sm text-[var(--cmms-text-muted)]">กำลังโหลดรอบ PM…</div>
              ) : filteredTasks.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays size={28} strokeWidth={1.5} aria-hidden="true" />}
                  title={viewAll ? "ไม่มีรอบ PM ตามตัวกรอง" : "ไม่มีรอบ PM สำหรับวันที่เลือก"}
                  description={viewAll ? "ลองล้างตัวกรองหรือสร้างรอบ PM ใหม่" : "เลือกวันที่อื่นจากปฏิทิน หรือกด \"ดูแผนทั้งหมด\""}
                />
              ) : (
                <div className="space-y-3">
                  {filteredTasks.map((t) => {
                    const canDo = t.displayStatus === "pending" || t.displayStatus === "due" || t.displayStatus === "in_progress" || t.displayStatus === "overdue";
                    const dueReached = t.date && t.date <= todayStr;
                    return (
                      <div key={t.id} className="rounded-lg border p-4 transition-all" style={{ borderColor: "var(--cmms-border)", backgroundColor: "var(--cmms-bg-card)" }}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-3">
                              {(viewAll || t.date !== selectedDate) && t.date && (
                                <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>{t.date}</span>
                              )}
                              <span className="font-bold">{t.id}</span>
                              <span className="cmms-andon-chip" style={freqChipStyle[t.type] || freqChipStyle.monthly}>{freqLabels[t.type] || t.type}</span>
                              <span className={`cmms-status ${andonOf(t.displayStatus)}`}>
                                <span className="cmms-status-dot" />
                                {statusLabel[t.displayStatus] || t.displayStatus}
                              </span>
                              {t.isOutsource && <span className="cmms-andon-chip" style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}>ภายนอก</span>}
                            </div>
                            <h5 className="font-bold" style={{ color: "var(--cmms-primary)" }}>{t.task}</h5>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                              <p className="text-sm text-[var(--cmms-text-secondary)]"><span className="font-semibold">เครื่องจักร:</span> {t.asset}{t.assetCode ? ` (${t.assetCode})` : ""}</p>
                              <p className="text-sm text-[var(--cmms-text-secondary)]"><span className="font-semibold">ผู้รับผิดชอบ:</span> {t.assignee}</p>
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => router.push(`/pm_am/view?id=${t.rawId}`)}
                              className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-300 sm:w-auto"
                              style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}
                            >
                              <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />ดูรายละเอียด
                            </button>
                            {canDo && dueReached && t.type !== "meter_based" && (
                              <button
                                type="button"
                                onClick={() => router.push(`/pm_am/checksheet?plan_id=${t.rawId}`)}
                                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-300 sm:w-auto"
                                style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}
                              >
                                <FileCheck2 size={14} strokeWidth={1.75} aria-hidden="true" />ทำเช็คชีท
                              </button>
                            )}
                            {t.displayStatus === "completed" && (
                              <button
                                type="button"
                                onClick={() => router.push(`/pm_am/view?id=${t.rawId}`)}
                                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-300 sm:w-auto"
                                style={{ background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" }}
                              >
                                <Eye size={14} strokeWidth={1.75} aria-hidden="true" />ดูผลตรวจ
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
