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
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { IconButton } from "@astryxdesign/core/IconButton";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Pagination } from "@astryxdesign/core/Pagination";
import { Icon } from "@astryxdesign/core/Icon";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { 
  MagnifyingGlassIcon,
  CalendarIcon,
  PlusIcon,
  DocumentCheckIcon,
  ListBulletIcon,
  TrashIcon
} from "@heroicons/react/24/outline";

interface PMTask extends Record<string, unknown> {
  rawId: number;
  id: string;
  asset: string;
  task: string;
  frequency: string;
  nextDue: string;
  assignee: string;
  teamNames: string[];
  status: "pending" | "in_progress" | "completed" | "overdue" | "skipped";
}

const statusColors: Record<string, "neutral" | "blue" | "warning" | "success" | "error"> = {
  "pending": "neutral",
  "due": "warning",
  "in_progress": "blue",
  "completed": "success",
  "overdue": "error",
  "skipped": "warning",
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
          teamNames: Array.isArray(row.team) ? row.team.map((m: any) => m.full_name || "") : [],
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
      renderCell: (item) => <Badge label={freqLabels[item.frequency] || item.frequency} variant="neutral" />,
    },
    { key: "nextDue", header: "วันครบกำหนด", width: proportional(1.5) },
    {
      key: "assignee",
      header: "ผู้รับผิดชอบ",
      width: proportional(1.5),
      renderCell: (item) => (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text type="body" size="sm">{item.assignee}</Text>
          {item.teamNames.length > 1 && (
            <span className="cmms-andon-chip" style={{ background: "rgba(30,136,229,0.12)", color: "var(--cmms-primary)", fontSize: "0.65rem", padding: "2px 7px" }}>
              +{item.teamNames.length - 1} ทีม
            </span>
          )}
        </HStack>
      ),
    },
    {
      key: "status",
      header: "สถานะ",
      width: proportional(1),
      renderCell: (item) => (
        <Badge label={statusLabels[item.status] || item.status} variant={statusColors[item.status] || "neutral"} />
      ),
    },
    {
      key: "actions",
      header: "จัดการ",
      width: proportional(2),
      renderCell: (item) => (
        <HStack gap={2}>
          <Button
            size="sm"
            variant="secondary"
            label="อัปเดต"
            onClick={() => router.push(`/pm_am/edit?id=${item.rawId}`)}
          />
          <IconButton
            size="sm"
            variant="destructive"
            label="ลบแผน PM"
            icon={<Icon icon={TrashIcon} size="sm" />}
            onClick={() => handleDelete(item.rawId)}
          />
        </HStack>
      ),
    },
  ];

  return (
    <VStack gap={6}>
      <Card elevation="low" padding={6} className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow">PM AM · CMMS-TOPPAN</Text>
          <Heading level={2}>แผนบำรุงรักษาเชิงป้องกัน (PM)</Heading>
          <Text type="body" color="secondary">แผนซ่อมบำรุงเชิงป้องกัน และตารางตรวจเช็คเครื่องจักร</Text>
        </VStack>
        <HStack gap={2}>
          <Button label="มุมมองปฏิทิน" variant="secondary" icon={<Icon icon={CalendarIcon} size="sm" />} onClick={() => router.push("/pm_am/calendar")} />
          <Link href="/pm_am/create">
            <Button label="สร้างแผน PM ใหม่" variant="primary" icon={<Icon icon={PlusIcon} size="sm" />} />
          </Link>
        </HStack>
      </Card>

      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">แผนบำรุงรักษาทั้งหมด</Text>
            <Heading level={2}><CountUp end={stats.total} /> <Text type="body" size="sm">รายการ</Text></Heading>
          </VStack>
        </Card>
        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" className="text-blue-600">รอตรวจเช็ค</Text>
            <Heading level={2} className="text-blue-600"><CountUp end={stats.dueThisWeek} /> <Text type="body" size="sm">รายการ</Text></Heading>
          </VStack>
        </Card>
        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" className="text-emerald-600">อัตราการปฏิบัติตามแผน</Text>
            <Heading level={2} className="text-emerald-600"><CountUp end={stats.complianceRate} /> <Text type="body" size="sm">%</Text></Heading>
          </VStack>
        </Card>
        {stats.overdue > 0 && (
          <Card elevation="low" padding={4} className="border-rose-500 bg-rose-50 dark:bg-rose-900/10">
            <VStack gap={1}>
              <Text type="supporting" className="text-rose-600">เลยกำหนด</Text>
              <Heading level={2} className="text-rose-600"><CountUp end={stats.overdue} /> <Text type="body" size="sm">รายการ</Text></Heading>
            </VStack>
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
