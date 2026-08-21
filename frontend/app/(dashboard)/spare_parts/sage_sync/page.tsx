"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { DataTable, type UiTableFeatures } from "@/components/ui/table";
import type { ColumnDef } from "@tanstack/react-table";
import {
  RefreshCw,
  CheckCircle2,
  Database,
  FileCheck2,
  Wrench,
} from "lucide-react";

interface SyncLog {
  id: number | string;
  sync_type: string;
  status: string;
  item_code: string | null;
  doc_no: string | null;
  error_message: string | null;
  created_at: string;
}

interface Category {
  id: string;
  name: string;
  enabled: boolean;
  desc: string;
  count: number;
}

interface SyncConfig {
  mode: "full" | "new_only" | "stock_only";
  overwrite: boolean;
  fields: string[];
  enabled_categories: string[];
}

const CATEGORY_DESC: Record<string, string> = {
  "Spare Parts": "ตลับลูกปืน ซีล กรอง ไฮดรอลิก มอเตอร์ และชิ้นส่วนเครื่องจักร",
  "Raw Materials": "แผ่นฟิล์ม เม็ดพลาสติก หมึกพิมพ์ และสารเคมีเคลือบผิว",
  "Consumables": "น้ำมันหล่อลื่น จาระบี ผ้าเช็ดเครื่อง และเทปกาวอุตสาหกรรม",
  "Tools": "ประแจ สว่าน มิเตอร์วัดไฟ และเครื่องมือวัดความเที่ยงตรง",
};

const STAT_COUNT_KEY: Record<string, string> = {
  "Spare Parts": "spare_parts_count",
  "Raw Materials": "raw_materials_count",
  "Consumables": "consumables_count",
  "Tools": "tools_count",
};

const FIELD_LABELS: Record<string, string> = {
  name: "ชื่ออะไหล่ (Name)",
  description: "รายละเอียด (Description)",
  unit: "หน่วยนับ (Unit)",
  unit_price: "ราคาต้นทุน (Unit Price)",
  stock_qty: "ยอดคงเหลือ (Stock Qty)",
  min_stock: "จุดสั่งซื้อขั้นต่ำ (Min Stock)",
  max_stock: "สูงสุด (Max Stock)",
  location: "ตำแหน่งจัดเก็บ (Location)",
};

const MODE_LABELS: Record<string, { label: string; desc: string }> = {
  full: { label: "ดึงทั้งหมดและทับข้อมูลเดิม", desc: "ดึงทุกรายการจาก Sage 300 ตามหมวดที่เลือก แล้วทับข้อมูลใน CMMS" },
  new_only: { label: "เฉพาะรายการใหม่", desc: "เพิ่มเฉพาะรายการที่ยังไม่มีในระบบ ไม่แตะรายการเดิม" },
  stock_only: { label: "อัปเดตเฉพาะสต็อกและราคา", desc: "อัปเดตเฉพาะยอดคงเหลือและราคาของรายการเดิม ไม่แก้ชื่อ/ตำแหน่ง" },
};

export default function SageSyncConfigPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, string | number> | null>(null);
  const [erpDatabase, setErpDatabase] = useState("SAGE300_TOPPAN_LIVE");
  const [sageConnected, setSageConnected] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [syncingCat, setSyncingCat] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState("");

  // ---- sync configuration state ----
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);
  const [allowedCatsText, setAllowedCatsText] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/sage_sync.php");
      const json = await res.json();
      if (!res.ok || json.status !== "success") {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setStats(json.stats ?? {});
      setErpDatabase(json.erp_database ?? "SAGE300_TOPPAN_LIVE");
      setSageConnected(json.sage300_connected !== false);
      setLogs(Array.isArray(json.logs) ? json.logs : []);
      const mapped: Category[] = (Array.isArray(json.stock_categories) ? json.stock_categories : []).map((c: any) => ({
        id: c.id,
        name: c.name,
        enabled: c.enabled !== false,
        desc: CATEGORY_DESC[c.id] ?? "",
        count: parseInt(json.stats?.[STAT_COUNT_KEY[c.id]] ?? "0", 10) || 0,
      }));
      setCategories(mapped);

      // load sync config
      if (json.sync_config) {
        setSyncConfig({
          mode: json.sync_config.mode ?? "full",
          overwrite: json.sync_config.overwrite !== false,
          fields: Array.isArray(json.sync_config.fields) ? json.sync_config.fields : [],
          enabled_categories: Array.isArray(json.sync_config.enabled_categories) ? json.sync_config.enabled_categories : [],
        });
      }
      if (Array.isArray(json.allowed_categories)) {
        setAllowedCatsText(json.allowed_categories.join(", "));
      }
    } catch (e: any) {
      console.error("Sage sync load error", e);
      setError(e?.message || "ไม่สามารถโหลดข้อมูลการซิงค์ Sage ได้");
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSyncCategory = async (catId: string) => {
    setSyncingCat(catId);
    setSyncMessage("");
    setError(null);
    try {
      const res = await fetch("/api/v1/sage_sync.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", category: catId }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== "success") {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      const modeLabel = MODE_LABELS[json.mode as keyof typeof MODE_LABELS]?.label ?? "";
      setSyncMessage(
        `✅ ${json.message || "ซิงค์ข้อมูลสำเร็จ"} — เพิ่มใหม่ ${json.created ?? 0} | อัปเดต ${json.updated ?? 0} | ข้าม ${json.skipped ?? 0} รายการ${modeLabel ? ` (${modeLabel})` : ""}`
      );
      setTimeout(() => setSyncMessage(""), 8000);
      await fetchData();
    } catch (e: any) {
      console.error("Sync error", e);
      setError(e?.message || "เกิดข้อผิดพลาดในการซิงค์ กรุณาลองใหม่");
    } finally {
      setSyncingCat(null);
    }
  };

  const toggleCategory = (id: string) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  };

  const handleSaveConfig = async () => {
    if (!syncConfig) return;
    setSavingConfig(true);
    setError(null);
    setSyncMessage("");
    try {
      const enabled = categories.filter(c => c.enabled).map(c => c.id);
      const res = await fetch("/api/v1/sage_sync.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_config",
          config: { ...syncConfig, enabled_categories: enabled },
          allowed_categories: allowedCatsText,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== "success") {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setSyncMessage(`${json.message || "บันทึกรูปแบบการดึงสำเร็จ"}`);
      setTimeout(() => setSyncMessage(""), 6000);
      await fetchData();
    } catch (e: any) {
      console.error("Save config error", e);
      setError(e?.message || "เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่");
    } finally {
      setSavingConfig(false);
    }
  };

  const totalItems = useMemo(() => parseInt(String(stats?.total_items ?? "0"), 10) || 0, [stats]);
  const syncedCount = useMemo(() => parseInt(String(stats?.synced_count ?? "0"), 10) || 0, [stats]);
  const lastSyncTime = stats?.last_sync_time || "—";

  const columns: ColumnDef<UiTableFeatures, SyncLog>[] = [
    {
      id: "item_code",
      header: "หมวดหมู่ / รายการ",
      cell: ({ row }: { row: { original: SyncLog } }) => (
        <div className="space-y-0.5">
          <div className="text-sm font-semibold">{row.original.item_code || "—"}</div>
          {row.original.error_message && (
            <div className="text-sm text-[var(--cmms-text-secondary)]">{row.original.error_message}</div>
          )}
        </div>
      ),
    },
    {
      id: "sync_type",
      header: "ประเภท",
      cell: ({ row }: { row: { original: SyncLog } }) => (
        <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>
          {row.original.sync_type || "SAGE_SYNC"}
        </span>
      ),
    },
    {
      id: "status",
      header: "สถานะ",
      cell: ({ row }: { row: { original: SyncLog } }) => (
        <span
          className="cmms-andon-chip"
          style={
            String(row.original.status).toUpperCase() === "SUCCESS"
              ? { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" }
              : { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }
          }
        >
          {String(row.original.status).toUpperCase() === "SUCCESS" ? "สำเร็จ" : row.original.status || "ไม่ทราบ"}
        </span>
      ),
    },
    {
      id: "created_at",
      header: "เวลาซิงค์",
      cell: ({ row }: { row: { original: SyncLog } }) => (
        <span className="text-sm">{row.original.created_at || "—"}</span>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <Spinner size={22} label="กำลังโหลดข้อมูลการซิงค์ Sage..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>SAGE SYNC · CMMS-TOPPAN</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>ตั้งค่าการดึงสต็อก Sage 300 ERP</h2>
            <span className="cmms-andon-chip" style={{ background: sageConnected ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)" }}>
              <Database size={14} strokeWidth={1.75} aria-hidden="true" /> {sageConnected ? "Sage 300 Connected" : "Sage 300 ไม่พร้อม"}
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            เลือกประเภทสต็อก กำหนดรูปแบบการดึง และซิงค์ข้อมูลกับฐานข้อมูล Sage 300 ERP (Inventory Control Module)
          </p>
        </div>
        <button
          type="button"
          onClick={() => (window.location.href = "/spare_parts")}
          className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-white/20"
        >
          กลับไปยังคลังอะไหล่
        </button>
      </div>

      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      {/* Sync Success Alert */}
      {syncMessage && (
        <Alert variant="success" title={syncMessage} />
      )}

      {/* Connection Info Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        <Card className="cmms-kpi-card blue">
          <div className="space-y-1 p-4">
            <p className="text-xs text-[var(--cmms-text-secondary)]">ฐานข้อมูล Sage 300 ERP Server</p>
            <h3 className="cmms-kpi-value">{erpDatabase}</h3>
            <p className="text-sm" style={{ color: sageConnected ? "var(--cmms-primary)" : "var(--cmms-danger)" }}>
              {sageConnected ? "สถานะการเชื่อมต่อ: ปกติ" : "สถานะการเชื่อมต่อ: ไม่พร้อม"}
            </p>
          </div>
        </Card>

        <Card className="cmms-kpi-card green">
          <div className="space-y-1 p-4">
            <p className="text-xs text-[var(--cmms-text-secondary)]">โมดูลที่เชื่อมต่อ</p>
            <h3 className="cmms-kpi-value">Sage 300 I/C v6.8A</h3>
            <p className="text-sm text-[var(--cmms-text-secondary)]">ควบคุมสต็อกและการขอสั่งซื้อ</p>
          </div>
        </Card>

        <Card className="cmms-kpi-card amber">
          <div className="space-y-1 p-4">
            <p className="text-xs text-[var(--cmms-text-secondary)]">รายการสต็อกที่ซิงค์</p>
            <h3 className="cmms-kpi-value">
              {totalItems.toLocaleString("th-TH")} <span className="text-sm font-normal">รายการ</span>
            </h3>
            <p className="text-sm text-[var(--cmms-text-secondary)]">
              ซิงค์แล้ว {syncedCount.toLocaleString("th-TH")} รายการ · ล่าสุด {lastSyncTime}
            </p>
          </div>
        </Card>
      </div>

      {/* Sync Mode Configuration */}
      {syncConfig && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Wrench size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-primary)" }} />
                <h4 className="text-base font-bold tracking-tight">รูปแบบการดึงข้อมูล</h4>
              </div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">
                กำหนดวิธีที่ระบบดึงและนำเข้าข้อมูลจาก Sage 300 — บันทึกแล้วจะใช้กับการซิงค์ครั้งถัดไปทุกครั้ง
              </p>
            </div>

            {/* Radio group: รูปแบบการดึง */}
            <div role="radiogroup" aria-label="รูปแบบการดึง" className="space-y-2">
              {Object.entries(MODE_LABELS).map(([key, m]) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-start gap-3 rounded-[var(--cmms-radius)] border p-3 transition-colors"
                  style={{
                    borderColor: syncConfig.mode === key ? "var(--cmms-primary)" : "var(--cmms-border)",
                    background: syncConfig.mode === key ? "var(--cmms-primary-light)" : "var(--cmms-bg-card)",
                  }}
                >
                  <input
                    type="radio"
                    name="sync-mode"
                    value={key}
                    checked={syncConfig.mode === key}
                    onChange={() => setSyncConfig(prev => prev ? { ...prev, mode: key as SyncConfig["mode"] } : prev)}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--cmms-primary)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{m.label}</span>
                    <span className="block text-xs text-[var(--cmms-text-secondary)]">{m.desc}</span>
                  </span>
                </label>
              ))}
            </div>

            {/* Checkbox group: ฟิลด์ที่จะอัปเดต */}
            <fieldset disabled={syncConfig.mode === "new_only"} className="space-y-2">
              <legend className="text-sm font-semibold">ฟิลด์ที่จะอัปเดต (เฉพาะรายการที่มีอยู่แล้ว)</legend>
              <p className="text-xs text-[var(--cmms-text-secondary)]">
                {syncConfig.mode === "new_only" ? "โหมด New Items Only ไม่ทับรายการเดิม — ฟิลด์นี้จึงไม่มีผล" : "เลือกว่าการซิงค์จะทับข้อมูลรายการใดบ้าง"}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-disabled={syncConfig.mode === "new_only"}>
                {Object.entries(FIELD_LABELS).map(([key, label]) => (
                  <label
                    key={key}
                    className={`flex items-center gap-2.5 rounded-[var(--cmms-radius-sm)] border border-[var(--cmms-border)] px-3 py-2 text-sm transition-opacity ${syncConfig.mode === "new_only" ? "pointer-events-none opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={syncConfig.fields.includes(key)}
                      onChange={(e) => setSyncConfig(prev => prev ? {
                        ...prev,
                        fields: e.target.checked
                          ? [...prev.fields, key]
                          : prev.fields.filter(f => f !== key),
                      } : prev)}
                      className="h-4 w-4 shrink-0 accent-[var(--cmms-primary)]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Switch: ทับข้อมูลรายการเดิม */}
            <div className="flex items-start justify-between gap-4 rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] p-3">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold">ทับข้อมูลรายการเดิม</p>
                <p className="text-xs text-[var(--cmms-text-secondary)]">ปิด = ไม่แก้รายการที่อยู่ในระบบแล้ว (เพิ่มเฉพาะรายการใหม่)</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={syncConfig.overwrite}
                aria-label="ทับข้อมูลรายการเดิม"
                onClick={() => setSyncConfig(prev => prev ? { ...prev, overwrite: !prev.overwrite } : prev)}
                className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cmms-border-focus)]"
                style={{ background: syncConfig.overwrite ? "var(--cmms-primary)" : "var(--cmms-bg-muted)", boxShadow: "inset 0 0 0 1px var(--cmms-border)" }}
              >
                <span
                  className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200"
                  style={{ transform: syncConfig.overwrite ? "translateX(22px)" : "translateX(2px)" }}
                />
              </button>
            </div>

            <div className="space-y-1.5">
              <Input
                label="รหัสหมวดหมู่ Sage 300 ที่ดึง"
                value={allowedCatsText}
                onChange={(e) => setAllowedCatsText(e.target.value)}
              />
              <p className="text-xs text-[var(--cmms-text-muted)]">คั่นหลายรหัสด้วยเครื่องหมายจุลภาค เช่น 15400, 15401, 15402</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={savingConfig}
                onClick={handleSaveConfig}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white cmms-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingConfig ? "กำลังบันทึก..." : "บันทึกรูปแบบการดึง"}
              </button>
              <p className="text-sm text-[var(--cmms-text-secondary)]">
                หมวดหมู่ที่เปิดใช้งาน: {categories.filter(c => c.enabled).map(c => c.id).join(" · ") || "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stock Category Selection Matrix */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-1">
            <h4 className="text-base font-bold tracking-tight">กำหนดประเภทสต็อกที่ต้องการดึงมาจาก Sage 300 ERP</h4>
            <p className="text-sm text-[var(--cmms-text-secondary)]">
              เลือกประเภทสต็อกในระบบ Sage 300 เพื่อเปิดใช้งานการดึงยอดคงเหลือ จุดสั่งซื้อ (Reorder Point) และราคาต้นทุนอัตโนมัติ — กด "บันทึกรูปแบบการดึง" ด้านบนเพื่อจัดเก็บ
            </p>
          </div>

          {categories.length === 0 ? (
            <p className="text-sm text-[var(--cmms-text-secondary)]">ไม่พบประเภทสต็อก — กด "รีเฟรช" เพื่อโหลดใหม่</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {categories.map((cat) => (
                <Card
                  key={cat.id}
                  className="p-4"
                  style={{
                    background: cat.enabled ? "var(--cmms-bg-card)" : "var(--cmms-bg-muted)",
                    opacity: cat.enabled ? 1 : 0.6,
                  }}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Database size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-primary)" }} />
                        <span className="text-sm font-bold">{cat.name}</span>
                      </div>
                      <span
                        className="cmms-andon-chip"
                        style={
                          cat.enabled
                            ? { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" }
                            : { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }
                        }
                      >
                        {cat.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                      </span>
                    </div>

                    <p className="text-sm text-[var(--cmms-text-secondary)]">{cat.desc}</p>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2" style={{ borderColor: "var(--cmms-border)" }}>
                      <p className="text-xs text-[var(--cmms-text-secondary)]">ข้อมูลในคลัง: <strong>{cat.count.toLocaleString("th-TH")} รายการ</strong></p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => toggleCategory(cat.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] px-3 py-2 text-xs font-semibold text-[var(--cmms-text-secondary)] transition-all duration-300 hover:bg-[var(--cmms-bg-wash)]"
                        >
                          {cat.enabled ? "ปิดสิทธิ์" : "เปิดสิทธิ์"}
                        </button>
                        <button
                          type="button"
                          disabled={syncingCat === cat.id}
                          onClick={() => handleSyncCategory(cat.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white cmms-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" className={syncingCat === cat.id ? "animate-spin" : ""} />
                          {syncingCat === cat.id ? "กำลังดึง..." : "ดึงข้อมูลทันที"}
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Log History Table */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold tracking-tight">ประวัติการซิงค์ข้อมูลกับ Sage 300 ERP</h4>
            <button
              type="button"
              onClick={fetchData}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] px-3 py-2 text-xs font-semibold text-[var(--cmms-text-secondary)] transition-all duration-300 hover:bg-[var(--cmms-bg-wash)]"
            >
              <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
              รีเฟรช
            </button>
          </div>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <FileCheck2 size={24} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-text-secondary)" }} />
              <p className="text-sm text-[var(--cmms-text-secondary)]">ยังไม่มีประวัติการซิงค์ — กด "ดึงข้อมูลทันที" เพื่อเริ่มซิงค์</p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={logs}
              showPagination={false}
              getRowId={(row) => String(row.id)}
              emptyTitle="ไม่พบประวัติการซิงค์"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
