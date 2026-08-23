"use client";

// users — migrate ui kit (PageShell, ui/Card, ui/Input, Radix Select, SimpleDataTable, ui/Dialog, ui/Badge, ui/Avatar)
// business logic ครบเดิม: fetch/delete users.php, client filter (search + role), KPI counters

import { useState, useMemo, useEffect } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Grid } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Dialog } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SimpleDataTable,
  type SimpleColumn,
} from "@/components/ui/data-table-adapter";
import CountUp from "react-countup";
import { usePageLayout } from "@/lib/pageLayout";
import {
  Plus,
  RefreshCw,
  Search,
  Users,
  SquarePen,
  Trash2,
  TriangleAlert,
} from "lucide-react";

interface User extends Record<string, unknown> {
  rawId: number;
  id: string;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  position: string;
  employeeCode: string;
  isActive: boolean;
  lineUserId: string;
  createdAt: string;
  updatedAt: string;
}

const roleBadgeVariant: Record<string, "danger" | "warning" | "primary" | "success" | "neutral"> = {
  admin: "danger",
  manager: "warning",
  supervisor: "primary",
  technician: "success",
  operator: "neutral",
  viewer: "neutral",
};

const roleLabels: Record<string, string> = {
  admin: "ผู้ดูแลระบบ",
  manager: "ผู้จัดการ",
  supervisor: "หัวหน้างาน",
  technician: "ช่างเทคนิค",
  operator: "พนักงานคุมเครื่อง",
  viewer: "ผู้ชม",
};

const PAGE_SIZE = 10;

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function UsersPage() {
  const hero = usePageHero("users");
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [error, setError] = useState("");

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/users.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any) => ({
          rawId: row.id,
          id: `user-${row.id}`,
          username: row.username || "-",
          fullName: row.full_name || "-",
          email: row.email || "-",
          phone: row.phone || "-",
          avatar: row.avatar || row.avatar_path || "",
          role: row.role || "viewer",
          position: row.position || "-",
          employeeCode: row.employee_code || "-",
          isActive: row.is_active === 1 || row.is_active === "1" || row.is_active === true,
          lineUserId: row.line_user_id || "",
          createdAt: row.created_at ? row.created_at.split(" ")[0] : "-",
          updatedAt: row.updated_at || "-",
        }));
        setUsers(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch users", e);
      setError("Failed to fetch users. Please try again.");
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  // Handle User Deletion
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/users.php?id=${deleteTarget.rawId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success || json.message === "Deleted") {
        setUsers(prev => prev.filter(u => u.rawId !== deleteTarget.rawId));
        setDeleteSuccess(true);
        setTimeout(() => {
          setDeleteSuccess(false);
          setDeleteTarget(null);
        }, 1500);
      }
    } catch (e) {
      console.error("Delete user error", e);
      setError("Failed to delete user.");
    } finally {
      setDeleting(false);
    }
  };

  // Stats
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter(u => u.isActive).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [users]);

  // Available roles for filter
  const roles = useMemo(() => {
    const r = [...new Set(users.map(u => u.role))].sort();
    return r.map(role => ({ value: role, label: roleLabels[role] || role }));
  }, [users]);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.employeeCode.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q);
      const matchRole = !roleFilter || u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [search, roleFilter, users]);

  const columns: SimpleColumn<User>[] = [
    { key: "username", header: t("tbl.username") },
    {
      key: "employeeCode",
      header: t("tbl.employee_code"),
      renderCell: (item: User) => (
        <span className="font-mono font-semibold">
          {item.employeeCode}
        </span>
      ),
    },
    {
      key: "fullName",
      header: t("tbl.full_name"),
      renderCell: (item: User) => {
        const nameStr = (item.fullName && item.fullName !== '-') ? item.fullName : (item.username && item.username !== '-' ? item.username : "User");
        const avatarSrc = (typeof item.avatar === 'string' && item.avatar.trim().length > 0) ? item.avatar.trim() : null;
        return (
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              {avatarSrc ? <AvatarImage src={avatarSrc} alt={nameStr} /> : null}
              <AvatarFallback>{initialsOf(nameStr)}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-semibold">{item.fullName}</span>
          </div>
        );
      },
    },
    { key: "email", header: t("tbl.email") },
    { key: "phone", header: t("tbl.phone") },
    {
      key: "lineUserId",
      header: t("tbl.line_id"),
      renderCell: (item: User) => (
        <span className={item.lineUserId ? "text-sm" : "text-sm text-muted-foreground"}>
          {item.lineUserId
            ? `${item.lineUserId.slice(0, 12)}…`
            : "— ไม่ผูก —"}
        </span>
      ),
    },
    {
      key: "role",
      header: t("tbl.role"),
      renderCell: (item: User) => (
        <Badge variant={roleBadgeVariant[item.role] || "neutral"}>
          {roleLabels[item.role] || item.role}
        </Badge>
      ),
    },
    {
      key: "isActive",
      header: t("tbl.status"),
      renderCell: (item: User) => (
        <Badge variant={item.isActive ? "success" : "neutral"}>
          {item.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: t("tbl.actions"),
      align: "right",
      renderCell: (item: User) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/users/edit?id=${item.rawId}`)}
            className="gap-1.5"
          >
            <SquarePen className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
            แก้ไข
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setDeleteTarget(item)}
            className="gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
            {t("action.delete")}
          </Button>
        </div>
      ),
    },
  ];

  // Page Designer → จัดวาง Layout: เรียง/ซ่อน section ตาม config (default = เรียงเดิม)
  const layout = usePageLayout("/users", ["header", "stats", "content"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "บุคลากร", href: "/users" },
        { label: hero.title },
      ]}
      title={hero.title}
      description={hero.desc}
      actions={
        <>
          <Button variant="secondary" onClick={fetchUsers}>
            <RefreshCw className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            {t("action.refresh")}
          </Button>
          <Button onClick={() => router.push("/users/create")}>
            <Plus className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            เพิ่มผู้ใช้ใหม่
          </Button>
        </>
      }
    >
      {error && (
        <Alert variant="danger" title="Error" description={error} />
      )}

      {/* Stat badges -> KPI Grid */}
      <div style={layoutStyle("stats")}>
        <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
          <Card className="p-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">ผู้ใช้ทั้งหมด (Total Users)</p>
              <div className="cmms-kpi-value tabular-nums">
                <CountUp end={stats.total} /> <span className="text-sm font-normal">คน</span>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="space-y-1">
              <p className="text-sm text-[var(--cmms-success-dark)]">กำลังใช้งาน</p>
              <div className="cmms-kpi-value tabular-nums text-[var(--cmms-success-dark)]">
                <CountUp end={stats.active} /> <span className="text-sm font-normal">คน</span>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">ระงับการใช้งาน (Inactive)</p>
              <div className="cmms-kpi-value tabular-nums text-muted-foreground">
                <CountUp end={stats.inactive} /> <span className="text-sm font-normal">คน</span>
              </div>
            </div>
          </Card>
        </Grid>
      </div>

      <div style={layoutStyle("content")} className="space-y-4">
        {/* Filter Toolbar */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 py-4">
            <div className="relative min-w-[220px] flex-1 sm:max-w-[350px]">
              <Search
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาชื่อ, รหัสพนักงาน, อีเมล, เบอร์โทร..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={roleFilter || "__all__"}
              onValueChange={(v) => setRoleFilter(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="w-full sm:w-[200px]" aria-label="บทบาท">
                <SelectValue placeholder="ทุกบทบาท" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">ทุกบทบาท</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              <span>รายชื่อผู้ใช้</span>
              {!loading && <Badge variant="primary">{filtered.length} รายการ</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleDataTable<User>
              columns={columns}
              data={filtered}
              idKey="id"
              loading={loading}
              pageSize={PAGE_SIZE}
              caption="รายชื่อผู้ใช้ในระบบ"
              emptyTitle="ไม่พบผู้ใช้"
              emptyDescription="ลองเปลี่ยนตัวกรองหรือเพิ่มผู้ใช้ใหม่"
            />
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="ยืนยันการลบผู้ใช้"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              ยกเลิก
            </Button>
            <Button variant="danger" disabled={deleting} onClick={handleDelete}>
              {deleting ? "กำลังลบ..." : "ยืนยันลบผู้ใช้"}
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <div className="space-y-4">
            {deleteSuccess ? (
              <div
                className="rounded-lg p-4 text-center font-semibold"
                style={{ background: "var(--cmms-success-light)", color: "var(--cmms-success)" }}
              >
                ลบผู้ใช้ {deleteTarget.fullName} เรียบร้อยแล้ว
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <TriangleAlert
                  className="w-5 h-5 shrink-0"
                  style={{ color: "var(--cmms-danger)" }}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <p className="text-sm">
                  คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ <strong>{deleteTarget.fullName} ({deleteTarget.username})</strong>? การดำเนินการนี้ไม่สามารถยกเลิกได้
                </p>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </PageShell>
  );
}
