"use client";

import { ModuleGuide } from "@/components/dashboard/module-guide";
import { usePageHero } from "@/lib/i18n";
// roles — migrate ui kit (PageShell, ui/Card, ui/Input, SimpleDataTable, ui/Alert)
// business logic ครบเดิม: fetch/delete roles.php, client search filter

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout";
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
import {
  SimpleDataTable,
  type SimpleColumn,
} from "@/components/ui/data-table-adapter";
import { Plus, Search, SquarePen, Trash2, Users } from "lucide-react";

interface Role extends Record<string, unknown> {
  rawId: number;
  id: string;
  name: string;
  description: string;
}

const PAGE_SIZE = 10;

export default function RolesPage() {
  const hero = usePageHero("roles");

  const router = useRouter();
  const [search, setSearch] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/roles.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any) => ({
          rawId: row.id,
          id: `ROLE-${String(row.id).padStart(3, '0')}`,
          name: row.name || "Unknown",
          description: row.description || "-",
        }));
        setRoles(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch roles", e);
      setError("Failed to fetch roles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRoles(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this Role?")) return;
    try {
      await fetch(`/api/v1/roles.php?id=${id}`, { method: "DELETE" });
      fetchRoles();
    } catch (e) {
      console.error("Failed to delete role", e);
    }
  };

  const filtered = useMemo(() => {
    return roles.filter((t) => {
      const q = search.toLowerCase();
      const matchSearch = !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
      return matchSearch;
    });
  }, [search, roles]);

  const columns: SimpleColumn<Role>[] = [
    { key: "id", header: "รหัส" },
    { key: "name", header: "ชื่อบทบาท" },
    { key: "description", header: "รายละเอียด" },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      renderCell: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/roles/edit?id=${item.rawId}`)}
            className="gap-1.5"
          >
            <SquarePen className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
            แก้ไขสิทธิ์
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleDelete(item.rawId)}
            className="gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
            ลบ
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "หน้าแรก", href: "/dashboard" },
          { label: "บุคลากร", href: "/roles" },
          { label: "จัดการสิทธิ์ (Roles & Permissions)" },
        ]}
        eyebrow={<p className="cmms-eyebrow">USER ROLES · CMMS-TOPPAN</p>}
        title="จัดการสิทธิ์ (Roles & Permissions)"
        description="กำหนดบทบาทและจัดการสิทธิ์การเข้าถึงข้อมูลของระบบ"
        actions={[
          <Button key="create" onClick={() => router.push("/roles/create")}>
            <Plus className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            สร้าง Role ใหม่
          </Button>,
        ]}
      />
      <div className="space-y-6">

      <ModuleGuide
        name="บทบาทและสิทธิ์ (Roles)"
        summary="จัดการบทบาท (roles) และโครงสร้างสิทธิ์การเข้าถึงเมนู/ฟังก์ชันต่าง ๆ ของระบบ"
        steps={["ค้นหารายการบทบาทที่มีอยู่","เพิ่ม/แก้ไขบทบาทและกำหนดสิทธิ์ตามความต้องการของหน่วยงาน","ตรวจสอบผลกับผู้ใช้ที่สังกัดบทบาทนั้น และดูประวัติการเปลี่ยนแปลงใน Audit Log หากต้องการ"]}
        source="ดึง/จัดการผ่าน API บทบาท (เช่น /api/v1/roles.php) ตามการเรียกใช้ในหน้านี้"
        note="การปรับสิทธิ์มีผลต่อทุกผู้ใช้ในบทบาทนั้น — แนะนำทดสอบด้วยบัญชีทดสอบก่อนใช้งานจริง"
        related={[{"href":"/users","label":"ผู้ใช้งาน"},{"href":"/settings/menus","label":"จัดการเมนู"}]}
      />
      {/* KPI */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]">
            <Users className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">จำนวนบทบาททั้งหมด</p>
            <div className="cmms-kpi-value tabular-nums">
              {(filtered.length)} <span className="text-sm font-normal">บทบาท</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Filter card */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <div className="relative min-w-[220px] flex-1 sm:max-w-[300px]">
            <Search
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหาชื่อบทบาท…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span>รายการบทบาท</span>
            {!loading && <Badge variant="primary">{filtered.length} รายการ</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <Alert variant="danger">{error}</Alert>}
          <SimpleDataTable<Role>
            columns={columns}
            data={filtered}
            idKey="id"
            loading={loading}
            pageSize={PAGE_SIZE}
            caption="รายการบทบาทในระบบ"
            emptyTitle="ไม่พบบทบาท"
            emptyDescription="ลองเปลี่ยนคำค้นหา หรือสร้าง Role ใหม่"
          />
        </CardContent>
      </Card>
      </div>
    </>
  );
}
