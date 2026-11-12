"use client";

// suppliers — migrate ui kit (PageShell, ui/Card, ui/Input, SimpleDataTable, ui/Badge)
// business logic ครบเดิม: fetch/delete suppliers.php, client search filter, KPI calculations
// URL-synced filters + Saved Views (localStorage, entity: suppliers)

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
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
import { Plus, Search, SquarePen, Trash2, Truck, Star } from "lucide-react";
import {
  listSavedViews,
  saveSavedView,
  deleteSavedView,
  setDefaultSavedView,
  clearDefaultSavedView,
  type SavedView,
} from "@/lib/saved-views";

const SAVED_VIEWS_ENTITY = "suppliers";

interface Supplier extends Record<string, unknown> {
  rawId: number;
  code: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  status: string;
  partCount: number;
  stockValue: number;
  lowStockRate: number;
  rating: number;
}

function readFilters(sp: URLSearchParams) {
  return { search: (sp.get("q") || "").trim() };
}
function hasExplicitParams(sp: URLSearchParams) {
  return sp.has("q");
}
function buildParams(state: { search: string }, base?: URLSearchParams) {
  const sp = new URLSearchParams(base ? base.toString() : "");
  const q = state.search.trim();
  if (q) sp.set("q", q); else sp.delete("q");
  return sp;
}

export default function SuppliersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const initialFilters = useMemo(() => readFilters(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [search, setSearch] = useState(initialFilters.search);

  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("");
  const initializedRef = useRef(false);
  const appliedSnapshotRef = useRef<string>("");

  const currentFilterState = useMemo(() => ({ search }), [search]);
  const snapshotOf = useCallback((s: { search: string }) => JSON.stringify({ q: s.search.trim() }), []);

  const syncUrl = useCallback((next: { search: string }, mode: "replace" | "push" = "replace") => {
    const sp = buildParams(next, new URLSearchParams(searchParams.toString()));
    const qs = sp.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (mode === "push") router.push(url); else router.replace(url);
  }, [pathname, router, searchParams]);

  const setFilters = useCallback((patch: Partial<{ search: string }>) => {
    const next = { search, ...patch };
    setSearch(next.search);
    syncUrl(next, "replace");
  }, [search, syncUrl]);

  const applyViewState = useCallback((view: SavedView | null) => {
    if (!view) {
      const next = { search: "" };
      setSearch(next.search);
      appliedSnapshotRef.current = snapshotOf(next);
      setActiveViewId("");
      syncUrl(next, "replace");
      return;
    }
    const f = (view.filters || {}) as Record<string, unknown>;
    const next = { search: typeof view.search === "string" ? view.search : (typeof f.q === "string" ? f.q : "") };
    setSearch(next.search);
    appliedSnapshotRef.current = snapshotOf(next);
    setActiveViewId(view.id);
    syncUrl(next, "replace");
  }, [snapshotOf, syncUrl]);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/suppliers.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any) => ({
          rawId: row.id,
          code: row.code || "-",
          name: row.name || "-",
          contact: row.contact_person || "-",
          phone: row.phone || "-",
          email: row.email || "-",
          status: row.is_active ? "active" : "inactive",
          partCount: row.part_count || 0,
          stockValue: row.stock_value || 0,
          lowStockRate: row.low_stock_rate || 0,
          rating: row.rating || 0,
        }));
        setSuppliers(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch suppliers", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSuppliers(); }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const views = listSavedViews(SAVED_VIEWS_ENTITY);
    setSavedViews(views);
    const sp = new URLSearchParams(searchParams.toString());
    const fromUrl = readFilters(sp);
    if (hasExplicitParams(sp)) {
      setSearch(fromUrl.search);
      appliedSnapshotRef.current = snapshotOf(fromUrl);
      return;
    }
    const def = views.find((v) => v.isDefault);
    if (def) {
      const f = (def.filters || {}) as Record<string, unknown>;
      const next = { search: typeof def.search === "string" ? def.search : (typeof f.q === "string" ? f.q : "") };
      setSearch(next.search);
      appliedSnapshotRef.current = snapshotOf(next);
      setActiveViewId(def.id);
      const qs = buildParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
      return;
    }
    appliedSnapshotRef.current = snapshotOf(fromUrl);
  }, [pathname, router, searchParams, snapshotOf]);

  const dirty = snapshotOf(currentFilterState) !== (appliedSnapshotRef.current || snapshotOf({ search: "" }));

  const handleSaveNewView = () => {
    const name = window.prompt("ชื่อมุมมอง (Saved view):", `มุมมอง ${savedViews.length + 1}`);
    if (!name) return;
    const res = saveSavedView(SAVED_VIEWS_ENTITY, {
      name,
      filters: {} as Record<string, string>,
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
    const res = saveSavedView(SAVED_VIEWS_ENTITY, {
      name: current.name,
      filters: {} as Record<string, string>,
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
    const views = deleteSavedView(SAVED_VIEWS_ENTITY, activeViewId);
    setSavedViews(views);
    setActiveViewId("");
  };

  const handleSetDefaultView = () => {
    if (!activeViewId) return;
    const views = setDefaultSavedView(SAVED_VIEWS_ENTITY, activeViewId);
    setSavedViews(views);
  };

  const handleClearDefault = () => {
    const views = clearDefaultSavedView(SAVED_VIEWS_ENTITY);
    setSavedViews(views);
  };

  const handleResetFilters = () => {
    applyViewState(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this supplier?")) return;
    try {
      await fetch(`/api/v1/suppliers.php?id=${id}`, { method: "DELETE" });
      fetchSuppliers();
    } catch (e) {
      console.error("Failed to delete supplier", e);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.contact.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
    );
  }, [search, suppliers]);

  const columns: SimpleColumn<Supplier>[] = [
    { key: "code", header: "Code" },
    { key: "name", header: "Name" },
    { key: "contact", header: "Contact" },
    { key: "phone", header: "Phone" },
    {
      key: "email",
      header: "Email",
      renderCell: (item: Supplier) => (
        <a href={`mailto:${item.email}`} className="inline-flex min-h-10 items-center py-1 text-[var(--cmms-primary)] hover:underline">
          {item.email}
        </a>
      ),
    },
    {
      key: "status",
      header: "Status",
      renderCell: (item: Supplier) => (
        <Badge variant={item.status === "active" ? "success" : "neutral"}>
          {item.status.toUpperCase()}
        </Badge>
      ),
    },
    {
      key: "rating",
      header: "คะแนน",
      renderCell: (item: Supplier) => (
        <Badge
          variant={
            item.rating >= 70
              ? "success"
              : item.rating >= 40
                ? "warning"
                : "danger"
          }
        >
          {item.rating}/100
        </Badge>
      ),
    },
    {
      key: "partCount",
      header: "รายการสินค้า",
      renderCell: (item: Supplier) => (
        <span className="text-sm">
          {item.partCount} รายการ{item.lowStockRate > 0 ? ` (ขาด ${Math.round(item.lowStockRate)}%)` : ""}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      renderCell: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/suppliers/edit?id=${item.rawId}`)}
            className="gap-1.5"
          >
            <SquarePen className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
            แก้ไข
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
    <PageShell
      eyebrow={<p className="cmms-eyebrow">SUPPLIERS · CMMS-TOPPAN</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "ผู้จำหน่าย", href: "/suppliers" },
        { label: "ข้อมูลผู้ผลิต (Suppliers)" },
      ]}
      title="ข้อมูลผู้ผลิต (Suppliers)"
      description="จัดการข้อมูลผู้ผลิต/ผู้จำหน่ายอะไหล่ คะแนน และมูลค่าสต็อก"
      actions={
        <Button onClick={() => router.push("/suppliers/create")}>
          <Plus className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          เพิ่ม Supplier ใหม่
        </Button>
      }
    >
      {/* KPI */}
      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]">
            <Truck className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">จำนวนผู้ผลิตทั้งหมด</p>
            <div className="cmms-kpi-value tabular-nums">
              {(filtered.length)} <span className="text-sm font-normal">ราย</span>
            </div>
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-success-light)] text-[var(--cmms-success-dark)]">
            <Star className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">ผู้ขายคะแนนสูงสุด</p>
            <p className="truncate text-lg font-semibold text-foreground">
              {suppliers.length > 0
                ? suppliers.reduce((best, s) => (s.rating > best.rating ? s : best), suppliers[0]).name
                : "-"}
            </p>
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]">
            <Star className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">คะแนนเฉลี่ย</p>
            <div className="cmms-kpi-value tabular-nums">
              {suppliers.length > 0
                ? Math.round(suppliers.reduce((sum, s) => sum + (Number(s.rating) || 0), 0) / suppliers.length)
                : 0}<span className="text-sm font-normal">/100</span>
            </div>
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-danger-light)] text-[var(--cmms-danger-dark)]">
            <Star className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">มูลค่าสต็อกรวม</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(suppliers.reduce((sum, s) => sum + (s.stockValue || 0), 0))}
            </p>
          </div>
        </div>
      </Card>
      </Grid>

      {/* Filter card */}
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
            <div className="relative min-w-[220px] flex-1 sm:max-w-[400px]">
              <Search
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาตามรหัส, ชื่อ หรืออีเมล..."
                value={search}
                onChange={(e) => setFilters({ search: e.target.value })}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            <span>รายชื่อผู้ผลิต</span>
            {!loading && <Badge variant="primary">{filtered.length} ราย</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleDataTable<Supplier>
            exportFileName="suppliers"
            columns={columns}
            data={filtered}
            idKey="rawId"
            loading={loading}
            pageSize={10}
            caption="รายชื่อผู้ผลิต/ผู้จำหน่ายในระบบ"
            emptyTitle="ไม่พบข้อมูล"
            emptyDescription="ลองเปลี่ยนคำค้นหา หรือเพิ่ม Supplier ใหม่"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
