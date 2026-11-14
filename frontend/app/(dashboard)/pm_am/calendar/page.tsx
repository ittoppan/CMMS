"use client";

import { ModuleGuide } from "@/components/dashboard/module-guide";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { usePageHero, t } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
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
  const [lookaheadWeeks, setLookaheadWeeks] = useState<4 | 8>(4);

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
  // ความซ้ำซ้อนภายในแผน PM เอง: เครื่องเดียวมีหลายรอบครบกำหนดวันเดียว / ช่างคนเดียวมีหลายรอบวันเดียว
  const pmDayClashes = useMemo(() => {
    const open = new Set(["pending", "due", "in_progress", "overdue"]);
    const assets = new Map<string, { label: string; ids: string[] }>();
    const techs = new Map<string, { label: string; ids: string[] }>();
    for (const t of tasks) {
      if (!t.date || !open.has(String(t.displayStatus))) continue;
      const aKey = `${t.assetId ?? t.asset}||${t.date}`;
      const a = assets.get(aKey) ?? { label: `${t.asset} · ${t.date}`, ids: [] };
      a.ids.push(t.id);
      assets.set(aKey, a);
      if (t.assignee && t.assignee !== "-") {
        const tKey = `${t.assignee}||${t.date}`;
        const b = techs.get(tKey) ?? { label: `${t.assignee} · ${t.date}`, ids: [] };
        b.ids.push(t.id);
        techs.set(tKey, b);
      }
    }
    return {
      assetClash: [...assets.values()].filter((x) => x.ids.length > 1),
      techClash: [...techs.values()].filter((x) => x.ids.length > 1),
    };
  }, [tasks]);
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

  const lookahead = useMemo(() => {
    const start = new Date(todayStr + "T00:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + lookaheadWeeks * 7);
    const endStr = toYmd(end);
    const openStatuses = new Set(["pending", "due", "in_progress", "overdue"]);
    const inWindow = tasks.filter((t) => {
      if (!t.date || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) return false;
      if (t.date < todayStr || t.date >= endStr) return false;
      return openStatuses.has(t.displayStatus);
    });
    const byAssignee: Record<string, { total: number; days: Record<string, number> }> = {};
    const byLoc: Record<string, number> = {};
    let conflictSlots = 0;
    for (const t of inWindow) {
      const a = t.assignee && t.assignee !== "-" ? t.assignee : "ไม่ระบุผู้รับผิดชอบ";
      if (!byAssignee[a]) byAssignee[a] = { total: 0, days: {} };
      byAssignee[a].total += 1;
      byAssignee[a].days[t.date] = (byAssignee[a].days[t.date] || 0) + 1;
      const am = t.assetId ? assetMap[t.assetId] : undefined;
      const loc = am?.location || "ไม่ระบุตำแหน่ง";
      byLoc[loc] = (byLoc[loc] || 0) + 1;
    }
    const assigneeRows = Object.entries(byAssignee).map(([name, v]) => {
      const conflictDays = Object.values(v.days).filter((c) => c > 1).length;
      conflictSlots += Object.values(v.days).reduce((acc, c) => acc + (c > 1 ? c - 1 : 0), 0);
      return { name, total: v.total, conflictDays, peak: Math.max(0, ...Object.values(v.days)) };
    }).sort((a, b) => b.total - a.total || b.conflictDays - a.conflictDays);
    const locRows = Object.entries(byLoc).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
    return { endStr, count: inWindow.length, assigneeRows, locRows, conflictSlots };
  }, [tasks, assetMap, lookaheadWeeks]);

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

      <ModuleGuide
        name="ปฏิทินแผน PM"
        summary="มุมปฏิทินของรอบ PM/AM จากข้อมูลจริง — เห็นว่าแต่ละวันมีเครื่องไหนครบกำหนด พร้อมสถานะตามกำหนดและทางเข้าไปทำเช็คชีท"
        steps={[
          "เลือกช่วงดู (วัน/สัปดาห์/เดือน) และกรองเครื่อง/แผนก/สถานะที่แถบตัวกรอง",
          "กดที่รายการในปฏิทินเพื่อเปิดรายละเอียดแผนหรือไปหน้าเช็คชีท",
          "“ดูแผนทั้งหมด” สลับจากมุมปฏิทินเป็นมุมรายการ เพื่อหางานที่ตกค้างได้ง่าย",
          "“ส่งออก iCal” เพื่อนำรอบ PM ไปใส่ปฏิทิน Google/Outlook ของทีม",
        ]}
        source="ตาราง pm_am ผ่าน /api/v1/pm_am.php และไฟล์ปฏิทิน /api/v1/pm_ical.php"
        note="ปฏิทินแสดงเฉพาะแผนที่มีอยู่จริงในระบบ — เครื่องที่ยังไม่มีแผนจะไม่ปรากฏ ต้องสร้างแผนก่อนที่หน้าสร้างแผน PM"
        related={[
          { href: "/pm_am", label: "ตารางแผน PM" },
          { href: "/pm_am/checksheet", label: "เช็คชีท PM" },
          { href: "/pm_am/create", label: "สร้างแผน PM" },
        ]}
      />

      {(pmDayClashes.assetClash.length > 0 || pmDayClashes.techClash.length > 0) && (
        <Alert variant="warning" title="พบรอบ PM ซ้อนกันในวันเดียวกัน">
          <div className="space-y-1 text-sm">
            {pmDayClashes.assetClash.length > 0 && (
              <p>
                เครื่องเดียวกันมีหลายรอบครบกำหนดวันเดียว:{" "}
                {pmDayClashes.assetClash.slice(0, 3).map((x) => `${x.label} (${x.ids.length} รอบ)`).join(" · ")}
                {pmDayClashes.assetClash.length > 3 ? ` และอีก ${pmDayClashes.assetClash.length - 3} กลุ่ม` : ""}
              </p>
            )}
            {pmDayClashes.techClash.length > 0 && (
              <p>
                ช่างคนเดียวมีหลายรอบในวันเดียว:{" "}
                {pmDayClashes.techClash.slice(0, 3).map((x) => `${x.label} (${x.ids.length} รอบ)`).join(" · ")}
                {pmDayClashes.techClash.length > 3 ? ` และอีก ${pmDayClashes.techClash.length - 3} กลุ่ม` : ""}
              </p>
            )}
            <p className="text-xs text-[var(--cmms-text-muted)]">
              ตรวจจากตารางแผน PM เท่านั้น — ภาระงานที่รวมกับงานซ่อม/งานขัดข้อง ดูที่ศูนย์วางแผน (Planning)
            </p>
          </div>
        </Alert>
      )}
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

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h5 className="font-bold">วางแผนล่วงหน้า (ภาระงาน)</h5>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant={lookaheadWeeks===4?"primary":"secondary"} onClick={()=>setLookaheadWeeks(4)}>4 สัปดาห์</Button>
                  <Button type="button" size="sm" variant={lookaheadWeeks===8?"primary":"secondary"} onClick={()=>setLookaheadWeeks(8)}>8 สัปดาห์</Button>
                </div>
              </div>
              <p className="text-xs text-[var(--cmms-text-secondary)]">รอบ PM ค้าง/ถึงกำหนด {todayStr} ถึง {lookahead.endStr} (ไม่รวมงานปิด/ข้าม/ยกเลิก) — จากข้อมูลจริง</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border p-2" style={{borderColor:"var(--cmms-border)"}}><div className="text-xs text-muted-foreground">งานในช่วง</div><div className="font-semibold">{lookahead.count} งาน</div></div>
                <div className="rounded-lg border p-2" style={{borderColor:"var(--cmms-border)"}}><div className="text-xs text-muted-foreground">ช่วงชน/ซ้อน (คน-วัน)</div><div className="font-semibold" style={{color: lookahead.conflictSlots>0?"var(--cmms-warning-dark)":undefined}}>{lookahead.conflictSlots}</div></div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold">ตามผู้รับผิดชอบ (งาน / วันชน / peak)</p>
                {lookahead.assigneeRows.length===0 ? <p className="text-xs text-muted-foreground">N/A — ไม่มีงานในช่วงนี้</p> : (
                  <div className="max-h-40 space-y-1 overflow-auto pr-1">
                    {lookahead.assigneeRows.slice(0,8).map((r)=>(
                      <div key={r.name} className="flex items-center justify-between rounded border px-2 py-1 text-xs" style={{borderColor:"var(--cmms-border)", background: r.conflictDays>0?"var(--cmms-warning-light)":"transparent"}}>
                        <span className="truncate pr-2" title={r.name}>{r.name}</span>
                        <span className="whitespace-nowrap font-medium">{r.total} / {r.conflictDays} / {r.peak}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold">ตามตำแหน่ง/พื้นที่ (สูงสุด 6)</p>
                {lookahead.locRows.length===0 ? <p className="text-xs text-muted-foreground">N/A — ไม่มีข้อมูลตำแหน่ง/งานในช่วงนี้</p> : (
                  <div className="space-y-1">
                    {lookahead.locRows.slice(0,6).map((r)=>(
                      <div key={r.name} className="flex items-center justify-between text-xs"><span className="truncate pr-2">{r.name}</span><span className="font-medium">{r.total}</span></div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">“ชน/ซ้อน” = คนเดียวกันมี &gt;1 งานในวันเดียวกัน (ควรตรวจสอบการจัดสรร)</p>
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
