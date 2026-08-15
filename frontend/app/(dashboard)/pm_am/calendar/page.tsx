"use client";

import { useState, useEffect } from "react";
import { usePageHero, t, statusText, priorityText } from "@/lib/i18n";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Calendar } from "@astryxdesign/core/Calendar";
import { Grid } from "@astryxdesign/core/Grid";
import {
  PlusIcon,
  ClockIcon,
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
  PlayIcon,
  DocumentCheckIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import AndonLamp from "@/components/AndonLamp";

const todayStr = new Date().toISOString().slice(0, 10);

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

export default function PMCalendarPage() {
  const hero = usePageHero("pm_am/calendar");
  const [selectedDate, setSelectedDate] = useState<`${number}${number}${number}${number}-${number}${number}-${number}${number}` | undefined>(todayStr as `${number}${number}${number}${number}-${number}${number}-${number}${number}`);
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
    <VStack gap={6}>
      {/* Header */}
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>{hero.title}</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              PM / AM
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {hero.desc}
          </Text>
        </VStack>
        <HStack gap={3} wrap="wrap">
          <button
            type="button"
            onClick={() => setViewAll((v) => !v)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 border ${
              viewAll
                ? "bg-white text-[var(--cmms-primary)] border-white shadow-lg"
                : "text-white bg-white/10 hover:bg-white/20 border-white/20"
            }`}
          >
            <ClockIcon className="w-4 h-4" />
            {viewAll ? "กลับไปดูตามวันที่" : "ดูแผนทั้งหมด"}
          </button>
          <button
            type="button"
            onClick={() => window.location.href = '/pm_am/create'}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
          >
            <PlusIcon className="w-4 h-4" />{t("action.create_pm")}</button>
          <button
            type="button"
            onClick={() => window.open('/api/v1/pm_ical.php', '_blank')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-300"
          >
            <CalendarDaysIcon className="w-4 h-4" />
            ส่งออก iCal
          </button>
        </HStack>
      </div>

      <Grid columns={{ minWidth: 230, repeat: "fit" }} gap={4}>
        <Card padding={4} className="cmms-kpi-card red">
          <HStack gap={3} vAlign="center">
            <AndonLamp status="down" size="sm" />
            <VStack gap={0}>
              <Text type="supporting" color="secondary">งานเลยกำหนด</Text>
              <Heading level={3} className="cmms-kpi-value" style={{ margin: 0 }}>{overdueCount} <span className="cmms-kpi-unit">งาน</span></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4} className="cmms-kpi-card amber">
          <HStack gap={3} vAlign="center">
            <AndonLamp status="warn" size="sm" />
            <VStack gap={0}>
              <Text type="supporting" color="secondary">แผนงานวันนี้ (Today)</Text>
              <Heading level={3} className="cmms-kpi-value" style={{ margin: 0 }}>{todayCount} <span className="cmms-kpi-unit">งาน</span></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4} className="cmms-kpi-card green">
          <HStack gap={3} vAlign="center">
            <AndonLamp status="ok" size="sm" />
            <VStack gap={0}>
              <Text type="supporting" color="secondary">เสร็จแล้ววันนี้</Text>
              <Heading level={3} className="cmms-kpi-value" style={{ margin: 0 }}>{completedCount} <span className="cmms-kpi-unit">งาน</span></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4} className="cmms-kpi-card cyan">
          <HStack gap={3} vAlign="center">
            <AndonLamp status="idle" size="sm" />
            <VStack gap={0}>
              <Text type="supporting" color="secondary">ช่างที่กำลังปฏิบัติงาน</Text>
              <Heading level={3} className="cmms-kpi-value" style={{ margin: 0 }}>{activeTechCount} <span className="cmms-kpi-unit">คน</span></Heading>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      <Grid columns={3} gap={6}>
        <div style={{ gridColumn: 'span 1' }}>
          <Card padding={4}>
            <Calendar value={selectedDate} onChange={(d) => setSelectedDate(d)} />
          </Card>
          
          <Card padding={4} style={{ marginTop: 16 }}>
             <VStack gap={3}>
               <Heading level={5}>สัญลักษณ์ (Legend)</Heading>
               <HStack gap={2} vAlign="center">
                 <AndonLamp status="down" size="sm" />
                 <Text type="body" size="sm">เลยกำหนด (Overdue)</Text>
               </HStack>
               <HStack gap={2} vAlign="center">
                 <AndonLamp status="warn" size="sm" />
                 <Text type="body" size="sm">กำลังทำ (In Progress)</Text>
               </HStack>
               <HStack gap={2} vAlign="center">
                 <AndonLamp status="idle" size="sm" />
                 <Text type="body" size="sm">รอทำ (Scheduled)</Text>
               </HStack>
               <HStack gap={2} vAlign="center">
                 <AndonLamp status="ok" size="sm" />
                 <Text type="body" size="sm">เสร็จสิ้น (Completed)</Text>
               </HStack>
             </VStack>
          </Card>
        </div>

        <div style={{ gridColumn: 'span 2' }}>
          <Card padding={5} style={{ height: '100%' }}>
            <VStack gap={4}>
              <HStack hAlign="between" vAlign="center" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 12 }}>
                <HStack gap={2} vAlign="center">
                  <div className="w-8 h-8 rounded-lg cmms-icon-tile">
                    <ClipboardDocumentListIcon className="w-4 h-4" />
                  </div>
                  <Heading level={4} style={{ margin: 0 }}>
                    {viewAll ? "แผน PM ทั้งหมด (ทุกวันที่)" : `รายการ PM ประจำวันที่ ${selectedDate || "ไม่ได้เลือกวันที่"}`}
                  </Heading>
                </HStack>
                <span className="cmms-count-pill">{visibleTasks.length} งาน</span>
              </HStack>
              
              {visibleTasks.length === 0 ? (
                <VStack gap={4} hAlign="center" vAlign="center" style={{ minHeight: 300, opacity: 0.5 }}>
                  <CalendarDaysIcon className="w-6 h-6" />
                  <Text type="body">{viewAll ? "ยังไม่มีแผน PM ในระบบ" : "ไม่มีแผน PM สำหรับวันนี้"}</Text>
                </VStack>
              ) : (
                <VStack gap={3}>
                  {visibleTasks.map((t) => (
                    <div key={t.id} style={{ 
                      padding: 16, 
                      borderRadius: 8, 
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      transition: 'all 0.2s'
                    }}>
                      <HStack hAlign="between" vAlign="start">
                        <VStack gap={2}>
                          <HStack gap={3} vAlign="center">
                            {viewAll && (
                              <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                                {t.date}
                              </span>
                            )}
                            <Text type="body" weight="bold">{t.id}</Text>
                            <span className="cmms-andon-chip" style={freqChipStyle[t.type] || freqChipStyle.monthly}>
                              {t.type.charAt(0).toUpperCase() + t.type.slice(1)}
                            </span>
                            <span className={`cmms-status ${andonOf(t.status)}`}>
                              <span className="cmms-status-dot" />
                              {pmStatusLabel[t.status] || t.status}
                            </span>
                          </HStack>
                          <Heading level={5} style={{ color: 'var(--color-primary)' }}>{t.task}</Heading>
                          <HStack gap={4} vAlign="center">
                            <Text type="body" size="sm" color="secondary">
                              <span style={{ fontWeight: 600 }}>เครื่องจักร:</span> {t.asset}
                            </Text>
                            <Text type="body" size="sm" color="secondary">
                              <span style={{ fontWeight: 600 }}>ผู้รับผิดชอบ:</span> {t.assignee}
                            </Text>
                          </HStack>
                        </VStack>
                        
                        <div>
                          {t.status === "scheduled" && (
                            <button
                              type="button"
                              className="cmms-btn-primary cmms-btn-primary--sm"
                            >
                              <PlayIcon className="w-3.5 h-3.5" />
                              เริ่มงาน
                            </button>
                          )}
                          {t.status === "in-progress" && (
                            <button
                              type="button"
                              onClick={() => (window.location.href = "/pm_am/checksheet")}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
                            >
                              <DocumentCheckIcon className="w-3.5 h-3.5" />
                              ทำเช็คชีท
                            </button>
                          )}
                          {t.status === "completed" && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
                            >
                              <EyeIcon className="w-3.5 h-3.5" />
                              ดูผลตรวจ
                            </button>
                          )}
                        </div>
                      </HStack>
                    </div>
                  ))}
                </VStack>
              )}
            </VStack>
          </Card>
        </div>
      </Grid>
    </VStack>
  );
}
