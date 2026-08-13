"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Table, proportional, useTablePagination } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Link } from "@astryxdesign/core/Link";
import { Avatar } from "@astryxdesign/core/Avatar";
import CountUp from "react-countup";
import {
  PlusIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  UsersIcon,
  PencilSquareIcon,
  TrashIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

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

const roleColors: Record<string, "error" | "warning" | "info" | "success" | "neutral"> = {
  admin: "error",
  manager: "warning",
  supervisor: "info",
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

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);

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

  const totalItems = filtered.length;
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pagination = useTablePagination<User>({
    page,
    onPageChange: setPage,
    totalItems,
    pageSize: PAGE_SIZE,
  });

  const columns: TableColumn<User>[] = [
    { key: "username", header: "ชื่อผู้ใช้", width: proportional(1) },
    {
      key: "employeeCode",
      header: "รหัสพนักงาน",
      width: proportional(1),
      renderCell: (item: User) => (
        <Text type="body" weight="semibold" className="font-mono">
          {item.employeeCode}
        </Text>
      ),
    },
    {
      key: "fullName",
      header: "ชื่อ-นามสกุล",
      width: proportional(2),
      renderCell: (item: User) => {
        const nameStr = (item.fullName && item.fullName !== '-') ? item.fullName : (item.username && item.username !== '-' ? item.username : "User");
        const avatarSrc = (typeof item.avatar === 'string' && item.avatar.trim().length > 0) ? item.avatar.trim() : null;
        return (
          <HStack gap={2} vAlign="center">
            {avatarSrc ? (
              <Avatar name={nameStr} src={avatarSrc} size="sm" />
            ) : (
              <Avatar name={nameStr} size="sm" />
            )}
            <Text type="body" weight="semibold">{item.fullName}</Text>
          </HStack>
        );
      },
    },
    { key: "email", header: "อีเมล", width: proportional(1.5) },
    { key: "phone", header: "โทรศัพท์", width: proportional(1) },
    {
      key: "lineUserId",
      header: "LINE ID",
      width: proportional(1.4),
      renderCell: (item: User) => (
        <Text type="body" size="sm" color={item.lineUserId ? "primary" : "secondary"}>
          {item.lineUserId
            ? `${item.lineUserId.slice(0, 12)}…`
            : "— ไม่ผูก —"}
        </Text>
      ),
    },
    {
      key: "role",
      header: "บทบาท",
      width: proportional(1),
      renderCell: (item: User) => (
        <Badge
          label={roleLabels[item.role] || item.role}
          variant={roleColors[item.role] || "neutral"}
        />
      ),
    },
    {
      key: "isActive",
      header: "สถานะ",
      width: proportional(0.8),
      renderCell: (item: User) => (
        <Badge
          variant={item.isActive ? "success" : "neutral"}
          label={item.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
        />
      ),
    },
    {
      key: "actions",
      header: "จัดการ",
      width: proportional(1.2),
      renderCell: (item: User) => (
        <HStack gap={1}>
          <Button
            label="แก้ไข"
            variant="secondary"
            size="sm"
            icon={<Icon icon={PencilSquareIcon} size="sm" />}
            onClick={() => router.push(`/users/edit?id=${item.rawId}`)}
          />
          <Button
            label="ลบ"
            variant="destructive"
            size="sm"
            icon={<Icon icon={TrashIcon} size="sm" />}
            onClick={() => setDeleteTarget(item)}
          />
        </HStack>
      ),
    },
  ];

  return (
    <VStack gap={6}>
      {/* Header */}
      <Card elevation="low" padding={6} className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow">USER MANAGEMENT · CMMS-TOPPAN</Text>
          <Heading level={2}>ผู้ใช้งานระบบ (User Management)</Heading>
          <Text type="body" color="secondary">จัดการผู้ใช้ เพิ่ม แก้ไข ลบ และจัดการสิทธิ์เข้าใช้งานระบบ CMMS</Text>
        </VStack>
        <HStack gap={2}>
          <Button
            label="รีเฟรช"
            variant="secondary"
            size="md"
            onClick={fetchUsers}
            icon={<Icon icon={ArrowPathIcon} size="sm" />}
          />
          <Link href="/users/create">
            <Button
              label="เพิ่มผู้ใช้ใหม่"
              variant="primary"
              size="md"
              icon={<Icon icon={PlusIcon} size="sm" />}
            />
          </Link>
        </HStack>
      </Card>

      {error && (
        <Banner status="error" title="Error" description={error} isDismissable={false} />
      )}

      {/* Stat badges -> KPI Grid */}
      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">ผู้ใช้ทั้งหมด (Total Users)</Text>
            <Heading level={2}><CountUp end={stats.total} /> <Text type="body" size="sm">คน</Text></Heading>
          </VStack>
        </Card>

        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" className="text-emerald-600">กำลังใช้งาน</Text>
            <Heading level={2} className="text-emerald-600"><CountUp end={stats.active} /> <Text type="body" size="sm">คน</Text></Heading>
          </VStack>
        </Card>

        <Card elevation="low" padding={4}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">ระงับการใช้งาน (Inactive)</Text>
            <Heading level={2} color="secondary"><CountUp end={stats.inactive} /> <Text type="body" size="sm">คน</Text></Heading>
          </VStack>
        </Card>
      </Grid>

      <Card elevation="low" padding={6}>
        <VStack gap={4}>
          {/* Filter Toolbar */}
          <Toolbar
            label="ตัวกรองผู้ใช้"
            startContent={
              <HStack gap={3} vAlign="center" style={{ width: "100%" }}>
                <TextInput
                  label="ค้นหา"
                  isLabelHidden
                  placeholder="ค้นหาชื่อ, รหัสพนักงาน, อีเมล, เบอร์โทร..."
                  startIcon={<Icon icon={MagnifyingGlassIcon} />}
                  value={search}
                  onChange={setSearch}
                  style={{ width: 350 }}
                />
                <Selector
                  label="บทบาท"
                  isLabelHidden
                  placeholder="ทุกบทบาท"
                  value={roleFilter}
                  onChange={setRoleFilter}
                  options={[{ value: "", label: "ทุกบทบาท" }, ...roles]}
                />
              </HStack>
            }
          />

          {/* Table */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <Spinner />
            </div>
          ) : paged.length === 0 ? (
            <EmptyState title="ไม่พบผู้ใช้" description="ลองเปลี่ยนตัวกรองหรือเพิ่มผู้ใช้ใหม่" icon={<Icon icon={UsersIcon} size="lg" />} />
          ) : (
            <Table<User>
              data={paged}
              columns={columns}
              idKey="id"
              density="balanced"
              dividers="rows"
              hasHover
              plugins={{ pagination }}
            />
          )}
        </VStack>
      </Card>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <Dialog isOpen={true} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <DialogHeader title="ยืนยันการลบผู้ใช้" onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} />
          <div style={{ padding: '16px 0' }}>
            <VStack gap={4}>
              {deleteSuccess ? (
                <div style={{
                  padding: 16, borderRadius: 8, textAlign: 'center',
                  background: 'var(--cmms-success-light)', color: 'var(--cmms-success)',
                  fontWeight: 600,
                }}>
                  ลบผู้ใช้ {deleteTarget.fullName} เรียบร้อยแล้ว
                </div>
              ) : (
                <>
                  <HStack gap={3} vAlign="center">
                    <Icon icon={ExclamationTriangleIcon} size="md" color="error" />
                    <Text type="body">
                      คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ <strong>{deleteTarget.fullName} ({deleteTarget.username})</strong>? การดำเนินการนี้ไม่สามารถยกเลิกได้
                    </Text>
                  </HStack>
                  <HStack hAlign="end" gap={2} style={{ marginTop: 12 }}>
                    <Button
                      label="ยกเลิก"
                      variant="secondary"
                      onClick={() => setDeleteTarget(null)}
                    />
                    <Button
                      label="ยืนยันลบผู้ใช้"
                      variant="destructive"
                      isLoading={deleting}
                      onClick={handleDelete}
                    />
                  </HStack>
                </>
              )}
            </VStack>
          </div>
        </Dialog>
      )}
    </VStack>
  );
}
