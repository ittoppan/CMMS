"use client";

import { useState, useMemo, useEffect } from "react";
import { usePageHero, t, statusText, priorityText } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Avatar } from "@astryxdesign/core/Avatar";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Table, proportional, useTablePagination } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { DialogHeader } from "@astryxdesign/core/Dialog";
import AnimatedDialog from "@/components/AnimatedDialog";
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
  teamIds: number[];
  assigneeAvatar?: string | null;
  requestDate: string;
  description: string;
}

interface Technician {
  value: string;
  label: string;
  avatar?: string | null;
}

const priorityColors: Record<string, React.CSSProperties> = {
  critical: { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" },
  Critical: { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" },
  high: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  High: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  medium: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  Medium: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  low: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
  Low: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
};

const statusColors: Record<string, React.CSSProperties> = {
  open: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  pending: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  in_progress: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  waiting_parts: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
  pending_parts: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
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
  const hero = usePageHero("repair/assign");
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
  const [selectedTeam, setSelectedTeam] = useState<number[]>([]);
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
            teamIds: Array.isArray(row.team_ids) ? row.team_ids.map((t: any) => Number(t)) : [],
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
    setSelectedTeam((wo.teamIds || []).filter((id) => id !== wo.assigneeId));
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
          team_ids: [Number(selectedTech), ...selectedTeam],
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
      header: t("tbl.work_order_no"),
      width: proportional(1.2),
      renderCell: (row: AssignWO) => (
        <Text type="body" weight="bold" style={{ color: 'var(--cmms-primary)' }}>{row.woNumber}</Text>
      ),
    },
    {
      key: "priority",
      header: t("tbl.priority"),
      width: proportional(0.9),
      renderCell: (row: AssignWO) => (
        <span className="cmms-andon-chip" style={priorityColors[row.priority] || { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
          {row.priority}
        </span>
      ),
    },
    {
      key: "asset",
      header: t("tbl.asset"),
      width: proportional(1.6),
      renderCell: (row: AssignWO) => (
        <VStack gap={0}>
          <Text type="body" weight="semibold">{row.asset}</Text>
          {row.title && <Text type="body" size="sm" color="secondary">{row.title}</Text>}
        </VStack>
      ),
    },
    { key: "requestDate", header: t("tbl.request_date"), width: proportional(1) },
    {
      key: "status",
      header: t("tbl.status_assignee"),
      width: proportional(1.5),
      renderCell: (row: AssignWO) => {
        if (!row.assigneeId) {
          return <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>รอมอบหมายงาน</span>;
        }
        return (
          <HStack gap={2} vAlign="center">
            <span className="cmms-andon-chip" style={statusColors[row.status] || { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
              {row.status === "in_progress" ? "กำลังซ่อม" : "มอบหมายแล้ว"}
            </span>
            <Avatar name={row.assignee} src={row.assigneeAvatar || undefined} size="sm" tooltip={row.assignee} />
            <Text type="body" size="sm">{row.assignee}</Text>
            {(row.teamIds || []).length > 1 && (
              <span className="cmms-andon-chip" style={{ background: "rgba(30,136,229,0.12)", color: "var(--cmms-primary)", fontSize: "0.7rem", padding: "2px 8px" }}>
                +{(row.teamIds || []).length - 1} ทีม
              </span>
            )}
          </HStack>
        );
      },
    },
    {
      key: "actions",
      header: t("tbl.actions"),
      width: proportional(1),
      renderCell: (row: AssignWO) => (
        <button
          type="button"
          onClick={() => handleAssignClick(row)}
          className={
            row.assigneeId
              ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
              : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cmms-btn-primary"
          }
        >
          {row.assigneeId ? <ArrowPathIcon className="w-3.5 h-3.5" /> : <UserPlusIcon className="w-3.5 h-3.5" />}
          {row.assigneeId ? "เปลี่ยนช่าง" : "จ่ายงาน"}
        </button>
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
          <Text type="body" size="sm" className="cmms-eyebrow">{hero.eyebrow}</Text>
          <Heading level={2}>{hero.title}</Heading>
          <Text type="body" color="secondary">{hero.desc}</Text>
        </VStack>
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
        >
          <ArrowPathIcon className="w-4 h-4" />{t("action.refresh")}</button>
      </HStack>

      {/* Stat badges */}
      <HStack gap={2} wrap="wrap">
        <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
          งานที่ยังไม่เสร็จ: {stats.total}
        </span>
        <span className="cmms-status warn"><span className="cmms-status-dot" />รอมอบหมาย: {stats.unassigned}</span>
        <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>
          มอบหมายแล้ว: {stats.assigned}
        </span>
        <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>
          กำลังซ่อม: {stats.inprog}
        </span>
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
                { value: "", label: t("action.filter_all_status") },
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
          icon={<MagnifyingGlassIcon className="w-6 h-6" />}
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
      <AnimatedDialog open={assignOpen} onClose={() => setAssignOpen(false)}>
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
              <Text type="body" weight="bold">หัวหน้าชุด (ผู้รับผิดชอบหลัก) *</Text>
              <Selector
                label="เลือกหัวหน้าชุด"
                isLabelHidden
                placeholder="เลือกหัวหน้าชุด..."
                options={technicians}
                value={selectedTech}
                onChange={(v) => setSelectedTech(String(v))}
              />
            </VStack>
            <VStack gap={1}>
              <Text type="body" weight="bold">ทีมซ่อมร่วม (เลือกเพิ่มได้หลายคน)</Text>
              <Text type="body" size="sm" color="secondary">ช่างในทีมจะเห็นงานนี้ใน "งานของฉัน" และรับ LINE แจ้งเตือนด้วย</Text>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6, maxHeight: 200, overflowY: "auto", border: "1px solid var(--cmms-border)", borderRadius: 10, padding: 8 }}>
                {technicians
                  .filter((t) => t.value !== selectedTech)
                  .map((t) => {
                    const tid = Number(t.value);
                    const checked = selectedTeam.includes(tid);
                    return (
                      <label key={t.value} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, cursor: "pointer", background: checked ? "var(--cmms-primary-wash)" : "transparent" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedTeam((prev) =>
                              checked ? prev.filter((x) => x !== tid) : [...prev, tid]
                            )
                          }
                        />
                        <Avatar name={t.label.split(" (")[0]} src={t.avatar || undefined} size="sm" />
                        <Text type="body" size="sm" weight={checked ? "semibold" : undefined}>{t.label.split(" (")[0]}</Text>
                      </label>
                    );
                  })}
              </div>
            </VStack>
          </VStack>
        </div>
        <HStack hAlign="end" gap={3} style={{ paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
          <button
            type="button"
            onClick={() => setAssignOpen(false)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={!selectedTech || saving}
            onClick={submitAssign}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircleIcon className="w-4 h-4" />
            {saving ? "กำลังบันทึก..." : "ยืนยันการจ่ายงาน"}
          </button>
        </HStack>
      </AnimatedDialog>

    </VStack>
  );
}
