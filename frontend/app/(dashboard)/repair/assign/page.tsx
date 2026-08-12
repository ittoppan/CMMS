"use client";

import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/components/ToastProvider";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Table, proportional, useTablePagination } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Spinner } from "@astryxdesign/core/Spinner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { useRouter } from "next/navigation";
import {
  MagnifyingGlassIcon,
  UserPlusIcon,
  ArrowPathIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

interface AssignWO extends Record<string, unknown> {
  id: string;
  rawId: number;
  woNumber: string;
  asset: string;
  title: string;
  priority: string;
  status: string;
  assignee: string;
  assigneeId: number | null;
  assigneeAvatar?: string | null;
  requestDate: string;
  description: string;
}

interface Technician {
  value: string;
  label: string;
  avatar?: string | null;
}

const priorityColors: Record<string, "error" | "warning" | "info" | "neutral"> = {
  critical: "error", Critical: "error",
  high: "warning", High: "warning",
  medium: "info", Medium: "info",
  low: "neutral", Low: "neutral",
};

const statusColors: Record<string, "success" | "warning" | "error" | "accent" | "neutral"> = {
  open: "warning", pending: "warning",
  in_progress: "accent",
  waiting_parts: "neutral", pending_parts: "neutral",
};

// สถานะที่ยังรอจ่ายงาน / ทำงานอยู่ (ยังไม่เสร็จ)
const OPEN_STATUSES = ["open", "pending", "in_progress", "waiting_parts", "pending_parts"];

const PAGE_SIZE = 10;

// แปลง path รูปโปรไฟล์จาก API (avatar = base64 data URL รูปจริง, avatar_path = ไฟล์ default บนดิสก์)
// ใช้ avatar (data URL) ก่อนเสมอ — avatar_path เป็นค่า default ร่วมกัน (user_male.jpg) ไม่ใช่รูปเฉพาะคน
function normalizeAvatar(avatar?: string | null, avatarPath?: string | null): string | null {
  const raw = avatar || avatarPath || "";
  if (!raw) return null;
  const cleaned = String(raw).replace(/\\/g, "/");
  return cleaned.startsWith("data:") || cleaned.startsWith("/") ? cleaned : "/" + cleaned;
}

export default function RepairAssignPage() {
  const router = useRouter();
  const [workOrders, setWorkOrders] = useState<AssignWO[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  // Dialog state
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedWo, setSelectedWo] = useState<AssignWO | null>(null);
  const [selectedTech, setSelectedTech] = useState("");
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [woRes, userRes] = await Promise.all([
        fetch("/api/v1/repair.php"),
        fetch("/api/v1/users.php"),
      ]);
      const woJson = await woRes.json();
      const userJson = await userRes.json();
      if (Array.isArray(woJson)) {
        const fetched = woJson
          .filter((row: any) => !row.status || OPEN_STATUSES.includes(row.status))
          .map((row: any) => ({
            rawId: row.id,
            id: `wo-${row.id}`,
            woNumber: row.work_order_no || `WO-${row.id}`,
            asset: row.asset_name || "ไม่ระบุ",
            title: row.title || "",
            priority: row.priority || "medium",
            status: row.status || "open",
            assignee: row.assigned_name || "ยังไม่มอบหมาย",
            assigneeId: row.assigned_to || null,
            requestDate: row.created_at ? row.created_at.split(" ")[0] : "-",
            description: row.description || row.failure_report || row.symptoms || "",
          }));
        setWorkOrders(fetched);
      }
      if (Array.isArray(userJson)) {
        const techs: Technician[] = userJson
          .filter((u: any) => u.is_active !== 0)
          .map((u: any) => ({
            value: String(u.id),
            label: `${u.full_name}${u.role ? ` (${u.role})` : ""}`,
            avatar: normalizeAvatar(u.avatar, u.avatar_path),
          }));
        setTechnicians(techs);
        // ผูก avatar กับใบงานที่มอบหมายแล้ว (สำหรับคอลัมน์ผู้รับผิดชอบ)
        const avatarByUser = new Map(techs.map((t) => [t.value, t.avatar]));
        setWorkOrders((prev) =>
          prev.map((wo) =>
            wo.assigneeId ? { ...wo, assigneeAvatar: avatarByUser.get(String(wo.assigneeId)) || null } : wo
          )
        );
      }
    } catch (e) {
      console.error("Failed to fetch assign data", e);
      setError("ไม่สามารถโหลดรายการงานซ่อมได้ กรุณาลองใหม่อีกครั้ง");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    return workOrders.filter((wo) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        wo.woNumber.toLowerCase().includes(q) ||
        wo.asset.toLowerCase().includes(q) ||
        wo.assignee.toLowerCase().includes(q);
      const matchStatus = !statusFilter || wo.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter, workOrders]);

  const stats = useMemo(() => {
    const unassigned = workOrders.filter((w) => !w.assigneeId).length;
    const assigned = workOrders.filter((w) => w.assigneeId && w.status !== "in_progress").length;
    const inprog = workOrders.filter((w) => w.status === "in_progress").length;
    return { total: workOrders.length, unassigned, assigned, inprog };
  }, [workOrders]);

  const totalItems = filtered.length;
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pagination = useTablePagination<AssignWO>({
    page,
    onPageChange: setPage,
    totalItems,
    pageSize: PAGE_SIZE,
  });

  const handleAssignClick = (wo: AssignWO) => {
    setSelectedWo(wo);
    setSelectedTech(wo.assigneeId ? String(wo.assigneeId) : "");
    setAssignOpen(true);
  };

  const submitAssign = async () => {
    if (!selectedWo || !selectedTech) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/repair.php?id=${selectedWo.rawId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigned_to: Number(selectedTech),
          status: "in_progress",
          acknowledged_at: new Date().toISOString().slice(0, 19).replace("T", " "),
          actual_start_at: new Date().toISOString().slice(0, 19).replace("T", " "),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setAssignOpen(false);
        showToast("success", `จ่ายงาน ${selectedWo.woNumber} เรียบร้อยแล้ว`);
        fetchData();
      } else {
        setError(json.error || "ไม่สามารถบันทึกการจ่ายงานได้");
      }
    } catch (e) {
      console.error(e);
      setError("เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่");
    }
    setSaving(false);
  };

  const columns: TableColumn<AssignWO>[] = [
    {
      key: "woNumber",
      header: "เลขที่ใบงาน",
      width: proportional(1.2),
      renderCell: (row: AssignWO) => (
        <Text type="body" weight="bold" style={{ color: 'var(--cmms-primary)' }}>{row.woNumber}</Text>
      ),
    },
    {
      key: "priority",
      header: "ความด่วน",
      width: proportional(0.9),
      renderCell: (row: AssignWO) => (
        <Badge label={row.priority} variant={priorityColors[row.priority] || "neutral"} />
      ),
    },
    {
      key: "asset",
      header: "เครื่องจักร",
      width: proportional(1.6),
      renderCell: (row: AssignWO) => (
        <VStack gap={0}>
          <Text type="body" weight="semibold">{row.asset}</Text>
          {row.title && <Text type="body" size="sm" color="secondary">{row.title}</Text>}
        </VStack>
      ),
    },
    { key: "requestDate", header: "วันที่แจ้ง", width: proportional(1) },
    {
      key: "status",
      header: "สถานะ / ผู้รับผิดชอบ",
      width: proportional(1.5),
      renderCell: (row: AssignWO) => {
        if (!row.assigneeId) {
          return <Badge label="รอมอบหมายงาน" variant="neutral" />;
        }
        return (
          <HStack gap={2} vAlign="center">
            <Badge label={row.status === "in_progress" ? "กำลังซ่อม" : "มอบหมายแล้ว"} variant={statusColors[row.status] || "neutral"} />
            <Avatar name={row.assignee} src={row.assigneeAvatar || undefined} size="sm" tooltip={row.assignee} />
            <Text type="body" size="sm">{row.assignee}</Text>
          </HStack>
        );
      },
    },
    {
      key: "actions",
      header: "การจัดการ",
      width: proportional(1),
      renderCell: (row: AssignWO) => (
        <Button
          size="sm"
          variant={!row.assigneeId ? "primary" : "secondary"}
          icon={<Icon icon={!row.assigneeId ? UserPlusIcon : ArrowPathIcon} size="sm" />}
          label={!row.assigneeId ? "จ่ายงาน" : "เปลี่ยนช่าง"}
          onClick={() => handleAssignClick(row)}
        />
      ),
    },
  ];

  return (
    <VStack gap={6}>
      {error && (
        <Banner status="error" title="Error" description={error} isDismissable={false} />
      )}

      {/* Header */}
      <HStack hAlign="between" vAlign="start">
        <VStack gap={1}>
          <Heading level={2}>แจกงานซ่อม (Dispatch)</Heading>
          <Text type="body" color="secondary">มอบหมายใบแจ้งซ่อมให้กับช่างซ่อมบำรุงที่เหมาะสม</Text>
        </VStack>
        <Button
          label="รีเฟรช"
          variant="secondary"
          size="md"
          onClick={fetchData}
          icon={<Icon icon={ArrowPathIcon} size="sm" />}
        />
      </HStack>

      {/* Stat badges */}
      <HStack gap={2} wrap="wrap">
        <Badge label={`📋 งานที่ยังไม่เสร็จ: ${stats.total}`} variant="neutral" />
        <Badge label={`🟡 รอมอบหมาย: ${stats.unassigned}`} variant="warning" />
        <Badge label={`🔵 มอบหมายแล้ว: ${stats.assigned}`} variant="info" />
        <Badge label={`🛠️ กำลังซ่อม: ${stats.inprog}`} variant="info" />
      </HStack>

      {/* Filter Toolbar */}
      <Toolbar
        label="ตัวกรองงานซ่อม"
        startContent={
          <>
            <TextInput
              label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหาเลขงาน, เครื่องจักร..."
              startIcon={MagnifyingGlassIcon}
              value={search}
              onChange={setSearch}
            />
            <Selector
              label="สถานะ"
              isLabelHidden
              placeholder="ทุกสถานะ"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "", label: "ทุกสถานะ" },
                { value: "open", label: "รอมอบหมาย / รอดำเนินการ" },
                { value: "in_progress", label: "กำลังซ่อม" },
                { value: "waiting_parts", label: "รออะไหล่" },
              ]}
            />
          </>
        }
      />

      {/* Table */}
      {loading ? (
        <HStack hAlign="center" style={{ padding: 40 }}>
          <Spinner size="md" />
          <Text type="body" color="secondary">กำลังโหลดข้อมูล...</Text>
        </HStack>
      ) : paged.length === 0 ? (
        <EmptyState
          title="ไม่มีงานที่ต้องจ่าย"
          description="งานซ่อมทั้งหมดมอบหมายครบแล้ว หรือลองเปลี่ยนตัวกรอง"
          icon={<Icon icon={MagnifyingGlassIcon} size="lg" />}
        />
      ) : (
        <Table<AssignWO>
          data={paged}
          columns={columns}
          idKey="id"
          density="balanced"
          dividers="rows"
          hasHover
          plugins={{ pagination }}
        />
      )}

      {/* Assign Dialog */}
      <Dialog isOpen={assignOpen} onOpenChange={setAssignOpen}>
        <DialogHeader
          title={selectedWo?.assigneeId ? "เปลี่ยนผู้รับผิดชอบงานซ่อม" : "มอบหมายงานซ่อม"}
          onOpenChange={setAssignOpen}
        />
        <div style={{ padding: "16px 0" }}>
          <VStack gap={4}>
            <VStack gap={1}>
              <Text type="body" color="secondary" size="sm">ใบงาน:</Text>
              <Text type="body" weight="bold">{selectedWo?.woNumber}</Text>
              <Text type="body" color="secondary" size="sm">เครื่องจักร:</Text>
              <Text type="body" weight="semibold">{selectedWo?.asset}</Text>
              {selectedWo?.description && (
                <>
                  <Text type="body" color="secondary" size="sm">รายละเอียด:</Text>
                  <Text type="body" size="sm">{selectedWo.description}</Text>
                </>
              )}
            </VStack>
            <VStack gap={1}>
              <Text type="body" weight="bold">เลือกช่างซ่อมบำรุง *</Text>
              {(() => {
                const sel = technicians.find((t) => t.value === selectedTech);
                return sel ? (
                  <HStack gap={2} vAlign="center" style={{ marginBottom: 4 }}>
                    <Avatar name={sel.label.split(" (")[0]} src={sel.avatar || undefined} size="sm" />
                    <Text type="body" size="sm" weight="semibold">{sel.label.split(" (")[0]}</Text>
                    <Text type="body" size="sm" color="secondary">{sel.label.includes("(") ? `(${sel.label.split(" (")[1]}` : ""}</Text>
                  </HStack>
                ) : null;
              })()}
              <Selector
                label="เลือกช่าง"
                isLabelHidden
                placeholder="เลือกช่าง..."
                options={technicians}
                value={selectedTech}
                onChange={(v) => setSelectedTech(String(v))}
              />
            </VStack>
          </VStack>
        </div>
        <HStack hAlign="end" gap={3} style={{ paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
          <Button label="ยกเลิก" variant="secondary" onClick={() => setAssignOpen(false)} />
          <Button
            label={saving ? "กำลังบันทึก..." : "ยืนยันการจ่ายงาน"}
            variant="primary"
            isDisabled={!selectedTech || saving}
            onClick={submitAssign}
            icon={<Icon icon={CheckCircleIcon} size="sm" />}
          />
        </HStack>
      </Dialog>

    </VStack>
  );
}
