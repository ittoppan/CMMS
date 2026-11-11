export type FilterPrimitive = string | number | boolean | null;
export type FilterRange = { from?: string; to?: string };
export type FilterOp = {
  op: "eq" | "neq" | "in" | "gt" | "gte" | "lt" | "lte" | "between" | "contains";
  value: unknown;
};
export type FilterValue = FilterPrimitive | string[] | FilterRange | FilterOp;

export type SavedViewSort = { key: string; dir: "asc" | "desc" } | null;

export type SavedView = {
  id: string;
  name: string;
  entity: string;
  version: 1;
  filters: Record<string, FilterValue>;
  sort?: SavedViewSort;
  search?: string | null;
  columns?: string[] | null;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SavedViewInput = {
  name: string;
  filters: Record<string, FilterValue>;
  sort?: SavedViewSort;
  search?: string | null;
  columns?: string[] | null;
  isDefault?: boolean;
};

export type FilterDef = {
  key: string;
  type: "select" | "multi" | "text" | "date" | "dateRange" | "number" | "boolean";
  label: string;
  param?: string;
};

export type SavedViewRegistry = {
  entity: string;
  filters: FilterDef[];
};

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function normalizeFilters(filters: Record<string, unknown> | undefined | null): Record<string, FilterValue> {
  if (!isPlainObject(filters)) return {};
  const out: Record<string, FilterValue> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined) continue;
    if (v === "" || v === null) continue;
    if (Array.isArray(v)) {
      const arr = v.filter((x) => x !== "" && x != null).map(String);
      if (arr.length) out[k] = arr;
      continue;
    }
    if (isPlainObject(v)) {
      out[k] = v as FilterRange | FilterOp;
      continue;
    }
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

export function isValidSavedView(v: unknown, entity?: string): v is SavedView {
  if (!isPlainObject(v)) return false;
  if (typeof v.id !== "string" || !v.id) return false;
  if (typeof v.name !== "string" || !v.name.trim()) return false;
  if (typeof v.entity !== "string" || !v.entity) return false;
  if (entity && v.entity !== entity) return false;
  if (v.version !== 1) return false;
  if (!isPlainObject(v.filters)) return false;
  if (typeof v.createdAt !== "string" || typeof v.updatedAt !== "string") return false;
  return true;
}
