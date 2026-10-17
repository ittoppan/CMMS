"use client";

// users/leaderboard — Technician KPI Leaderboard (port จาก PHP users/leaderboard.php)
// data: GET /api/v1/users.php?action=leaderboard (aggregate users + repair + repair_ratings)

import { useEffect, useState, useCallback } from "react";
import { Trophy, RefreshCw } from "lucide-react";
import { usePageHero, t } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  SimpleDataTable,
  type SimpleColumn,
} from "@/components/ui/data-table-adapter";
import CountUp from "react-countup";

interface Row {
  rank: number;
  id: number;
  fullName: string;
  employeeCode: string;
  position: string;
  deptName: string;
  avatar: string;
  totalAssigned: number;
  completedCount: number;
  inProgressCount: number;
  avgRating: number;
}

const podiums = [
  { bg: "bg-amber-100 dark:bg-amber-950/40", ring: "ring-amber-400", label: "1", icon: "🥇" },
  { bg: "bg-slate-100 dark:bg-slate-900/60", ring: "ring-slate-400", label: "2", icon: "🥈" },
  { bg: "bg-orange-100 dark:bg-orange-950/40", ring: "ring-orange-500", label: "3", icon: "🥉" },
];

export default function LeaderboardPage() {
  const hero = usePageHero("users");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/users.php?action=leaderboard");
      const json = await res.json();
      if (Array.isArray(json)) {
        setRows(
          json.map((r: any, i: number): Row => ({
            rank: i + 1,
            id: r.id,
            fullName: r.full_name || "-",
            employeeCode: r.employee_code || "-",
            position: r.position || "-",
            deptName: r.dept_name || "-",
            avatar: r.avatar_path ? `/uploads/${r.avatar_path}` : "",
            totalAssigned: Number(r.total_assigned) || 0,
            completedCount: Number(r.completed_count) || 0,
            inProgressCount: Number(r.in_progress_count) || 0,
            avgRating: Math.round((Number(r.avg_rating) || 0) * 10) / 10,
          })),
        );
      }
    } catch {
      setError(t("action.failed") || "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBoard(); }, [fetchBoard]);

  const initials = (n: string) =>
    n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  const columns: SimpleColumn<Row>[] = [
    { key: "rank", header: "#", renderCell: (r) => <span className="font-mono font-semibold">{r.rank}</span> },
    {
      key: "fullName",
      header: t("tbl.name") || "ชื่อ",
      renderCell: (r) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            {r.avatar ? <AvatarImage src={r.avatar} alt={r.fullName} /> : null}
            <AvatarFallback>{initials(r.fullName)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-semibold text-sm">{r.fullName}</div>
            <div className="text-xs text-muted-foreground">{r.employeeCode}</div>
          </div>
        </div>
      ),
    },
    { key: "deptName", header: t("tbl.department") || "แผนก" },
    { key: "totalAssigned", header: "งานทั้งหมด", renderCell: (r) => <span className="font-mono">{r.totalAssigned}</span> },
    {
      key: "completedCount",
      header: "งานเสร็จ",
      renderCell: (r) => <Badge className="bg-emerald-100 text-emerald-700">{r.completedCount}</Badge>,
    },
    { key: "inProgressCount", header: "กำลังทำ", renderCell: (r) => <span className="font-mono">{r.inProgressCount}</span> },
    {
      key: "avgRating",
      header: "คะแนนเฉลี่ย",
      renderCell: (r) => (
        <span className="font-mono font-semibold">{r.avgRating > 0 ? r.avgRating.toFixed(1) : "-"}</span>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "แดชบอร์ด", href: "/dashboard" }, { label: "ผู้ใช้", href: "/users" }, { label: "KPI Leaderboard" }]}
      title={hero.title || "KPI Leaderboard"}
      description="จัดอันดับช่างตามงานที่เสร็จและคะแนนประเมินจากหัวหน้า (เฉพาะผู้ใช้ที่ active)"
      actions={
        <Button variant="secondary" onClick={fetchBoard}>
          <RefreshCw className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          {t("action.refresh")}
        </Button>
      }
    >
      {error ? <Alert variant="danger">{error}</Alert> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {top3.map((r, i) => (
          <Card key={r.id} className={`${podiums[i].bg} ring-2 ${podiums[i].ring} text-center shadow-sm`}>
            <CardContent className="flex flex-col items-center gap-2 pt-6 pb-6">
              <span className="text-3xl">{podiums[i].icon}</span>
              <Badge className="uppercase font-bold">อันดับ {podiums[i].label}</Badge>
              <Avatar className="h-14 w-14 ring-2 ring-white shadow">
                {r.avatar ? <AvatarImage src={r.avatar} alt={r.fullName} /> : null}
                <AvatarFallback className="text-base">{initials(r.fullName)}</AvatarFallback>
              </Avatar>
              <div className="text-sm font-black">{r.fullName}</div>
              <div className="text-xs text-muted-foreground">{r.deptName}</div>
              <div className="flex gap-4 mt-1 text-center">
                <div>
                  <div className="text-lg font-bold text-emerald-600">
                    <CountUp end={r.completedCount} duration={0.6} />
                  </div>
                  <div className="text-[11px] text-muted-foreground uppercase">งานเสร็จ</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-primary">
                    {r.avgRating > 0 ? r.avgRating.toFixed(1) : "-"}
                  </div>
                  <div className="text-[11px] text-muted-foreground uppercase">คะแนน</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="w-4 h-4 text-amber-500" aria-hidden="true" />
          ตารางจัดอันดับ
        </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
          ) : rest.length > 0 ? (
            <SimpleDataTable columns={columns} data={rest} />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">ยังไม่มีข้อมูลงานซ่อมสำหรับจัดอันดับ</p>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  );
}
