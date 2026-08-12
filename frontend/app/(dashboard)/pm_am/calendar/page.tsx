"use client";

import { useState, useEffect } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Calendar } from "@astryxdesign/core/Calendar";
import { Grid } from "@astryxdesign/core/Grid";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { 
  PlusIcon,
  WrenchScrewdriverIcon,
  ClockIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from "@heroicons/react/24/outline";

const todayStr = new Date().toISOString().slice(0, 10);

const statusDot: Record<string, "success" | "warning" | "error" | "accent"> = {
  scheduled: "accent",
  overdue: "error",
  completed: "success",
  "in-progress": "warning",
};

const freqColors: Record<string, "info" | "warning" | "success" | "neutral" | "blue"> = {
  daily: "info",
  weekly: "warning",
  monthly: "success",
  quarterly: "blue",
  yearly: "neutral",
};

export default function PMCalendarPage() {
  const [selectedDate, setSelectedDate] = useState<`${number}${number}${number}${number}-${number}${number}-${number}${number}` | undefined>(todayStr);
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
      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <Heading level={2}>ปฏิทินงานซ่อมบำรุง (PM Calendar)</Heading>
          <Text type="body" color="secondary">ติดตามแผนงานซ่อมบำรุงเชิงป้องกัน (Preventive & Autonomous Maintenance)</Text>
        </VStack>
        <HStack gap={3}>
          <Button
            label={viewAll ? "กลับไปดูตามวันที่" : "ดูแผนทั้งหมด"}
            variant={viewAll ? "primary" : "secondary"}
            icon={<Icon icon={ClockIcon} size="sm" />}
            onClick={() => setViewAll((v) => !v)}
          />
          <Button label="สร้างแผน PM ใหม่" variant="primary" icon={<Icon icon={PlusIcon} size="sm" />} onClick={() => window.location.href = '/pm_am/create'} />
          <Button
            label="ส่งออก iCal"
            variant="secondary"
            size="sm"
            icon={<Icon icon={CalendarDaysIcon} size="sm" />}
            onClick={() => window.open('/api/v1/pm_ical.php', '_blank')}
          />
        </HStack>
      </HStack>

      <Grid columns={4} gap={4}>
         <Card padding={4} variant="muted" style={{ borderLeft: '4px solid var(--color-error)' }}>
           <HStack gap={3} vAlign="center">
             <div style={{ padding: 12, borderRadius: 8, backgroundColor: 'var(--color-error-wash)' }}>
               <Icon icon={ExclamationTriangleIcon} color="error" size="md" />
             </div>
             <VStack gap={1}>
                <Text type="supporting" weight="bold" style={{ color: "var(--color-error)" }}>งานเลยกำหนด</Text>
               <Heading level={3}>{overdueCount} <span style={{ fontSize: 14, color: 'var(--color-secondary)' }}>งาน</span></Heading>
             </VStack>
           </HStack>
         </Card>

         <Card padding={4} variant="muted" style={{ borderLeft: '4px solid var(--color-accent)' }}>
           <HStack gap={3} vAlign="center">
             <div style={{ padding: 12, borderRadius: 8, backgroundColor: 'var(--color-accent-wash)' }}>
               <Icon icon={CalendarDaysIcon} color="accent" size="md" />
             </div>
             <VStack gap={1}>
               <Text type="supporting" weight="bold" color="accent" style={{ textTransform: 'uppercase' }}>แผนงานวันนี้ (Today)</Text>
               <Heading level={3}>{todayCount} <span style={{ fontSize: 14, color: 'var(--color-secondary)' }}>งาน</span></Heading>
             </VStack>
           </HStack>
         </Card>

         <Card padding={4} variant="muted" style={{ borderLeft: '4px solid var(--color-success)' }}>
           <HStack gap={3} vAlign="center">
             <div style={{ padding: 12, borderRadius: 8, backgroundColor: 'var(--color-success-wash)' }}>
               <Icon icon={CheckCircleIcon} color="success" size="md" />
             </div>
             <VStack gap={1}>
                <Text type="supporting" weight="bold" style={{ color: "var(--color-success)", textTransform: 'uppercase' }}>เสร็จแล้ววันนี้</Text>
               <Heading level={3}>{completedCount} <span style={{ fontSize: 14, color: 'var(--color-secondary)' }}>งาน</span></Heading>
             </VStack>
           </HStack>
         </Card>

         <Card padding={4} variant="muted" style={{ borderLeft: '4px solid var(--color-warning)' }}>
           <HStack gap={3} vAlign="center">
             <div style={{ padding: 12, borderRadius: 8, backgroundColor: 'var(--color-warning-wash)' }}>
               <Icon icon={WrenchScrewdriverIcon} color="warning" size="md" />
             </div>
             <VStack gap={1}>
                <Text type="supporting" weight="bold" style={{ color: "var(--color-warning)", textTransform: 'uppercase' }}>ช่างที่กำลังปฏิบัติงาน</Text>
               <Heading level={3}>{activeTechCount} <span style={{ fontSize: 14, color: 'var(--color-secondary)' }}>คน</span></Heading>
             </VStack>
           </HStack>
         </Card>
      </Grid>

      <Grid columns={3} gap={6}>
        <div style={{ gridColumn: 'span 1' }}>
          <Card padding={4}>
            <Calendar value={selectedDate} onChange={setSelectedDate} />
          </Card>
          
          <Card padding={4} style={{ marginTop: 16 }}>
             <VStack gap={3}>
               <Heading level={5}>สัญลักษณ์ (Legend)</Heading>
               <HStack gap={2} vAlign="center">
                 <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: 'var(--color-error)' }} />
                 <Text type="body" size="sm">Overdue (ล่าช้า)</Text>
               </HStack>
               <HStack gap={2} vAlign="center">
                 <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: 'var(--color-warning)' }} />
                 <Text type="body" size="sm">In Progress (กำลังทำ)</Text>
               </HStack>
               <HStack gap={2} vAlign="center">
                 <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: 'var(--color-accent)' }} />
                 <Text type="body" size="sm">Scheduled (รอทำ)</Text>
               </HStack>
               <HStack gap={2} vAlign="center">
                 <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: 'var(--color-success)' }} />
                 <Text type="body" size="sm">Completed (เสร็จสิ้น)</Text>
               </HStack>
             </VStack>
          </Card>
        </div>

        <div style={{ gridColumn: 'span 2' }}>
          <Card padding={5} style={{ height: '100%' }}>
            <VStack gap={4}>
              <HStack hAlign="between" vAlign="center" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 12 }}>
                <Heading level={4}>
                  {viewAll ? "แผน PM ทั้งหมด (ทุกวันที่)" : `รายการ PM ประจำวันที่ ${selectedDate || "ไม่ได้เลือกวันที่"}`}
                </Heading>
                <Badge label={`${visibleTasks.length} งาน`} variant="neutral" />
              </HStack>
              
              {visibleTasks.length === 0 ? (
                <VStack gap={4} hAlign="center" vAlign="center" style={{ minHeight: 300, opacity: 0.5 }}>
                  <Icon icon={CalendarDaysIcon} size="lg" />
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
                            {viewAll && <Badge label={t.date} variant="neutral" />}
                            <Text type="body" weight="bold">{t.id}</Text>
                            <Badge label={t.type.charAt(0).toUpperCase() + t.type.slice(1)} variant={freqColors[t.type] || "neutral"} />
                            <Badge label={t.status} variant={statusDot[t.status]} />
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
                           {t.status === 'scheduled' && <Button label="เริ่มงาน" variant="primary" size="sm" />}
                           {t.status === 'in-progress' && <Button label="ทำเช็คชีท" variant="secondary" size="sm" onClick={() => window.location.href = '/pm_am/checksheet'} />}
                           {t.status === 'completed' && <Button label="ดูผลตรวจ" variant="ghost" size="sm" />}
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
