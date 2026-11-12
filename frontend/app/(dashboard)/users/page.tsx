"use client";

// users — migrate ui kit (PageShell, ui/Card, ui/Input, Radix Select, SimpleDataTable, ui/Dialog, ui/Badge, ui/Avatar)
// business logic ครบเดิม: fetch/delete users.php, client filter (search + role), KPI counters
// + Saved views v1 (localStorage per entity, URL เป็น source of truth)

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import {
  listSavedViews,
  saveSavedView,
  deleteSavedView,
  setDefaultSavedView,
  clearDefaultSavedView,
  type SavedView,
} from "@/lib/saved-views";

interface User extends Record<string, unknown> {
  rawId: number;
  id: string;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  avatar?: string;
  role: string;
  roleName: string;
  position: string;
  employeeCode: string;
  isActive: boolean;
  lineUserId: string;
  createdAt: string;
  updatedAt: string;
}

const roleBadgeVariant: Record<string, "danger" | "warning" | "primary" | "success" | "neutral"> = {
  // ชื่อบทบาทจากตาราง roles
  Admin: "danger",
  Manager: "warning",
  "Asst.Manager": "warning",
  Foreman: "primary",
  Operate: "success",
  Officer: "primary",
  Viewer: "neutral",
  // slug เดิม (ข้อมูลเก่า)
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
const USERS_VIEW_ENTITY = "users";

function readUserFilters(sp: URLSearchParams) {
  return {
    search: (sp.get("q") || "").trim(),
    roleFilter: (sp.get("role") || "").trim(),
  };
}
function hasExplicitUserParams(sp: URLSearchParams) {
  return sp.has("q") || sp.has("role");
}
function buildUserParams(state: { search: string; roleFilter: string }, base?: URLSearchParams) {
  const sp = new URLSearchParams(base ? base.toString() : "");
  const q = state.search.trim();
  if (q) sp.set("q", q); else sp.delete("q");
  if (state.roleFilter) sp.set("role", state.roleFilter); else sp.delete("role");
  return sp;
}

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
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const initialFilters = useMemo(() => readUserFilters(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [search, setSearch] = useState(initialFilters.search);
  const [roleFilter, setRoleFilter] = useState(initialFilters.roleFilter);

  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("");
  const initializedRef = useRef(false);
  const appliedSnapshotRef = useRef<string>("");

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [error, setError] = useState("");

  const currentFilterState = useMemo(() => ({ search, roleFilter }), [search, roleFilter]);
  const snapshotOf = useCallback(
    (s: { search: string; roleFilter: string }) => JSON.stringify({ q: s.search.trim(), role: s.roleFilter || "" }),
    []
  );

  const syncUrl = useCallback((next: { search: string; roleFilter: string }, mode: "replace" | "push" = "replace") => {
    const sp = buildUserParams(next, new URLSearchParams(searchParams.toString()));
    const qs = sp.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (mode === "push") router.push(url); else router.replace(url);
  }, [pathname, router, searchParams]);

  const setFilters = useCallback((patch: Partial<{ search: string; roleFilter: string }>) => {
    const next = { search, roleFilter, ...patch };
    setSearch(next.search);
    setRoleFilter(next.roleFilter);
    syncUrl(next, "replace");
  }, [search, roleFilter, syncUrl]);

  const applyViewState = useCallback((view: SavedView | null) => {
    if (!view) {
      const next = { search: "", roleFilter: "" };
      setSearch(next.search);
      setRoleFilter(next.roleFilter);
      appliedSnapshotRef.current = snapshotOf(next);
      setActiveViewId("");
      syncUrl(next, "replace");
      return;
    }
    const f = (view.filters || {}) as Record<string, unknown>;
    const next = {
      search: typeof view.search === "string" ? view.search : (typeof f.q === "string" ? f.q : ""),
      roleFilter: typeof f.role === "string" ? f.role : "",
    };
    setSearch(next.search);
    setRoleFilter(next.roleFilter);
    appliedSnapshotRef.current = snapshotOf(next);
    setActiveViewId(view.id);
    syncUrl(next, "replace");
  }, [snapshotOf, syncUrl]);

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
          // ชื่อบทบาทจริงจากตาราง roles (role_name) — fallback เป็น slug เดิม
          role: String(row.role_name || row.role || "viewer"),
          roleName: String(row.role_name || roleLabels[row.role] || row.role || "—"),
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

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const views = listSavedViews(USERS_VIEW_ENTITY);
    setSavedViews(views);
    const sp = new URLSearchParams(searchParams.toString());
    const fromUrl = readUserFilters(sp);
    if (hasExplicitUserParams(sp)) {
      setSearch(fromUrl.search);
      setRoleFilter(fromUrl.roleFilter);
      appliedSnapshotRef.current = snapshotOf(fromUrl);
      return;
    }
    const def = views.find((v) => v.isDefault);
    if (def) {
      const f = (def.filters || {}) as Record<string, unknown>;
      const next = {
        search: typeof def.search === "string" ? def.search : (typeof f.q === "string" ? f.q : ""),
        roleFilter: typeof f.role === "string" ? f.role : "",
      };
      setSearch(next.search);
      setRoleFilter(next.roleFilter);
      appliedSnapshotRef.current = snapshotOf(next);
      setActiveViewId(def.id);
      const qs = buildUserParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
      return;
    }
    appliedSnapshotRef.current = snapshotOf(fromUrl);
  }, [pathname, router, searchParams, snapshotOf]);

  const dirty = snapshotOf(currentFilterState) !== (appliedSnapshotRef.current || snapshotOf({ search: "", roleFilter: "" }));

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

  const handleSaveNewView = () => {
    const name = window.prompt("ชื่อมุมมอง (Saved view):", `มุมมอง ${savedViews.length + 1}`);
    if (!name) return;
    const res = saveSavedView(USERS_VIEW_ENTITY, {
      name,
      filters: { role: roleFilter } as Record<string, string>,
      search,
      isDefault: false,
    } as any);
    if (!res.ok) { window.alert(res.error); return; }
    setSavedViews(res.views);
    setActiveViewId(res.view.id);
    appliedSnapshotRef.current = snapshotOf(currentFilterState);
  };

  const handleUpdateView = () => {
    if (!activeViewId) return;
    const current = savedViews.find((v) => v.id === activeViewId);
    if (!current) return;
    const res = saveSavedView(USERS_VIEW_ENTITY, {
      name: current.name,
      filters: { role: roleFilter } as Record<string, string>,
      search,
      isDefault: !!current.isDefault,
    } as any, undefined, activeViewId);
    if (!res.ok) { window.alert(res.error); return; }
    setSavedViews(res.views);
    appliedSnapshotRef.current = snapshotOf(currentFilterState);
  };

  const handleDeleteView = () => {
    if (!activeViewId) return;
    const current = savedViews.find((v) => v.id === activeViewId);
    if (!current) return;
    if (!window.confirm(`ลบมุมมอง "${current.name}" ?`)) return;
    const views = deleteSavedView(USERS_VIEW_ENTITY, activeViewId);
    setSavedViews(views);
    setActiveViewId("");
  };

  const handleSetDefaultView = () => {
    if (!activeViewId) return;
    const views = setDefaultSavedView(USERS_VIEW_ENTITY, activeViewId);
    setSavedViews(views);
  };

  const handleClearDefault = () => {
    const views = clearDefaultSavedView(USERS_VIEW_ENTITY);
    setSavedViews(views);
  };

  const handleResetFilters = () => {
    applyViewState(null);
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
        <Badge variant={roleBadgeVariant[item.role] || roleBadgeVariant[item.role.toLowerCase()] || "neutral"}>
          {item.roleName}
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
                {(stats.total)} <span className="text-sm font-normal">คน</span>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="space-y-1">
              <p className="text-sm text-[var(--cmms-success-dark)]">กำลังใช้งาน</p>
              <div className="cmms-kpi-value tabular-nums text-[var(--cmms-success-dark)]">
                {(stats.active)} <span className="text-sm font-normal">คน</span>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">ระงับการใช้งาน (Inactive)</p>
              <div className="cmms-kpi-value tabular-nums text-muted-foreground">
                {(stats.inactive)} <span className="text-sm font-normal">คน</span>
              </div>
            </div>
          </Card>
        </Grid>
      </div>

      <div style={layoutStyle("content")} className="space-y-4">
        {/* Filter Toolbar */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">ตัวกรอง</CardTitle>
              {dirty && <Badge variant="neutral">แก้ไขแล้ว</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={activeViewId || "__none__"}
                onValueChange={(v) => {
                  if (v === "__none__") { setActiveViewId(""); return; }
                  const view = savedViews.find((sv) => sv.id === v) || null;
                  applyViewState(view);
                }}
              >
                <SelectTrigger className="w-full sm:w-[260px]" aria-label="เลือกมุมมองที่บันทึกไว้">
                  <SelectValue placeholder="มุมมองที่บันทึกไว้" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— ไม่ใช้มุมมอง —</SelectItem>
                  {savedViews.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}{v.isDefault ? " (ค่าเริ่มต้น)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="secondary" size="sm" onClick={handleSaveNewView}>บันทึกเป็นมุมมองใหม่</Button>
              <Button type="button" variant="secondary" size="sm" onClick={handleUpdateView} disabled={!activeViewId || !dirty}>บันทึกทับ</Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleSetDefaultView} disabled={!activeViewId}>ตั้งเป็นค่าเริ่มต้น</Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleClearDefault}>ยกเลิกค่าเริ่มต้น</Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleDeleteView} disabled={!activeViewId}>ลบมุมมอง</Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleResetFilters}>รีเซ็ตตัวกรอง</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
                  onChange={(e) => setFilters({ search: e.target.value })}
                  className="pl-9"
                />
              </div>
              <Select
                value={roleFilter || "__all__"}
                onValueChange={(v) => setFilters({ roleFilter: v === "__all__" ? "" : v })}
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
            </div>
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
