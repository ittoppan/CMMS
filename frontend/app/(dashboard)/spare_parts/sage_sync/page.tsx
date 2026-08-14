"use client";

import { useState, useEffect, useMemo } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Grid } from "@astryxdesign/core/Grid";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { CheckboxList, CheckboxListItem } from "@astryxdesign/core/CheckboxList";
import { Switch } from "@astryxdesign/core/Switch";
import { TextInput } from "@astryxdesign/core/TextInput";
import { 
  ArrowPathIcon,
  CheckCircleIcon,
  CircleStackIcon,
  DocumentCheckIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

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

  const columns: TableColumn<SyncLog>[] = [
    {
      key: "item_code",
      header: "หมวดหมู่ / รายการ",
      width: proportional(2.2),
      renderCell: (item) => (
        <VStack gap={0}>
          <Text type="body" weight="semibold">{item.item_code || "—"}</Text>
          {item.error_message && (
            <Text type="body" size="sm" color="secondary">{item.error_message}</Text>
          )}
        </VStack>
      ),
    },
    {
      key: "sync_type",
      header: "ประเภท",
      width: proportional(1.2),
      renderCell: (item) => <Badge label={item.sync_type || "SAGE_SYNC"} variant="info" />,
    },
    {
      key: "status",
      header: "สถานะ",
      width: proportional(1.2),
      renderCell: (item) => (
        <Badge
          variant={String(item.status).toUpperCase() === "SUCCESS" ? "success" : "warning"}
          label={String(item.status).toUpperCase() === "SUCCESS" ? "สำเร็จ" : item.status || "ไม่ทราบ"}
        />
      ),
    },
    {
      key: "created_at",
      header: "เวลาซิงค์",
      width: proportional(1.8),
      renderCell: (item) => <Text type="body" size="sm">{item.created_at || "—"}</Text>,
    },
  ];

  if (loading) {
    return (
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดข้อมูลการซิงค์ Sage...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {/* Page Header */}
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>SAGE SYNC · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>ตั้งค่าการดึงสต็อก Sage 300 ERP</Heading>
            <span className="cmms-andon-chip" style={{ background: sageConnected ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)" }}>
              <CircleStackIcon className="w-3.5 h-3.5" /> {sageConnected ? "Sage 300 Connected" : "Sage 300 ไม่พร้อม"}
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            เลือกประเภทสต็อก กำหนดรูปแบบการดึง และซิงค์ข้อมูลกับฐานข้อมูล Sage 300 ERP (Inventory Control Module)
          </Text>
        </VStack>
        <button
          type="button"
          onClick={() => (window.location.href = "/spare_parts")}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
        >
          กลับไปยังคลังอะไหล่
        </button>
      </div>

      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      {/* Sync Success Alert */}
      {syncMessage && (
        <Card padding={4} style={{ background: 'var(--cmms-success-bg)', border: '1px solid var(--cmms-success)' }}>
          <HStack gap={3} vAlign="center">
            <CheckCircleIcon className="w-5 h-5" style={{ color: "var(--cmms-success)" }} />
            <Text type="body" weight="bold" style={{ color: 'var(--cmms-success)' }}>
              {syncMessage}
            </Text>
          </HStack>
        </Card>
      )}

      {/* Connection Info Cards */}
      <Grid columns={{ minWidth: 280, max: 3 }} gap={4}>
        <Card padding={4} className="cmms-kpi-card blue">
          <VStack gap={1}>
            <Text type="supporting" color="secondary">ฐานข้อมูล Sage 300 ERP Server</Text>
            <Heading level={3} className="cmms-kpi-value">{erpDatabase}</Heading>
            <Text type="body" size="sm" color={sageConnected ? "primary" : "error"}>
              {sageConnected ? "สถานะการเชื่อมต่อ: ปกติ" : "สถานะการเชื่อมต่อ: ไม่พร้อม"}
            </Text>
          </VStack>
        </Card>

        <Card padding={4} className="cmms-kpi-card green">
          <VStack gap={1}>
            <Text type="supporting" color="secondary">โมดูลที่เชื่อมต่อ</Text>
            <Heading level={3} className="cmms-kpi-value">Sage 300 I/C v6.8A</Heading>
            <Text type="body" size="sm" color="secondary">ควบคุมสต็อกและการขอสั่งซื้อ</Text>
          </VStack>
        </Card>

        <Card padding={4} className="cmms-kpi-card amber">
          <VStack gap={1}>
            <Text type="supporting" color="secondary">รายการสต็อกที่ซิงค์</Text>
            <Heading level={3} className="cmms-kpi-value">
              {totalItems.toLocaleString("th-TH")} <span style={{ fontSize: 14 }}>รายการ</span>
            </Heading>
            <Text type="body" size="sm" color="secondary">
              ซิงค์แล้ว {syncedCount.toLocaleString("th-TH")} รายการ · ล่าสุด {lastSyncTime}
            </Text>
          </VStack>
        </Card>
      </Grid>

      {/* Sync Mode Configuration */}
      {syncConfig && (
        <Card padding={5}>
          <VStack gap={4}>
            <VStack gap={1}>
              <HStack gap={2} vAlign="center">
                <WrenchScrewdriverIcon className="w-5 h-5" style={{ color: "var(--cmms-primary)" }} />
                <Heading level={4}>รูปแบบการดึงข้อมูล</Heading>
              </HStack>
              <Text type="body" size="sm" color="secondary">
                กำหนดวิธีที่ระบบดึงและนำเข้าข้อมูลจาก Sage 300 — บันทึกแล้วจะใช้กับการซิงค์ครั้งถัดไปทุกครั้ง
              </Text>
            </VStack>

            <RadioList
              label="รูปแบบการดึง"
              value={syncConfig.mode}
              onChange={(v) => setSyncConfig(prev => prev ? { ...prev, mode: v as SyncConfig["mode"] } : prev)}
              orientation="vertical"
            >
              {Object.entries(MODE_LABELS).map(([key, m]) => (
                <RadioListItem key={key} label={m.label} value={key} description={m.desc} />
              ))}
            </RadioList>

            <CheckboxList
              label="ฟิลด์ที่จะอัปเดต (เฉพาะรายการที่มีอยู่แล้ว)"
              description={syncConfig.mode === "new_only" ? "โหมด New Items Only ไม่ทับรายการเดิม — ฟิลด์นี้จึงไม่มีผล" : "เลือกว่าการซิงค์จะทับข้อมูลรายการใดบ้าง"}
              value={syncConfig.fields}
              onChange={(vals) => setSyncConfig(prev => prev ? { ...prev, fields: vals } : prev)}
              isDisabled={syncConfig.mode === "new_only"}
              density="balanced"
            >
              {Object.entries(FIELD_LABELS).map(([key, label]) => (
                <CheckboxListItem key={key} label={label} value={key} />
              ))}
            </CheckboxList>

            <Switch
              label="ทับข้อมูลรายการเดิม"
              description="ปิด = ไม่แก้รายการที่อยู่ในระบบแล้ว (เพิ่มเฉพาะรายการใหม่)"
              value={syncConfig.overwrite}
              onChange={(c) => setSyncConfig(prev => prev ? { ...prev, overwrite: c } : prev)}
            />

            <TextInput
              label="รหัสหมวดหมู่ Sage 300 ที่ดึง"
              description="คั่นหลายรหัสด้วยเครื่องหมายจุลภาค เช่น 15400, 15401, 15402"
              value={allowedCatsText}
              onChange={setAllowedCatsText}
            />

            <HStack gap={2} wrap="wrap">
              <button
                type="button"
                disabled={savingConfig}
                onClick={handleSaveConfig}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
              >
                {savingConfig ? "กำลังบันทึก..." : "บันทึกรูปแบบการดึง"}
              </button>
              <Text type="body" size="sm" color="secondary">
                หมวดหมู่ที่เปิดใช้งาน: {categories.filter(c => c.enabled).map(c => c.id).join(" · ") || "—"}
              </Text>
            </HStack>
          </VStack>
        </Card>
      )}

      {/* Stock Category Selection Matrix */}
      <Card padding={5}>
        <VStack gap={4}>
          <VStack gap={1}>
            <Heading level={4}>กำหนดประเภทสต็อกที่ต้องการดึงมาจาก Sage 300 ERP</Heading>
            <Text type="body" size="sm" color="secondary">
              เลือกประเภทสต็อกในระบบ Sage 300 เพื่อเปิดใช้งานการดึงยอดคงเหลือ จุดสั่งซื้อ (Reorder Point) และราคาต้นทุนอัตโนมัติ — กด "บันทึกรูปแบบการดึง" ด้านบนเพื่อจัดเก็บ
            </Text>
          </VStack>

          {categories.length === 0 ? (
            <Text type="body" color="secondary">ไม่พบประเภทสต็อก — กด "รีเฟรช" เพื่อโหลดใหม่</Text>
          ) : (
          <Grid columns={2} gap={4}>
            {categories.map((cat) => (
              <Card key={cat.id} padding={4} style={{ background: cat.enabled ? 'var(--cmms-bg-card)' : 'var(--cmms-bg-muted)', opacity: cat.enabled ? 1 : 0.6 }}>
                <VStack gap={3}>
                  <HStack hAlign="between" vAlign="center">
                    <HStack gap={2} vAlign="center">
                      <CircleStackIcon className="w-5 h-5" style={{ color: "var(--cmms-primary)" }} />
                      <Text type="body" weight="bold">{cat.name}</Text>
                    </HStack>
                    <Badge label={cat.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"} variant={cat.enabled ? "success" : "neutral"} />
                  </HStack>

                  <Text type="body" size="sm" color="secondary">{cat.desc}</Text>

                  <HStack hAlign="between" vAlign="center" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--cmms-border)' }}>
                    <Text type="supporting" color="secondary">ข้อมูลในคลัง: <strong>{cat.count.toLocaleString("th-TH")} รายการ</strong></Text>
                    <HStack gap={2}>
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--cmms-text-secondary)] bg-[var(--cmms-bg-muted)] hover:bg-[var(--cmms-bg-wash)] border border-[var(--cmms-border)] transition-all duration-300"
                      >
                        {cat.enabled ? "ปิดสิทธิ์" : "เปิดสิทธิ์"}
                      </button>
                      <button
                        type="button"
                        disabled={syncingCat === cat.id}
                        onClick={() => handleSyncCategory(cat.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white cmms-btn-primary"
                      >
                        <ArrowPathIcon className={`w-3.5 h-3.5 ${syncingCat === cat.id ? "animate-spin" : ""}`} />
                        {syncingCat === cat.id ? "กำลังดึง..." : "ดึงข้อมูลทันที"}
                      </button>
                    </HStack>
                  </HStack>
                </VStack>
              </Card>
            ))}
          </Grid>
          )}
        </VStack>
      </Card>

      {/* Sync Log History Table */}
      <Card padding={5}>
        <VStack gap={4}>
          <HStack hAlign="between" vAlign="center">
            <Heading level={4}>ประวัติการซิงค์ข้อมูลกับ Sage 300 ERP</Heading>
            <button
              type="button"
              onClick={fetchData}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--cmms-text-secondary)] bg-[var(--cmms-bg-muted)] hover:bg-[var(--cmms-bg-wash)] border border-[var(--cmms-border)] transition-all duration-300"
            >
              <ArrowPathIcon className="w-3.5 h-3.5" />
              รีเฟรช
            </button>
          </HStack>
          {logs.length === 0 ? (
            <VStack gap={2} style={{ padding: 32, textAlign: "center" }} hAlign="center">
              <DocumentCheckIcon className="w-6 h-6" style={{ color: "var(--color-secondary)" }} />
              <Text type="body" color="secondary">ยังไม่มีประวัติการซิงค์ — กด "ดึงข้อมูลทันที" เพื่อเริ่มซิงค์</Text>
            </VStack>
          ) : (
            <Table<SyncLog>
              data={logs}
              columns={columns}
              idKey="id"
              density="balanced"
              dividers="rows"
            />
          )}
        </VStack>
      </Card>
    </VStack>
  );
}
