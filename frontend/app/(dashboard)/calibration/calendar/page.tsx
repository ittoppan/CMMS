"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Grid } from "@/components/layout";
import CountUp from "react-countup";
import { ChevronLeft, ChevronRight, CalendarDays, Clock, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StageBadge, stageDotClass } from "@/components/calibration/StageBadge";

interface CalRow {
  id: number;
  asset_id: number;
  asset_name: string;
  asset_code: string;
  next_calibration_date: string | null;
  calibration_date: string | null;
  certificate_number: string | null;
  stage: string;
}

const DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export default function CalibrationCalendar() {
  const router = useRouter();
  const [rows, setRows] = useState<CalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState<string>(
    `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`
  );

  useEffect(() => {
    fetch("/api/v1/calibration_tracking.php")
      .then((res) => res.json())
      .then((json) => {
        if (Array.isArray(json)) setRows(json);
      })
      .catch(() => setError("โหลดข้อมูลสอบเทียบไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  const { y, m } = cursor;
  const monthKey = `${y}-${pad2(m + 1)}`;

  const byDay = useMemo(() => {
    const map = new Map<string, CalRow[]>();
    for (const r of rows) {
      const d = r.next_calibration_date;
      if (!d) continue;
      const dk = d.substring(0, 7);
      if (dk !== monthKey) continue;
      const arr = map.get(d) ?? [];
      arr.push(r);
      map.set(d, arr);
    }
    return map;
  }, [rows, monthKey]);

  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const firstWeekday = new Date(y, m, 1).getDay();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${monthKey}-${pad2(d)}`);
  }

  const monthStats = useMemo(() => {
    let count = 0;
    let done = 0;
    let overdue = 0;
    for (const r of rows) {
      if (r.next_calibration_date && r.next_calibration_date.startsWith(monthKey)) {
        count++;
        if (r.stage === "done") done++;
        if (r.stage === "overdue") overdue++;
      }
    }
    return { count, done, overdue };
  }, [rows, monthKey]);

  const selectedItems = byDay.get(selected) ?? [];

  const move = (delta: number) => {
    const dt = new Date(y, m + delta, 1);
    setCursor({ y: dt.getFullYear(), m: dt.getMonth() });
    setSelected("");
  };

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">CALIBRATION CALENDAR</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: "ปฏิทินสอบเทียบ" },
      ]}
      title="ปฏิทินสอบเทียบเครื่องมือวัด"
      description="ดูกำหนดสอบเทียบ (Next Due) รายเดือน พร้อมสถานะติดตามงานแต่ละเครื่อง"
      actions={
        <Button variant="primary" onClick={() => router.push("/calibration/po")}>
          ไปที่ PO งานสอบเทียบ
        </Button>
      }
    >
      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]">
              <CalendarDays className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">กำหนดสอบเทียบในเดือนนี้</p>
              <div className="cmms-kpi-value">
                <CountUp end={monthStats.count} />
                <span className="cmms-kpi-unit">เครื่อง</span>
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-success-light)] text-[var(--cmms-success-dark)]">
              <BadgeCheck className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">เสร็จสิ้นในเดือนนี้</p>
              <div className="cmms-kpi-value">
                <CountUp end={monthStats.done} />
                <span className="cmms-kpi-unit">เครื่อง</span>
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-danger-light)] text-[var(--cmms-danger-dark)]">
              <Clock className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">เกินกำหนดค้าง</p>
              <div className="cmms-kpi-value">
                <CountUp end={monthStats.overdue} />
                <span className="cmms-kpi-unit">เครื่อง</span>
              </div>
            </div>
          </div>
        </Card>
      </Grid>

      <Card className="p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" onClick={() => move(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => move(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <h2 className="text-lg font-semibold">
            {MONTHS[m]} {y}
          </h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const d = new Date();
              setCursor({ y: d.getFullYear(), m: d.getMonth() });
            }}
          >
            เดือนนี้
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground">
          {DAYS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="space-y-1 py-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, i) => {
              if (!c) return <div key={`x${i}`} className="min-h-16 rounded-lg" />;
              const items = byDay.get(c) ?? [];
              const isToday = c === `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
              const isSel = c === selected;
              return (
                <button
                  key={c}
                  onClick={() => setSelected(c)}
                  className={`min-h-16 flex-col items-stretch justify-start gap-1 rounded-lg border p-1.5 text-left transition-colors ${
                    isSel
                      ? "border-[var(--cmms-primary)] bg-[var(--cmms-primary-light)]"
                      : "border-border hover:border-[var(--cmms-primary-hover)]"
                  }`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      isToday
                        ? "bg-[var(--cmms-primary)] text-white"
                        : "text-foreground"
                    }`}
                  >
                    {Number(c.slice(-2))}
                  </span>
                  {items.slice(0, 3).map((it) => (
                    <span
                      key={it.id}
                      className={`block truncate rounded px-1 text-[10px] font-medium leading-4 ${
                        it.stage === "overdue"
                          ? "bg-[var(--cmms-danger-light)] text-[var(--cmms-danger-dark)]"
                          : it.stage === "done"
                            ? "bg-[var(--cmms-success-light)] text-[var(--cmms-success-dark)]"
                            : "bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]"
                      }`}
                    >
                      <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${stageDotClass(it.stage)}`} />
                      {it.asset_code || it.asset_name}
                    </span>
                  ))}
                  {items.length > 3 && (
                    <span className="block pl-1 text-[10px] text-muted-foreground">
                      + {items.length - 3} รายการ
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-base font-semibold">
          {selected ? `งานสอบเทียบวันที่ ${selected}` : "เลือกวันที่บนปฏิทินเพื่อดูงาน"}
        </h3>
        {selectedItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">ไม่มีกำหนดสอบเทียบในวันนี้</p>
        ) : (
          <div className="divide-y divide-border">
            {selectedItems.map((it) => (
              <div key={it.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="text-sm font-semibold">
                    {it.asset_code} — {it.asset_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ครั้งล่าสุด: {it.calibration_date || "-"} · ใบรับรอง:{" "}
                    {it.certificate_number || "-"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StageBadge stage={it.stage} />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push(`/calibration/edit?id=${it.id}`)}
                  >
                    เปิดรายละเอียด
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {error && <p className="mt-2 text-sm text-[var(--cmms-danger)]">{error}</p>}
      </Card>
    </PageShell>
  );
}