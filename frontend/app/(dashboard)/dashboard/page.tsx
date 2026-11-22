"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Tv, Star } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { HubGrid, HubCard } from "@/components/layout/hub-grid";
import { useMenuPermission } from "@/lib/useMenuPermission";
import {
  DASHBOARD_REGISTRY,
  DASHBOARD_GROUPS,
  dashboardsByGroup,
  type DashboardItem,
} from "@/lib/dashboard-registry";

const FREQ_KEY = "cmms_dashboard_frequent";

function readFrequent(): string[] {
  try {
    const raw = localStorage.getItem(FREQ_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeFrequent(ids: string[]) {
  try {
    localStorage.setItem(FREQ_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export default function DashboardPortalPage() {
  const { canShow } = useMenuPermission();
  const [query, setQuery] = React.useState("");
  const [frequent, setFrequent] = React.useState<string[]>([]);

  React.useEffect(() => {
    setFrequent(readFrequent());
  }, []);

  const q = query.trim().toLowerCase();

  const visibleItems = React.useMemo(() => {
    return DASHBOARD_REGISTRY.filter((d) => {
      if (d.status === "planned" && !canShow("dashboard")) {
        // planned cards only for admin-ish: reuse dashboard perm as proxy; show to all who see dashboard
      }
      if (!canShow(d.perm)) return false;
      if (d.status === "planned") {
        // show planned only to those with dashboard perm (admin typically)
        if (!canShow("dashboard")) return false;
      }
      if (!q) return true;
      const hay = `${d.titleTh} ${d.titleEn} ${d.descriptionTh}`.toLowerCase();
      return hay.includes(q);
    });
  }, [canShow, q]);

  const frequentItems = React.useMemo(() => {
    return frequent
      .map((id) => DASHBOARD_REGISTRY.find((d) => d.id === id))
      .filter((d): d is DashboardItem => !!d && canShow(d.perm));
  }, [frequent, canShow]);

  const handleOpen = React.useCallback((item: DashboardItem) => {
    setFrequent((prev) => {
      const next = [item.id, ...prev.filter((x) => x !== item.id)].slice(0, 8);
      writeFrequent(next);
      return next;
    });
  }, []);

  const showTv = canShow("andon-board");

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">Dashboard</p>}
      title="ศูนย์รวม Dashboard"
      description="เลือก Dashboard ที่ต้องการดู — ค้นหาได้ทั้งไทยและอังกฤษ"
      actions={
        showTv ? (
          <Link
            href="/andon-board"
            className="inline-flex items-center gap-2 rounded-[var(--cmms-radius)] border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            <Tv size={16} aria-hidden="true" />
            โหมดจอใหญ่ (TV)
          </Link>
        ) : null
      }
    >
      <div className="space-y-6">
        {/* ช่องค้นหา */}
        <div className="relative">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหา Dashboard (ไทย/อังกฤษ/คำอธิบาย)"
            aria-label="ค้นหา Dashboard"
            className="h-11 w-full rounded-[var(--cmms-radius)] border border-border bg-card pl-10 pr-4 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>

        {/* ใช้บ่อย */}
        {frequentItems.length > 0 && !q && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Star size={16} aria-hidden="true" className="text-[var(--cmms-primary)]" />
              ใช้บ่อย
            </h2>
            <HubGrid>
              {frequentItems.map((item) => (
                <HubCard
                  key={`freq-${item.id}`}
                  icon={<item.icon size={20} aria-hidden="true" />}
                  title={item.titleTh}
                  description={item.descriptionTh}
                  href={item.href}
                  badge={item.status === "partial" ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">บางส่วน</span> : null}
                />
              ))}
            </HubGrid>
          </section>
        )}

        {/* กลุ่ม */}
        {DASHBOARD_GROUPS.map((g) => {
          const items = dashboardsByGroup(g.key).filter((d) => visibleItems.includes(d));
          if (items.length === 0) return null;
          return (
            <section key={g.key} className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">
                {g.titleTh} <span className="text-sm font-normal text-muted-foreground">({g.titleEn})</span>
              </h2>
              <HubGrid>
                {items.map((item) => {
                  const isPlanned = item.status === "planned";
                  if (isPlanned) {
                    return (
                      <div
                        key={item.id}
                        className="pointer-events-none opacity-50"
                        aria-disabled="true"
                      >
                        <HubCard
                          icon={<item.icon size={20} aria-hidden="true" />}
                          title={item.titleTh}
                          description={item.descriptionTh}
                          badge={<span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">เร็วๆ นี้</span>}
                        />
                      </div>
                    );
                  }
                  return (
                    <div key={item.id} onClick={() => handleOpen(item)}>
                      <HubCard
                        icon={<item.icon size={20} aria-hidden="true" />}
                        title={item.titleTh}
                        description={item.descriptionTh}
                        href={item.href}
                        badge={
                          item.status === "partial" ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">บางส่วน</span>
                          ) : null
                        }
                      />
                    </div>
                  );
                })}
              </HubGrid>
            </section>
          );
        })}

        {visibleItems.length === 0 && (
          <div className="rounded-[var(--cmms-radius)] border border-dashed border-border bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
            ไม่พบ Dashboard ที่ค้นหา
          </div>
        )}
      </div>
    </PageShell>
  );
}
