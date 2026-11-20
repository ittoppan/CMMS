"use client";

import * as React from "react";
import { Download, Plus } from "lucide-react";
import { PageHeader, KpiStrip, ListToolbar, type KpiItem } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** หน้าตัวอย่างชั่วคราวของ component กลาง 3 ตัว — ใช้ข้อมูลปลอมทั้งหมด ลบทิ้งได้ */

type Row = {
  id: string;
  title: string;
  asset: string;
  status: "open" | "in_progress" | "completed";
  priority: "critical" | "high" | "medium" | "low";
  technician: string;
};

const ROWS: Row[] = [
  { id: "EN-1041", title: "ปั๊มน้ำแรงดันตก", asset: "PUMP-01", status: "open", priority: "critical", technician: "สมชาย" },
  { id: "EN-1042", title: "สายพานลำเลียงสั่น", asset: "CNV-07", status: "in_progress", priority: "high", technician: "วิชัย" },
  { id: "EN-1043", title: "เซ็นเซอร์อุณหภูมิอ่านค่าไม่ได้", asset: "OVN-02", status: "open", priority: "medium", technician: "อรทัย" },
  { id: "EN-1044", title: "เปลี่ยนไส้กรองอากาศ", asset: "CMP-03", status: "completed", priority: "low", technician: "ประเสริฐ" },
  { id: "EN-1045", title: "มอเตอร์ร้อนเกินกำหนด", asset: "MTR-11", status: "in_progress", priority: "high", technician: "สมชาย" },
  { id: "EN-1046", title: "วาล์วนิรภัยรั่วซึม", asset: "VLV-05", status: "open", priority: "critical", technician: "วิชัย" },
];

const STATUS_LABEL: Record<Row["status"], string> = {
  open: "รอดำเนินการ",
  in_progress: "กำลังซ่อม",
  completed: "เสร็จสิ้น",
};

const STATUS_BADGE: Record<Row["status"], "neutral" | "primary" | "success"> = {
  open: "neutral",
  in_progress: "primary",
  completed: "success",
};

const PRIORITY_LABEL: Record<Row["priority"], string> = {
  critical: "วิกฤต",
  high: "ด่วน",
  medium: "ปกติ",
  low: "ต่ำ",
};

const ALL = "__all";

export default function UiDemoPage() {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [technician, setTechnician] = React.useState("");

  const activeFilterCount = [status, priority, technician].filter(Boolean).length;

  const filtered = ROWS.filter((row) => {
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      row.title.toLowerCase().includes(q) ||
      row.asset.toLowerCase().includes(q) ||
      row.id.toLowerCase().includes(q);
    return (
      matchSearch &&
      (!status || row.status === status) &&
      (!priority || row.priority === priority) &&
      (!technician || row.technician === technician)
    );
  });

  const reset = () => {
    setSearch("");
    setStatus("");
    setPriority("");
    setTechnician("");
  };

  const kpis: KpiItem[] = [
    { label: "งานทั้งหมด", value: ROWS.length, unit: "รายการ" },
    {
      label: "รอดำเนินการ",
      value: ROWS.filter((r) => r.status === "open").length,
      unit: "รายการ",
      tone: "warning",
      active: status === "open",
      onClick: () => setStatus(status === "open" ? "" : "open"),
    },
    {
      label: "กำลังซ่อม",
      value: ROWS.filter((r) => r.status === "in_progress").length,
      unit: "รายการ",
      active: status === "in_progress",
      onClick: () => setStatus(status === "in_progress" ? "" : "in_progress"),
    },
    {
      label: "เสร็จสิ้น",
      value: ROWS.filter((r) => r.status === "completed").length,
      unit: "รายการ",
      tone: "success",
      active: status === "completed",
      onClick: () => setStatus(status === "completed" ? "" : "completed"),
    },
    {
      label: "งานวิกฤต",
      value: ROWS.filter((r) => r.priority === "critical").length,
      unit: "รายการ",
      tone: "danger",
      active: priority === "critical",
      onClick: () => setPriority(priority === "critical" ? "" : "critical"),
    },
  ];

  return (
    <div className="w-full space-y-6">
      <PageHeader
        eyebrow={<p className="cmms-eyebrow">ตัวอย่าง component</p>}
        breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "UI demo" }]}
        title="หน้าใช้งานตัวอย่าง UI"
        description="หน้านี้เป็นตัวอย่างชั่วคราวของ PageHeader, KpiStrip และ ListToolbar — ข้อมูลปลอม ไม่ได้ต่อ API"
        primaryAction={
          <Button variant="primary">
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            แจ้งซ่อมใหม่
          </Button>
        }
        actions={[
          <Button key="export" variant="secondary">
            <Download className="h-4 w-4" strokeWidth={1.75} />
            ส่งออก Excel
          </Button>,
          <Button key="pdf" variant="secondary">
            ดาวน์โหลด PDF
          </Button>,
        ]}
      />

      <KpiStrip items={kpis} ariaLabel="สรุปงานซ่อม" />

      <ListToolbar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "ค้นหาเลขงาน, ชื่อเครื่องจักร...",
        }}
        filters={
          <>
            <Select
              value={status || ALL}
              onValueChange={(v) => setStatus(v === ALL ? "" : v)}
            >
              <SelectTrigger aria-label="สถานะ" className="w-full sm:w-44">
                <SelectValue placeholder="ทุกสถานะ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>ทุกสถานะ</SelectItem>
                <SelectItem value="open">รอดำเนินการ</SelectItem>
                <SelectItem value="in_progress">กำลังซ่อม</SelectItem>
                <SelectItem value="completed">เสร็จสิ้น</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={priority || ALL}
              onValueChange={(v) => setPriority(v === ALL ? "" : v)}
            >
              <SelectTrigger aria-label="ความสำคัญ" className="w-full sm:w-40">
                <SelectValue placeholder="ทุกความสำคัญ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>ทุกความสำคัญ</SelectItem>
                <SelectItem value="critical">วิกฤต</SelectItem>
                <SelectItem value="high">ด่วน</SelectItem>
                <SelectItem value="medium">ปกติ</SelectItem>
                <SelectItem value="low">ต่ำ</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        advancedFilters={
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <Select
              value={technician || ALL}
              onValueChange={(v) => setTechnician(v === ALL ? "" : v)}
            >
              <SelectTrigger aria-label="ช่างผู้รับผิดชอบ" className="w-full">
                <SelectValue placeholder="ช่างผู้รับผิดชอบ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>ช่างทุกคน</SelectItem>
                <SelectItem value="สมชาย">สมชาย</SelectItem>
                <SelectItem value="วิชัย">วิชัย</SelectItem>
                <SelectItem value="อรทัย">อรทัย</SelectItem>
                <SelectItem value="ประเสริฐ">ประเสริฐ</SelectItem>
              </SelectContent>
            </Select>
            <Input label="รหัสเครื่องจักร" placeholder="เช่น PUMP-01" />
          </div>
        }
        activeFilterCount={activeFilterCount}
        onReset={reset}
        rightSlot={
          <Button variant="outline" className="min-h-11 md:min-h-10">
            ตั้งค่าคอลัมน์
          </Button>
        }
      />

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">รายการงานซ่อม</h2>
          <Badge variant="neutral">{filtered.length} รายการ</Badge>
        </div>

        {filtered.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            ไม่พบรายการที่ตรงกับตัวกรอง — กด “ล้างค่า” เพื่อเริ่มใหม่
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((row) => (
              <Card key={row.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{row.id}</p>
                    <p className="mt-0.5 text-sm text-foreground">{row.title}</p>
                  </div>
                  <Badge variant={STATUS_BADGE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">เครื่องจักร</dt>
                    <dd className="text-foreground">{row.asset}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">ความสำคัญ</dt>
                    <dd className="text-foreground">{PRIORITY_LABEL[row.priority]}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">ช่าง</dt>
                    <dd className="text-foreground">{row.technician}</dd>
                  </div>
                </dl>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
