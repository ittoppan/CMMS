import { SavedView, SavedViewInput, isPlainObject, isValidSavedView, normalizeFilters } from "./types";

const MAX_VIEWS_PER_ENTITY = 20;

function storageKey(entity: string, userId?: string | number | null) {
  const u = userId == null || userId === "" ? "anon" : String(userId);
  return `cmms:savedViews:v1:${u}:${entity}`;
}

function nowIso() {
  return new Date().toISOString();
}

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function listSavedViews(entity: string, userId?: string | number | null): SavedView[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse(window.localStorage.getItem(storageKey(entity, userId)));
  if (!Array.isArray(parsed)) return [];
  const views = parsed.filter((v): v is SavedView => isValidSavedView(v, entity));
  views.sort((a, b) => {
    if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });
  return views;
}

function writeAll(entity: string, userId: string | number | null | undefined, views: SavedView[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(entity, userId), JSON.stringify(views));
}

export function saveSavedView(
  entity: string,
  input: SavedViewInput,
  userId?: string | number | null,
  existingId?: string
): { ok: true; view: SavedView; views: SavedView[] } | { ok: false; error: string } {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "กรุณาตั้งชื่อมุมมอง" };
  const views = listSavedViews(entity, userId);
  const ts = nowIso();
  const dup = views.find((v) => v.name.toLowerCase() === name.toLowerCase() && v.id !== existingId);
  if (dup) return { ok: false, error: "มีมุมมองชื่อนี้อยู่แล้ว" };

  let next: SavedView[];
  if (existingId) {
    const idx = views.findIndex((v) => v.id === existingId);
    if (idx === -1) return { ok: false, error: "ไม่พบมุมมองที่ต้องการแก้ไข" };
    const updated: SavedView = {
      ...views[idx],
      name,
      filters: normalizeFilters(input.filters as Record<string, unknown>),
      sort: input.sort ?? null,
      search: input.search ?? null,
      columns: input.columns ?? null,
      isDefault: input.isDefault ?? views[idx].isDefault ?? false,
      updatedAt: ts,
    };
    next = [...views];
    next[idx] = updated;
  } else {
    if (views.length >= MAX_VIEWS_PER_ENTITY) {
      return { ok: false, error: `บันทึกมุมมองได้สูงสุด ${MAX_VIEWS_PER_ENTITY} รายการต่อหน้า` };
    }
    const created: SavedView = {
      id: `sv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      entity,
      version: 1,
      filters: normalizeFilters(input.filters as Record<string, unknown>),
      sort: input.sort ?? null,
      search: input.search ?? null,
      columns: input.columns ?? null,
      isDefault: !!input.isDefault,
      createdAt: ts,
      updatedAt: ts,
    };
    next = [created, ...views];
  }

  if (input.isDefault) {
    const targetId = existingId || next[0].id;
    next = next.map((v) => ({ ...v, isDefault: v.id === targetId }));
  }
  writeAll(entity, userId, next);
  const saved = next.find((v) => (existingId ? v.id === existingId : v.name === name))!;
  return { ok: true, view: saved, views: listSavedViews(entity, userId) };
}

export function deleteSavedView(entity: string, id: string, userId?: string | number | null): SavedView[] {
  const views = listSavedViews(entity, userId).filter((v) => v.id !== id);
  writeAll(entity, userId, views);
  return views;
}

export function setDefaultSavedView(entity: string, id: string, userId?: string | number | null): SavedView[] {
  const views = listSavedViews(entity, userId).map((v) => ({ ...v, isDefault: v.id === id, updatedAt: v.id === id ? nowIso() : v.updatedAt }));
  writeAll(entity, userId, views);
  return listSavedViews(entity, userId);
}

export function clearDefaultSavedView(entity: string, userId?: string | number | null): SavedView[] {
  const views = listSavedViews(entity, userId).map((v) => (v.isDefault ? { ...v, isDefault: false, updatedAt: nowIso() } : v));
  writeAll(entity, userId, views);
  return listSavedViews(entity, userId);
}
