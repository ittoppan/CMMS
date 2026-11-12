"use client";

// assets — migrate ui kit (PageShell, ui/Card, ui/Select, SimpleDataTable, Lucide)
// business logic ครบเดิม: fetch index.php?resource=assets, filter search/dept/status
// + Saved views v1 (localStorage per entity, URL เป็น source of truth) — เฟสถัดไปจาก /repair

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ToastProvider";
import {
  Plus,
  Search,
  Building2,
  CheckCircle2,
  Wrench,
  Clock,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import {
  listSavedViews,
  saveSavedView,
  deleteSavedView,
  setDefaultSavedView,
  clearDefaultSavedView,
  type SavedView,
} from "@/lib/saved-views";

interface Asset extends Record<string, unknown> {
  code: string;
  name: string;
  department: string;
  status: "operational" | "under-repair" | "decommissioned" | "standby";
  location: string;
  lastPM: string;
}

// แปลงสถานะจริงจาก DB (asset_registry.status) เป็นค่าที่ UI ใช้
const dbStatusToUi: Record<string, Asset["status"]> = {
  active: "operational",
  under_repair: "under-repair",
  inactive: "standby",
  disposed: "decommissioned",
};

const statusLabelMap: Record<string, string> = {
  operational: "พร้อมใช้งาน",
  standby: "สแตนด์บาย",
  "under-repair": "กำลังซ่อม",
  decommissioned: "เลิกใช้งาน",
};

// สถานะ → Badge variant (docs/DESIGN_SYSTEM.md §2.3)
const statusBadgeVariant: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  operational: "success",
  standby: "warning",
  "under-repair": "danger",
  decommissioned: "neutral",
};

const departmentLabelMap: Record<string, string> = {
  Production: "ฝ่ายผลิต",
  Utilities: "สาธารณูปโภค",
  Fabrication: "งานผลิตชิ้นส่วน",
  Facility: "อาคารสถานที่",
  Logistics: "ลอจิสติกส์",
};

const departments = [
  { value: "All", label: "ทั้งหมด" },
  { value: "Production", label: "ฝ่ายผลิต" },
  { value: "Utilities", label: "สาธารณูปโภค" },
  { value: "Fabrication", label: "งานผลิตชิ้นส่วน" },
  { value: "Facility", label: "อาคารสถานที่" },
  { value: "Logistics", label: "ลอจิสติกส์" },
];
const statuses = ["All", "operational", "standby", "under-repair", "decommissioned"];

const ASSETS_VIEW_ENTITY = "assets";

function readAssetFilters(sp: URLSearchParams) {
  const search = (sp.get("q") || "").trim();
  const dept = (sp.get("dept") || "All").trim() || "All";
  const status = (sp.get("status") || "All").trim() || "All";
  const validDept = departments.some((d) => d.value === dept) ? dept : "All";
  const validStatus = statuses.includes(status) ? status : "All";
  return { search, deptFilter: validDept, statusFilter: validStatus };
}

function hasExplicitAssetParams(sp: URLSearchParams) {
  return sp.has("q") || sp.has("dept") || sp.has("status");
}

function buildAssetParams(state: { search: string; deptFilter: string; statusFilter: string }, base?: URLSearchParams) {
  const sp = new URLSearchParams(base ? base.toString() : "");
  const q = state.search.trim();
  if (q) sp.set("q", q); else sp.delete("q");
  if (state.deptFilter && state.deptFilter !== "All") sp.set("dept", state.deptFilter); else sp.delete("dept");
  if (state.statusFilter && state.statusFilter !== "All") sp.set("status", state.statusFilter); else sp.delete("status");
  return sp;
}

export default function AssetsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  const initialFilters = useMemo(() => readAssetFilters(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [search, setSearch] = useState(initialFilters.search);
  const [deptFilter, setDeptFilter] = useState(initialFilters.deptFilter);
  const [statusFilter, setStatusFilter] = useState(initialFilters.statusFilter);

  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("");
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const appliedSnapshotRef = useRef<string>("");
  const initializedRef = useRef(false);

  const currentFilterState = useMemo(
    () => ({ search, deptFilter, statusFilter }),
    [search, deptFilter, statusFilter]
  );

  const snapshotOf = useCallback((s: { search: string; deptFilter: string; statusFilter: string }) => {
    return JSON.stringify({ q: s.search.trim(), dept: s.deptFilter || "All", status: s.statusFilter || "All" });
  }, []);

  const syncUrl = useCallback((next: { search: string; deptFilter: string; statusFilter: string }, mode: "replace" | "push" = "replace") => {
    const sp = buildAssetParams(next, new URLSearchParams(searchParams.toString()));
    const qs = sp.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (mode === "push") router.push(url); else router.replace(url);
  }, [pathname, router, searchParams]);

  const setFilters = useCallback((patch: Partial<{ search: string; deptFilter: string; statusFilter: string }>) => {
    const next = { search, deptFilter, statusFilter, ...patch };
    setSearch(next.search);
    setDeptFilter(next.deptFilter);
    setStatusFilter(next.statusFilter);
    syncUrl(next, "replace");
  }, [deptFilter, search, statusFilter, syncUrl]);

  const applyViewState = useCallback((view: SavedView | null) => {
    if (!view) {
      const next = { search: "", deptFilter: "All", statusFilter: "All" };
      setSearch(next.search);
      setDeptFilter(next.deptFilter);
      setStatusFilter(next.statusFilter);
      appliedSnapshotRef.current = snapshotOf(next);
      setActiveViewId("");
      syncUrl(next, "replace");
      return;
    }
    const f = view.filters || {};
    const dept = typeof f.dept === "string" && departments.some((d) => d.value === f.dept) ? f.dept : "All";
    const status = typeof f.status === "string" && statuses.includes(f.status) ? f.status : "All";
    const next = {
      search: (view.search ?? (typeof f.search === "string" ? f.search : typeof f.q === "string" ? f.q : "")) || "",
      deptFilter: dept,
      statusFilter: status,
    };
    setSearch(next.search);
    setDeptFilter(next.deptFilter);
    setStatusFilter(next.statusFilter);
    appliedSnapshotRef.current = snapshotOf(next);
    setActiveViewId(view.id);
    syncUrl(next, "replace");
  }, [snapshotOf, syncUrl]);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/index.php?resource=assets");
      const json = await res.json();
      if (json.status === "success" && json.data) {
        const fetched = json.data.map((row: any) => ({
          code: row.code || `AST-${row.id}`,
          name: row.name || "ไม่ระบุ",
          department: row.department || row.category || "-",
          status: dbStatusToUi[row.status] || (row.status as Asset["status"]) || "operational",
          location: row.location || "-",
          lastPM: row.last_pm || "-",
        }));
        setAssets(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch assets", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  useEffect(() => {
    const views = listSavedViews(ASSETS_VIEW_ENTITY);
    setSavedViews(views);
  }, []);

  // Sync state from URL (back/forward/share) and initialize snapshot/default once
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const fromUrl = readAssetFilters(sp);
    setSearch(fromUrl.search);
    setDeptFilter(fromUrl.deptFilter);
    setStatusFilter(fromUrl.statusFilter);

    if (!initializedRef.current) {
      initializedRef.current = true;
      if (!hasExplicitAssetParams(sp)) {
        const views = listSavedViews(ASSETS_VIEW_ENTITY);
        const def = views.find((v) => v.isDefault);
        if (def) {
          // Apply default view (will sync URL)
          const f = def.filters || {};
          const dept = typeof f.dept === "string" && departments.some((d) => d.value === f.dept) ? f.dept : "All";
          const status = typeof f.status === "string" && statuses.includes(f.status) ? f.status : "All";
          const next = {
            search: (def.search ?? (typeof f.search === "string" ? f.search : typeof f.q === "string" ? f.q : "")) || "",
            deptFilter: dept,
            statusFilter: status,
          };
          setSearch(next.search);
          setDeptFilter(next.deptFilter);
          setStatusFilter(next.statusFilter);
          appliedSnapshotRef.current = snapshotOf(next);
          setActiveViewId(def.id);
          const qs = buildAssetParams(next).toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname);
          return;
        }
      }
      appliedSnapshotRef.current = snapshotOf(fromUrl);
      return;
    }
  }, [pathname, router, searchParams, snapshotOf]);

  const dirty = snapshotOf(currentFilterState) !== (appliedSnapshotRef.current || snapshotOf({ search: "", deptFilter: "All", statusFilter: "All" }));

  const openSaveView = () => {
    setSaveViewName(activeViewId ? (savedViews.find((v) => v.id === activeViewId)?.name || "") : "");
    setSaveAsDefault(false);
    setSaveViewOpen(true);
  };

  const handleSaveView = () => {
    const input = {
      name: saveViewName,
      filters: { dept: deptFilter, status: statusFilter } as Record<string, string>,
      search,
      isDefault: saveAsDefault,
    };
    const res = saveSavedView(ASSETS_VIEW_ENTITY, input as any, undefined, activeViewId || undefined);
    if (!res.ok) { showToast("error", res.error); return; }
    setSavedViews(res.views);
    setActiveViewId(res.view.id);
    appliedSnapshotRef.current = snapshotOf(currentFilterState);
    setSaveViewOpen(false);
    showToast("success", activeViewId ? "อัปเดตมุมมองแล้ว" : "บันทึกมุมมองแล้ว");
  };

  const handleDeleteView = (id: string) => {
    const views = deleteSavedView(ASSETS_VIEW_ENTITY, id);
    setSavedViews(views);
    if (activeViewId === id) setActiveViewId("");
    showToast("success", "ลบมุมมองแล้ว");
  };

  const handleSetDefaultView = (id: string) => {
    const views = setDefaultSavedView(ASSETS_VIEW_ENTITY, id);
    setSavedViews(views);
    showToast("success", "ตั้งเป็นมุมมองเริ่มต้นแล้ว");
  };

  const handleResetFilters = () => {
    applyViewState(null);
  };

  const kpiData = useMemo(() => {
    return {
      total: assets.length,
      operational: assets.filter(a => a.status === 'operational').length,
      underRepair: assets.filter(a => a.status === 'under-repair').length,
      standby: assets.filter(a => a.status === 'standby').length,
    };
  }, [assets]);

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      const q = search.toLowerCase();
      const matchSearch = !q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.location.toLowerCase().includes(q);
      const matchDept = deptFilter === "All" || a.department === deptFilter;
      const matchStatus = statusFilter === "All" || a.status === statusFilter;
      return matchSearch && matchDept && matchStatus;
    });
  }, [search, deptFilter, statusFilter, assets]);

  // ตัวกรองเปลี่ยน → remount table (reset sorting/pagination)
  const tableKey = `${search}|${deptFilter}|${statusFilter}`;

  const columns: SimpleColumn<Asset>[] = [
    {
      key: "code",
      header: "รหัสเครื่องจักร",
      renderCell: (item: Asset) => (
        <Link href={`/assets/${item.code}`} className="inline-flex min-h-10 items-center font-medium text-primary hover:underline">{item.code}</Link>
      ),
    },
    { key: "name", header: "ชื่อเครื่องจักร" },
    {
      key: "department",
      header: "แผนก",
      renderCell: (item: Asset) => departmentLabelMap[item.department] || item.department,
    },
    {
      key: "status",
      header: "สถานะ",
      renderCell: (item: Asset) => (
        <Badge variant={statusBadgeVariant[item.status] || "neutral"}>
          {statusLabelMap[item.status] || item.status}
        </Badge>
      ),
    },
    { key: "location", header: "สถานที่ติดตั้ง" },
    { key: "lastPM", header: "วัน PM ล่าสุด" },
  ];

  const kpiIconChip = "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg";

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">ASSETS · CMMS-TOPPAN</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "เครื่องจักร", href: "/asset_registry" }, { label: "ทะเบียนเครื่องจักรและทรัพย์สิน" }]}
      title="ทะเบียนเครื่องจักรและทรัพย์สิน"
      description="ระบบทะเบียนประวัติเครื่องจักรและอุปกรณ์ — ดูสถานะและวัน PM ล่าสุดได้ในที่เดียว"
      actions={
        <Button onClick={() => (window.location.href = "/assets/create")}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          เพิ่มเครื่องจักร
        </Button>
      }
    >
      {/* KPI */}
      <Grid columns={{ minWidth: 220, max: 4 }} gap={4}>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={kpiIconChip} style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary)" }}>
              <Building2 size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">เครื่องจักรทั้งหมด</p>
              <h2 className="text-xl font-semibold tabular-nums">{(kpiData.total)} <span className="text-sm font-normal">รายการ</span></h2>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={kpiIconChip} style={{ background: "var(--cmms-success-light)", color: "var(--cmms-success)" }}>
              <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">พร้อมใช้งาน</p>
              <h2 className="text-xl font-semibold tabular-nums">{(kpiData.operational)} <span className="text-sm font-normal">รายการ</span></h2>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={kpiIconChip} style={{ background: "var(--cmms-danger-light)", color: "var(--cmms-danger)" }}>
              <Wrench size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">กำลังซ่อม</p>
              <h2 className="text-xl font-semibold tabular-nums">{(kpiData.underRepair)} <span className="text-sm font-normal">รายการ</span></h2>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={kpiIconChip} style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning)" }}>
              <Clock size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">สแตนด์บาย</p>
              <h2 className="text-xl font-semibold tabular-nums">{(kpiData.standby)} <span className="text-sm font-normal">รายการ</span></h2>
            </div>
          </CardContent>
        </Card>
      </Grid>

      {/* Filter + table */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative min-w-[280px] flex-1">
              <Search size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cmms-text-muted)]" />
              <Input
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาด้วยรหัส ชื่อ หรือสถานที่..."
                value={search}
                onChange={(e) => setFilters({ search: e.target.value })}
                className="pl-9"
              />
            </div>
            <Select value={deptFilter} onValueChange={(v) => setFilters({ deptFilter: v })}>
              <SelectTrigger aria-label="แผนก" className="w-full sm:w-[180px]">
                <SelectValue placeholder="แผนกทั้งหมด" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setFilters({ statusFilter: v })}>
              <SelectTrigger aria-label="สถานะ" className="w-full sm:w-[180px]">
                <SelectValue placeholder="สถานะทั้งหมด" />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>{s === "All" ? "ทั้งหมด" : statusLabelMap[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Saved views (v1: localStorage per entity, URL เป็น source of truth) */}
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-[var(--cmms-border)] pt-3">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--cmms-text-secondary)]">
              <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
              <span>มุมมองที่บันทึก</span>
              {dirty && <Badge variant="neutral">แก้ไขแล้ว</Badge>}
            </div>
            <Select
              value={activeViewId || "__none__"}
              onValueChange={(v) => {
                if (v === "__none__") return;
                const view = savedViews.find((sv) => sv.id === v);
                if (view) applyViewState(view);
              }}
            >
              <SelectTrigger aria-label="มุมมองที่บันทึก" className="w-full sm:w-56">
                <SelectValue placeholder="เลือกมุมมอง..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— เลือกมุมมอง —</SelectItem>
                {savedViews.map((sv) => (
                  <SelectItem key={sv.id} value={sv.id}>
                    {sv.name}{sv.isDefault ? " (ค่าเริ่มต้น)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="secondary" size="sm" onClick={openSaveView} className="gap-1.5">
              <Bookmark className="h-4 w-4" aria-hidden="true" />
              {activeViewId ? "บันทึกทับมุมมอง" : "บันทึกมุมมอง"}
            </Button>
            {activeViewId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm">จัดการมุมมอง</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => handleSetDefaultView(activeViewId)}>ตั้งเป็นค่าเริ่มต้น</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { const v = clearDefaultSavedView(ASSETS_VIEW_ENTITY); setSavedViews(v); showToast("success", "ยกเลิกค่าเริ่มต้นแล้ว"); }}>ยกเลิกค่าเริ่มต้นทั้งหมด</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteView(activeViewId)}>ลบมุมมองนี้</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {dirty && (
              <Button type="button" variant="ghost" size="sm" onClick={handleResetFilters}>
                รีเซ็ตตัวกรอง
              </Button>
            )}
          </div>

          {!loading && filtered.length === 0 ? (
            <EmptyState
              title="ไม่พบเครื่องจักร"
              description="ลองเปลี่ยนตัวกรอง หรือเพิ่มเครื่องจักรใหม่ในระบบ"
            />
          ) : (
            <SimpleDataTable<Asset>
              key={tableKey}
              columns={columns}
              data={filtered}
              loading={loading}
              getRowId={(r) => r.code}
              pageSize={10}
              emptyTitle="ไม่พบเครื่องจักร"
              emptyDescription="ลองเปลี่ยนตัวกรอง หรือเพิ่มเครื่องจักรใหม่ในระบบ"
            />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={saveViewOpen}
        onClose={() => setSaveViewOpen(false)}
        title={activeViewId ? "บันทึกทับมุมมอง" : "บันทึกมุมมองใหม่"}
        description="บันทึกตัวกรองและคำค้นหาปัจจุบันของทะเบียนเครื่องจักร (เก็บในเครื่องนี้)"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setSaveViewOpen(false)}>ยกเลิก</Button>
            <Button type="button" onClick={handleSaveView}>บันทึก</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="ชื่อมุมมอง"
            placeholder="เช่น เครื่องจักรพร้อมใช้งาน, แผนกผลิต"
            value={saveViewName}
            onChange={(e) => setSaveViewName(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-[var(--cmms-text-secondary)]">
            <Checkbox checked={saveAsDefault} onCheckedChange={(v) => setSaveAsDefault(!!v)} />
            ตั้งเป็นมุมมองเริ่มต้นของหน้านี้
          </label>
        </div>
      </Dialog>
    </PageShell>
  );
}
