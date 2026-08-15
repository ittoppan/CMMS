"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import CountUp from "react-countup";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Pagination } from "@astryxdesign/core/Pagination";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { 
  MagnifyingGlassIcon,
  CalendarIcon,
  PlusIcon,
  DocumentCheckIcon,
  ListBulletIcon,
  TrashIcon,
  PencilSquareIcon,
  WrenchScrewdriverIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";

interface PMTask extends Record<string, unknown> {
  rawId: number;
  id: string;
  asset: string;
  task: string;
  frequency: string;
  nextDue: string;
  assignee: string;
  status: "pending" | "in_progress" | "completed" | "overdue" | "skipped";
}

const statusChipStyle: Record<string, React.CSSProperties> = {
  pending: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
  due: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  in_progress: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  completed: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  overdue: { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" },
  skipped: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
};

const statusLabels: Record<string, string> = {
  "pending": "รอดำเนินการ",
  "due": "ถึงกำหนด",
  "in_progress": "กำลังดำเนินการ",
  "completed": "เสร็จสิ้น",
  "overdue": "เกินกำหนด",
  "skipped": "ข้ามรอบ",
};

const freqLabels: Record<string, string> = {
  "daily": "รายวัน",
  "weekly": "รายสัปดาห์",
  "monthly": "รายเดือน",
  "quarterly": "รายไตรมาส",
  "yearly": "รายปี",
};

const PAGE_SIZE = 10;
const TABS = ["All", "daily", "weekly", "monthly", "yearly"];

export default function PMSchedulePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [tasks, setTasks] = useState<PMTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchPMs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/pm_am.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any) => ({
          rawId: row.id,
          id: `PM-${String(row.id).padStart(3, '0')}`,
          asset: row.asset_name || "ไม่ระบุ",
          task: row.title || "ไม่ระบุ",
          frequency: row.frequency_type || "monthly",
          nextDue: row.due_date || "-",
          assignee: row.assigned_name || row.assigned_to || "-",
          status: row.status || "pending",
        }));
        setTasks(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch PMs", e);
      setError("Failed to fetch PM tasks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPMs(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("ยืนยันการลบแผน PM นี้หรือไม่?")) return;
    try {
      await fetch(`/api/v1/pm_am.php?id=${id}`, { method: "DELETE" });
      fetchPMs();
    } catch (e) {
      console.error("Failed to delete PM", e);
    }
  };

  const stats = useMemo(() => {
    const total = tasks.length;
    const dueThisWeek = tasks.filter(t => t.status === "pending" || t.status === "in_progress").length;
    const overdue = tasks.filter(t => t.status === "overdue").length;
    const completed = tasks.filter(t => t.status === "completed").length;
    const complianceRate = total > 0 ? Math.round((completed / (total)) * 100) : 0;
    return { total, dueThisWeek, overdue, completed, complianceRate };
  }, [tasks]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      const matchTab = activeTab === "All" || t.frequency === activeTab;
      const q = search.toLowerCase();
      const matchSearch = !q || t.id.toLowerCase().includes(q) || t.asset.toLowerCase().includes(q) || t.task.toLowerCase().includes(q);
      return matchTab && matchSearch;
    });
  }, [search, activeTab, tasks]);

  const totalItems = filtered.length;
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);

  const columns: TableColumn<PMTask>[] = [
    { key: "id", header: "เลขที่ PM", width: proportional(1) },
    { key: "asset", header: "เครื่องจักร/อุปกรณ์", width: proportional(2) },
    { key: "task", header: "ชื่องาน", width: proportional(2) },
    {
      key: "frequency",
      header: "รอบ/ความถี่",
      width: proportional(1),
      renderCell: (item) => (
        <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
          {freqLabels[item.frequency] || item.frequency}
        </span>
      ),
    },
    { key: "nextDue", header: "วันครบกำหนด", width: proportional(1.5) },
    { key: "assignee", header: "ผู้รับผิดชอบ", width: proportional(1.5) },
    {
      key: "status",
      header: "สถานะ",
      width: proportional(1),
      renderCell: (item) => (
        <span className="cmms-andon-chip" style={statusChipStyle[item.status] || statusChipStyle.pending}>
          {statusLabels[item.status] || item.status}
        </span>
      ),
    },
    {
      key: "actions",
      header: "จัดการ",
      width: proportional(2),
      renderCell: (item) => (
        <HStack gap={2}>
          <button
            type="button"
            onClick={() => router.push(`/pm_am/edit?id=${item.rawId}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
          >
            <PencilSquareIcon className="w-3.5 h-3.5" />
            อัปเดต
          </button>
          <button
            type="button"
            onClick={() => handleDelete(item.rawId)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all duration-300"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            ลบ
          </button>
        </HStack>
      ),
    },
  ];

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>PM AM · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>แผนบำรุงรักษาเชิงป้องกัน (PM)</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <WrenchScrewdriverIcon className="w-3.5 h-3.5" /> แผน {stats.total} รายการ
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            แผนซ่อมบำรุงเชิงป้องกัน และตารางตรวจเช็คเครื่องจักร
          </Text>
        </VStack>
        <HStack gap={2}>
          <button
            type="button"
            onClick={() => router.push("/pm_am/calendar")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
          >
            <CalendarIcon className="w-4 h-4" />
            มุมมองปฏิทิน
          </button>
          <a href="/pm_am/create" className="cmms-btn-primary">
            <PlusIcon className="w-4 h-4" />
            สร้างแผน PM ใหม่
          </a>
        </HStack>
      </div>

      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="cmms-icon-tile">
              <ListBulletIcon className="w-5 h-5" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">แผนบำรุงรักษาทั้งหมด</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={stats.total} /> <Text type="body" size="sm">รายการ</Text></Heading>
            </VStack>
          </HStack>
        </Card>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="cmms-icon-tile cmms-icon-tile--blue">
              <ClipboardDocumentCheckIcon className="w-5 h-5" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">รอตรวจเช็ค</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={stats.dueThisWeek} /> <Text type="body" size="sm">รายการ</Text></Heading>
            </VStack>
          </HStack>
        </Card>
        <Card elevation="low" padding={4} className="cmms-kpi-card">
          <HStack gap={3} vAlign="center">
            <div className="cmms-icon-tile cmms-icon-tile--green">
              <DocumentCheckIcon className="w-5 h-5" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">อัตราการปฏิบัติตามแผน</Text>
              <Heading level={2} className="cmms-kpi-value"><CountUp end={stats.complianceRate} /> <Text type="body" size="sm">%</Text></Heading>
            </VStack>
          </HStack>
        </Card>
        {stats.overdue > 0 && (
          <Card elevation="low" padding={4} className="cmms-kpi-card">
            <HStack gap={3} vAlign="center">
              <div className="cmms-icon-tile cmms-icon-tile--red">
                <TrashIcon className="w-5 h-5" />
              </div>
              <VStack gap={1}>
                <Text type="supporting" color="secondary">เลยกำหนด</Text>
                <Heading level={2} className="cmms-kpi-value"><CountUp end={stats.overdue} /> <Text type="body" size="sm">รายการ</Text></Heading>
              </VStack>
            </HStack>
          </Card>
        )}
      </Grid>

      <Card padding={6} elevation="low">
        <VStack gap={4}>
          <Toolbar label="ค้นหาแผน PM" startContent={<HStack gap={3} vAlign="center" style={{ width: "100%" }}>
              <TextInput
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาแผน PM, เครื่องจักร..."
                startIcon={MagnifyingGlassIcon}
                value={search}
                onChange={setSearch}
                style={{ width: 300 }}
              />
              <div style={{ flex: 1 }} />
              <TabList
                value={activeTab}
                onChange={(v) => {
                  setActiveTab(v);
                  setPage(1);
                }}
              >
                {TABS.map((t) => (
                  <Tab key={t} value={t} label={t === "All" ? "ทั้งหมด" : (freqLabels[t] || t)} />
                ))}
              </TabList>
            </HStack>} />

          {error && <Text type="body" color="accent">{error}</Text>}

          {loading ? (
            <div style={{ padding: 40, textAlign: "center" }}>กำลังโหลดข้อมูล...</div>
          ) : (
            <Table columns={columns} data={paged} />
          )}

          {totalItems > PAGE_SIZE && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
            />
          )}
        </VStack>
      </Card>
    </VStack>
  );
}
