"use client";

import { useState, useMemo, useEffect } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Search, UserPlus, RefreshCw, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select-native";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type UiTableFeatures } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";

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

// Avatar เล็ก (รูปจริง / initial) — ui kit ยังไม่มี Avatar component
function TechAvatar({ name, src, size = 28 }: { name: string; src?: string | null; size?: number }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full border border-[var(--cmms-border)] object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--cmms-primary-light)] text-[0.65rem] font-bold text-[var(--cmms-primary-hover)]"
      style={{ width: size, height: size }}
    >
      {initial}
    </span>
  );
}

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

  const columns: ColumnDef<UiTableFeatures, AssignWO>[] = [
    {
      accessorKey: "woNumber",
      header: t("tbl.work_order_no"),
      cell: ({ row }: { row: { original: AssignWO } }) => (
        <span className="font-bold text-[var(--cmms-primary)]">{row.original.woNumber}</span>
      ),
    },
    {
      accessorKey: "priority",
      header: t("tbl.priority"),
      cell: ({ row }: { row: { original: AssignWO } }) => (
        <span className="cmms-andon-chip" style={priorityColors[row.original.priority] || { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
          {row.original.priority}
        </span>
      ),
    },
    {
      accessorKey: "asset",
      header: t("tbl.asset"),
      cell: ({ row }: { row: { original: AssignWO } }) => (
        <div className="flex flex-col gap-0">
          <span className="font-semibold">{row.original.asset}</span>
          {row.original.title && (
            <span className="text-sm text-[var(--cmms-text-secondary)]">{row.original.title}</span>
          )}
        </div>
      ),
    },
    { accessorKey: "requestDate", header: t("tbl.request_date") },
    {
      id: "status_assignee",
      header: t("tbl.status_assignee"),
      cell: ({ row }: { row: { original: AssignWO } }) => {
        const item = row.original;
        if (!item.assigneeId) {
          return <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>รอมอบหมายงาน</span>;
        }
        return (
          <div className="flex items-center gap-2">
            <span className="cmms-andon-chip" style={statusColors[item.status] || { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
              {item.status === "in_progress" ? "กำลังซ่อม" : "มอบหมายแล้ว"}
            </span>
            <TechAvatar name={item.assignee} src={item.assigneeAvatar} />
            <span className="text-sm">{item.assignee}</span>
            {(item.teamIds || []).length > 1 && (
              <span className="cmms-andon-chip" style={{ background: "rgba(30,136,229,0.12)", color: "var(--cmms-primary)", fontSize: "0.7rem", padding: "2px 8px" }}>
                +{(item.teamIds || []).length - 1} ทีม
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: t("tbl.actions"),
      enableSorting: false,
      cell: ({ row }: { row: { original: AssignWO } }) => {
        const item = row.original;
        return item.assigneeId ? (
          <Button size="sm" variant="secondary" onClick={() => handleAssignClick(item)} className="gap-1.5">
            <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
            เปลี่ยนช่าง
          </Button>
        ) : (
          <Button size="sm" onClick={() => handleAssignClick(item)} className="gap-1.5">
            <UserPlus size={14} strokeWidth={2} aria-hidden="true" />
            จ่ายงาน
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="danger" title="Error" description={error} />
      )}

      {/* Header */}
      <div>
        <p className="cmms-eyebrow">{hero.eyebrow}</p>
        <PageHeader
          title={hero.title}
          description={hero.desc}
          actions={
            <Button variant="outline" onClick={fetchData} className="gap-2">
              <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
              {t("action.refresh")}
            </Button>
          }
        />
      </div>

      {/* Stat badges */}
      <div className="flex flex-wrap items-center gap-2">
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
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cmms-text-muted)]"
          />
          <Input
            aria-label="ค้นหา"
            placeholder="ค้นหาเลขงาน, เครื่องจักร..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          aria-label="สถานะ"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="sm:w-64"
        >
          <option value="">{t("action.filter_all_status")}</option>
          <option value="open">รอมอบหมาย / รอดำเนินการ</option>
          <option value="in_progress">กำลังซ่อม</option>
          <option value="waiting_parts">รออะไหล่</option>
        </Select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        pageSize={10}
        getRowId={(row) => row.id}
        emptyTitle="ไม่มีงานที่ต้องจ่าย"
        emptyDescription="งานซ่อมทั้งหมดมอบหมายครบแล้ว หรือลองเปลี่ยนตัวกรอง"
      />

      {/* Assign Dialog */}
      <Dialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={selectedWo?.assigneeId ? "เปลี่ยนผู้รับผิดชอบงานซ่อม" : "มอบหมายงานซ่อม"}
        footer={
          <>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              ยกเลิก
            </Button>
            <Button disabled={!selectedTech || saving} onClick={submitAssign} className="gap-2">
              <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
              {saving ? "กำลังบันทึก..." : "ยืนยันการจ่ายงาน"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1 text-sm">
            <p className="text-[var(--cmms-text-secondary)]">ใบงาน:</p>
            <p className="font-bold">{selectedWo?.woNumber}</p>
            <p className="text-[var(--cmms-text-secondary)]">เครื่องจักร:</p>
            <p className="font-semibold">{selectedWo?.asset}</p>
            {selectedWo?.description && (
              <>
                <p className="text-[var(--cmms-text-secondary)]">รายละเอียด:</p>
                <p>{selectedWo.description}</p>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-bold">หัวหน้าชุด (ผู้รับผิดชอบหลัก) *</p>
            <Select
              aria-label="เลือกหัวหน้าชุด"
              value={selectedTech}
              onChange={(e) => setSelectedTech(e.target.value)}
            >
              <option value="">เลือกหัวหน้าชุด...</option>
              {technicians.map((tech) => (
                <option key={tech.value} value={tech.value}>
                  {tech.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-bold">ทีมซ่อมร่วม (เลือกเพิ่มได้หลายคน)</p>
            <p className="text-sm text-[var(--cmms-text-secondary)]">
              ช่างในทีมจะเห็นงานนี้ใน &ldquo;งานของฉัน&rdquo; และรับ LINE แจ้งเตือนด้วย
            </p>
            <div
              className="grid max-h-[200px] gap-1.5 overflow-y-auto rounded-[10px] border border-[var(--cmms-border)] p-2"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
            >
              {technicians
                .filter((tech) => tech.value !== selectedTech)
                .map((tech) => {
                  const tid = Number(tech.value);
                  const checked = selectedTeam.includes(tid);
                  return (
                    <label
                      key={tech.value}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5"
                      style={{ background: checked ? "var(--cmms-primary-wash)" : "transparent" }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedTeam((prev) =>
                            checked ? prev.filter((x) => x !== tid) : [...prev, tid]
                          )
                        }
                      />
                      <TechAvatar name={tech.label.split(" (")[0]} src={tech.avatar} size={24} />
                      <span className={`text-sm ${checked ? "font-semibold" : ""}`}>
                        {tech.label.split(" (")[0]}
                      </span>
                    </label>
                  );
                })}
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
