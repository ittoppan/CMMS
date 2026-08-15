"use client";

/**
 * form-data-sources.ts — แหล่งข้อมูลที่ผูกกับฟิลด์ในแบบฟอร์มดิจิทัล (F-EN)
 *
 * ในหน้าออกแบบ (formBuilder) ผู้ใช้เลือก "ข้อมูลจากฐานข้อมูล" ต่อฟิลด์
 * ในหน้ากรอก ฟิลด์นั้นจะกลายเป็น dropdown ที่โหลดค่าจริงจาก API ที่นี่
 */

export interface FormDataSource {
  key: string;
  label: string; // ไทย
  labelEn: string; // อังกฤษ
  api: string;
  valueKey: string;
  labelKey: string;
  filterActive?: boolean;
}

export const FORM_DATA_SOURCES: FormDataSource[] = [
  { key: "", label: "ไม่ผูกข้อมูล (พิมพ์เอง)", labelEn: "No data binding (manual)", api: "", valueKey: "", labelKey: "" },
  { key: "machine", label: "ทะเบียนเครื่องจักร", labelEn: "Machine registry", api: "/api/v1/asset_registry.php", valueKey: "code", labelKey: "name" },
  { key: "spare_part", label: "คลังอะไหล่", labelEn: "Spare parts", api: "/api/v1/spare_parts.php", valueKey: "code", labelKey: "name" },
  { key: "user", label: "ผู้ใช้ระบบ", labelEn: "System users", api: "/api/v1/users.php", valueKey: "id", labelKey: "full_name", filterActive: true },
  { key: "department", label: "แผนก", labelEn: "Departments", api: "/api/v1/departments.php", valueKey: "id", labelKey: "name", filterActive: true },
];

export function dataSourceLabel(key: string): string {
  const found = FORM_DATA_SOURCES.find((s) => s.key === key);
  return found ? found.label : "";
}

export interface DataOption {
  value: string;
  label: string;
}

/** โหลดตัวเลือกจริงจาก API ของแหล่งข้อมูล */
export async function fetchDataSourceOptions(src: FormDataSource): Promise<DataOption[]> {
  if (!src.api) return [];
  const res = await fetch(src.api, { credentials: "include" });
  if (!res.ok) return [];
  const json = await res.json();
  const list = Array.isArray(json) ? json : json.data ?? json.rows ?? [];
  return list
    .filter((row: any) => !src.filterActive || row.is_active !== 0)
    .map((row: any) => ({
      value: String(row[src.valueKey] ?? ""),
      label: String(row[src.labelKey] ?? ""),
    }))
    .filter((o: DataOption) => o.value !== "");
}
