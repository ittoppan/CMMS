"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { RelFilters } from "@/lib/reliability";

/**
 * useRelFilters — keeps the reliability filter state in the URL query string.
 *
 * Why the URL: a reliability number is only meaningful together with its scope,
 * period and time basis. Putting them in the query makes every view
 * shareable/bookmarkable, keeps browser Back working, and lets a page hand its
 * current filters to another page (e.g. overview → asset matrix) by appending
 * the same query string.
 *
 * Every key here is read by src/helpers/reliability.php:rel_scope() /
 * rel_period(). Unknown keys are ignored by the engine, so nothing extra is
 * invented here.
 */

const FILTER_KEYS: (keyof RelFilters)[] = [
  "scope_type",
  "scope_id",
  "asset_status",
  "category",
  "criticality",
  "range",
  "from",
  "to",
  "operating_basis",
  "repair_time_basis",
];

/** Page defaults. The engine's own defaults live in rel_period()/rel_scope();
 *  these only pre-select controls so the UI shows what will actually be used. */
export const REL_DEFAULT_FILTERS: RelFilters = {
  scope_type: "fleet",
  range: "rolling_6m",
};

export function useRelFilters(defaults: Partial<RelFilters> = REL_DEFAULT_FILTERS) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo<RelFilters>(() => {
    const out: RelFilters = { ...defaults };
    for (const key of FILTER_KEYS) {
      const v = params.get(key);
      if (v !== null) out[key] = v;
    }
    return out;
  }, [params, defaults]);

  /** Merge a patch into the URL. `null`/`""` clears a key. */
  const setFilters = useCallback(
    (patch: RelFilters) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(defaults)) {
      if (value) next.set(key, String(value));
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [defaults, pathname, router]);

  /** Serialised current filters — append to any reliability href. */
  const query = useMemo(() => {
    const next = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const v = filters[key];
      if (v !== undefined && v !== null && v !== "") next.set(key, String(v));
    }
    return next.toString();
  }, [filters]);

  return { filters, setFilters, clearFilters, query, params };
}

/** Builds a reliability page href that carries the current filters. */
export function relNavHref(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}

/**
 * useRelParam — URL-backed state for a single non-filter control (sort order,
 * page number, metric choice, tab). Stored in the same query string as the
 * filters so the whole view stays shareable, and kept out of useRelFilters
 * because the engine does not read these keys.
 */
export function useRelParam(name: string, initial = "") {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const value = params.get(name) ?? initial;

  const set = useCallback(
    (v: string) => {
      const next = new URLSearchParams(params.toString());
      if (v === "" || v === initial) next.delete(name);
      else next.set(name, v);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [initial, name, params, pathname, router],
  );

  return [value, set] as const;
}
