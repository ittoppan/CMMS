"use client";

import { useState, useEffect } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AndonLamp from "@/components/AndonLamp";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  Activity,
  FileText,
  Wrench,
  CalendarDays,
} from "lucide-react";

interface PMStats {
  dueToday: number;
  upcoming: number;
  overdue: number;
  completed: number;
  completionRate: number;
  complianceRate: number;
  failedPM: number;
  openPMWOs: number;
}

interface PMTask {
  id: number;
  title: string;
  asset_name: string;
  asset_code: string;
  due_date: string;
  status: string;
  priority: string;
  assigned_name: string;
  frequency_type: string;
  plan_id: number | null;
}

export default function PMDashboardPage() {
  const hero = usePageHero("pm_am/dashboard");
  const router = useRouter();
  const [stats, setStats] = useState<PMStats>({
    dueToday: 0,
    upcoming: 0,
    overdue: 0,
    completed: 0,
    completionRate: 0,
    complianceRate: 0,
    failedPM: 0,
    openPMWOs: 0,
  });
  const [recentTasks, setRecentTasks] = useState<PMTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch("/api/v1/pm_am.php");
        const tasks = await res.json();
        if (!Array.isArray(tasks)) return;

        const today = new Date().toISOString().slice(0, 10);
        const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

        const dueToday = tasks.filter((t: PMTask) => t.due_date === today && t.status === "pending").length;
        const upcoming = tasks.filter((t: PMTask) => t.due_date > today && t.due_date <= nextWeek && t.status === "pending").length;
        const overdue = tasks.filter((t: PMTask) => t.due_date < today && ["pending", "overdue"].includes(t.status)).length;
        const completed = tasks.filter((t: PMTask) => t.status === "completed").length;
        const total = tasks.length;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        const complianceRate = completed > 0 ? Math.round((completed / (completed + overdue)) * 100) : 0;

        setStats({
          dueToday,
          upcoming,
          overdue,
          completed,
          completionRate,
          complianceRate,
          failedPM: overdue,
          openPMWOs: 0,
        });

        setRecentTasks(
          tasks
            .filter((t: PMTask) => ["pending", "overdue", "in_progress"].includes(t.status))
            .sort((a: PMTask, b: PMTask) => (a.due_date || "").localeCompare(b.due_date || ""))
            .slice(0, 10)
        );
      } catch (e) {
        console.error("Failed to load PM dashboard:", e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="cmms-page-hero">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h2>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{hero.desc}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => router.push("/pm_am/plans")}>
            <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
            แผน PM ทั้งหมด
          </Button>
          <Button variant="outline" onClick={() => router.push("/pm_am/create")}>
            <Wrench size={16} strokeWidth={1.75} aria-hidden="true" />
            สร้างแผน PM ใหม่
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Card className="cmms-kpi-card red">
          <CardContent className="flex items-center gap-3 p-4">
            <AndonLamp status="down" size="sm" />
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">งานเลยกำหนด</p>
              <h3 className="cmms-kpi-value">{stats.overdue} <span className="cmms-kpi-unit">งาน</span></h3>
            </div>
          </CardContent>
        </Card>

        <Card className="cmms-kpi-card amber">
          <CardContent className="flex items-center gap-3 p-4">
            <AndonLamp status="warn" size="sm" />
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">กำหนดวันนี้</p>
              <h3 className="cmms-kpi-value">{stats.dueToday} <span className="cmms-kpi-unit">งาน</span></h3>
            </div>
          </CardContent>
        </Card>

        <Card className="cmms-kpi-card green">
          <CardContent className="flex items-center gap-3 p-4">
            <AndonLamp status="ok" size="sm" />
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">เสร็จสิ้นแล้ว</p>
              <h3 className="cmms-kpi-value">{stats.completed} <span className="cmms-kpi-unit">งาน</span></h3>
            </div>
          </CardContent>
        </Card>

        <Card className="cmms-kpi-card cyan">
          <CardContent className="flex items-center gap-3 p-4">
            <AndonLamp status="idle" size="sm" />
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">กำลังจะครบกำหนด (7 วัน)</p>
              <h3 className="cmms-kpi-value">{stats.upcoming} <span className="cmms-kpi-unit">งาน</span></h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Card className="rounded-[var(--cmms-radius)] border" style={{ borderColor: "var(--cmms-border)" }}>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-[var(--cmms-text-secondary)]">Completion Rate</p>
            <p className="text-2xl font-bold" style={{ color: "var(--cmms-success)" }}>{stats.completionRate}%</p>
          </CardContent>
        </Card>
        <Card className="rounded-[var(--cmms-radius)] border" style={{ borderColor: "var(--cmms-border)" }}>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-[var(--cmms-text-secondary)]">PM Compliance</p>
            <p className="text-2xl font-bold" style={{ color: "var(--cmms-primary)" }}>{stats.complianceRate}%</p>
          </CardContent>
        </Card>
        <Card className="rounded-[var(--cmms-radius)] border" style={{ borderColor: "var(--cmms-border)" }}>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-[var(--cmms-text-secondary)]">Failed PM</p>
            <p className="text-2xl font-bold" style={{ color: "var(--cmms-danger)" }}>{stats.failedPM}</p>
          </CardContent>
        </Card>
        <Card className="rounded-[var(--cmms-radius)] border" style={{ borderColor: "var(--cmms-border)" }}>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-[var(--cmms-text-secondary)]">Open PM Work Orders</p>
            <p className="text-2xl font-bold" style={{ color: "var(--cmms-warning)" }}>{stats.openPMWOs}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--cmms-border)" }}>
            <h4 className="font-bold">งาน PM ที่ต้องดำเนินการ</h4>
            <span className="cmms-count-pill">{recentTasks.length} งาน</span>
          </div>
          {loading ? (
            <p className="text-sm text-[var(--cmms-text-muted)]">กำลังโหลด...</p>
          ) : recentTasks.length === 0 ? (
            <p className="text-sm text-[var(--cmms-text-muted)]">ไม่มีงาน PM ที่ต้องดำเนินการ</p>
          ) : (
            <div className="space-y-2">
              {recentTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                  style={{ borderColor: "var(--cmms-border)" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{
                        background:
                          task.status === "overdue"
                            ? "var(--cmms-danger)"
                            : task.status === "in_progress"
                            ? "var(--cmms-warning)"
                            : "var(--cmms-text-muted)",
                      }}
                    />
                    <div>
                      <p className="text-sm font-bold">{task.title}</p>
                      <p className="text-xs text-[var(--cmms-text-secondary)]">
                        {task.asset_code} - {task.asset_name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[var(--cmms-text-secondary)]">ครบกำหนด: {task.due_date}</p>
                    <p className="text-xs text-[var(--cmms-text-muted)]">{task.assigned_name || "-"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}