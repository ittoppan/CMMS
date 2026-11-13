"use client";

import { apiJson } from "@/lib/api";

/**
 * lib/dashboard-tower.ts — ตัวช่วยของ Dashboard TV wallboard (Maintenance Control Tower)
 *
 * - เรียก API เดิมของระบบเท่านั้น (ไม่สร้าง endpoint ใหม่ ไม่แก้สูตร KPI)
 * - ค่าที่ API ยังไม่มีข้อมูลจริง (OEE, MTBF/MTTR, downtime) ต้องปล่อยเป็น null
 *   เพื่อให้หน้าเพจแสดง N/A แทนการเดาค่า
 */

/** สีของกราฟ (recharts ต้องใช้สีจริง ไม่ใช่ CSS var) — ต้องตรงกับ token --tower-* ใน tower.css */
export const TOWER_PALETTE = {
  blue: "#2E7FE0",
  blueSoft: "#58A6F0",
  teal: "#2ED3C1",
  cyan: "#38BDF8",
  green: "#35C27A",
  amber: "#EFAB4B",
  red: "#F0605F",
  text: "#E9F2FC",
  text2: "#A8BDD6",
  text3: "#7A9AB8",
  grid: "rgba(140, 180, 225, 0.12)",
  panel: "#0B1D33",
  panelAlt: "#102845",
} as const;

/* ── Asset status by area (public/api/v1/asset_stats.php?resource=plant_map) ── */
export interface PlantMapAsset {
  id: number;
  code: string;
  name: string;
  status: string;
  location_name: string | null;
  zone_name: string | null;
  active_repairs: number;
  max_priority: string | null;
}

export async function fetchPlantMap(): Promise<PlantMapAsset[]> {
  const rows = await apiJson<PlantMapAsset[]>("/api/v1/asset_stats.php?resource=plant_map");
  return Array.isArray(rows) ? rows : [];
}

export interface AreaStatus {
  area: string;
  total: number;
  running: number;
  repair: number;
  down: number;
}

/** จัดกลุ่มสถานะเครื่องตามพื้นที่ — พื้นที่ว่างแสดงเป็น "ไม่ระบุพื้นที่" (ตามข้อมูลจริง) */
export function groupAssetsByArea(rows: PlantMapAsset[], limit = 6): AreaStatus[] {
  const map = new Map<string, AreaStatus>();
  for (const a of rows) {
    const area = (a.location_name || a.zone_name || "").trim() || "ไม่ระบุพื้นที่";
    const cur = map.get(area) ?? { area, total: 0, running: 0, repair: 0, down: 0 };
    cur.total += 1;
    // active_repairs คือจำนวนงานซ่อมที่ยังไม่ปิดบนเครื่องนั้น (จาก API)
    if (a.active_repairs > 0) cur.repair += 1;
    else cur.running += 1;
    if (a.status === "down" || a.status === "breakdown") cur.down += 1;
    map.set(area, cur);
  }
  return [...map.values()].sort((x, y) => y.total - x.total).slice(0, limit);
}

/* ── Spare parts ที่ต้องสั่งซื้อ (public/api/v1/spare_optimization.php) ── */
export interface SpareAvailability {
  on_hand: number;
  available: number;
  min_stock: number | null;
  shortfall: number;
  status: string;
  risk_level?: string;
}

export interface SpareReorderRow {
  id: number;
  code: string;
  name: string;
  unit?: string | null;
  criticality_level?: string | null;
  warehouse_name?: string | null;
  availability: SpareAvailability;
}

export interface SpareReorderResponse {
  rows: SpareReorderRow[];
  total: number;
}

export async function fetchReorderParts(limit = 5): Promise<SpareReorderResponse> {
  const r = await apiJson<SpareReorderResponse>(
    `/api/v1/spare_optimization.php?action=availability&needs_reorder=1&limit=${limit}`,
  );
  return { rows: Array.isArray(r?.rows) ? r.rows : [], total: Number(r?.total ?? 0) };
}

/* ── MTBF / MTTR รายเดือน (public/api/v1/mtbf_mttr.php) ── */
export interface MtbfMttrRow {
  id: number;
  asset_id: number;
  asset_name?: string | null;
  year: number | string;
  month: number | string;
  operating_hours?: number | string | null;
  total_failures?: number | string | null;
  total_downtime_minutes?: number | string | null;
  mtbf_hours?: number | string | null;
  mttr_minutes?: number | string | null;
}

export interface MtbfMttrPoint {
  key: string;
  label: string;
  mtbf: number | null;
  mttr: number | null;
}

const TH_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export async function fetchMtbfMttr(): Promise<MtbfMttrRow[]> {
  const rows = await apiJson<MtbfMttrRow[]>("/api/v1/mtbf_mttr.php");
  return Array.isArray(rows) ? rows : [];
}

/**
 * รวมตาราง mtbf_mttr (รายเครื่อง/รายเดือน) เป็นอนุกรมรายเดือน
 * ใช้ค่าเฉลี่ยของแถวที่มีค่าจริงเท่านั้น — ถ้าไม่มีแถวเลยจะคืน [] (หน้าเพจแสดง N/A)
 */
export function monthlyMtbfMttr(rows: MtbfMttrRow[], maxPoints = 8): MtbfMttrPoint[] {
  type Acc = { key: string; label: string; mtbfSum: number; mtbfN: number; mttrSum: number; mttrN: number };
  const buckets = new Map<string, Acc>();
  let rawSum = 0;

  for (const row of rows) {
    const year = Number(row.year);
    const month = Number(row.month);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) continue;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const acc = buckets.get(key) ?? { key, label: `${TH_MONTHS_SHORT[month - 1]} ${String(year).slice(-2)}`, mtbfSum: 0, mtbfN: 0, mttrSum: 0, mttrN: 0 };
    const mtbf = row.mtbf_hours === null || row.mtbf_hours === undefined ? NaN : Number(row.mtbf_hours);
    const mttr = row.mttr_minutes === null || row.mttr_minutes === undefined ? NaN : Number(row.mttr_minutes);
    if (Number.isFinite(mtbf)) { acc.mtbfSum += mtbf; acc.mtbfN += 1; rawSum += 1; }
    if (Number.isFinite(mttr)) { acc.mttrSum += mttr; acc.mttrN += 1; rawSum += 1; }
    buckets.set(key, acc);
  }

  if (rawSum === 0) return [];

  return [...buckets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-maxPoints)
    .map((b) => ({
      key: b.key,
      label: b.label,
      mtbf: b.mtbfN > 0 ? Math.round((b.mtbfSum / b.mtbfN) * 10) / 10 : null,
      mttr: b.mttrN > 0 ? Math.round(((b.mttrSum / b.mttrN / 60) * 10)) / 10 : null,
    }));
}

/* ── Formatters ── */
export function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "N/A";
  return Number(value).toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(Number(hours))) return "N/A";
  const v = Number(hours);
  return v.toLocaleString("th-TH", { minimumFractionDigits: v < 10 ? 1 : 0, maximumFractionDigits: 1 });
}

export function fmtMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(Number(minutes))) return "N/A";
  const v = Number(minutes);
  if (v < 60) return `${Math.round(v)} น.`;
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  return m > 0 ? `${h} ชม. ${m} น.` : `${h} ชม.`;
}

/** วันที่แบบสั้นสำหรับ TV: 13 พ.ย. 69 */
export function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}

/** เวลาที่ผ่านมาแบบอ่านเร็ว: 5 นาทีที่แล้ว */
export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} ชม. ที่แล้ว`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} วันที่แล้ว`;
  return fmtShortDate(iso);
}

export const TH_MONTHS = TH_MONTHS_SHORT;
