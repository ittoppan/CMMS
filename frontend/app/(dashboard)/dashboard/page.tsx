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

/** สีเน้นต่อกลุ่ม (ใช้ token ของระบบทั้งหมด — ไม่มี hex) */
const GROUP_ACCENT: Record<string, string> = {
  A: "var(--cmms-primary)",
  B: "var(--cmms-info)",
  C: "var(--cmms-success)",
  D: "var(--cmms-warning)",
  E: "var(--cmms-primary-hover)",
  F: "var(--cmms-text-muted)",
};

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
        {/* ช่องค้นหา + สรุปจำนวน */}
        <div className="relative overflow-hidden rounded-[var(--cmms-radius-xl)] border border-[var(--cmms-border)] bg-[var(--cmms-surface)] p-3.5 sm:p-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-[var(--cmms-primary)]/10 blur-2xl"
          />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--cmms-text-secondary)]"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหา Dashboard (ไทย/อังกฤษ/คำอธิบาย)"
                aria-label="ค้นหา Dashboard"
                className="h-11 w-full rounded-[var(--cmms-radius-lg)] border border-[var(--cmms-border)] bg-[var(--cmms-surface)] pl-10 pr-4 text-sm shadow-[var(--cmms-shadow-sm)] outline-none transition-[border-color,box-shadow] focus-visible:border-[var(--cmms-border-focus)] focus-visible:ring-2 focus-visible:ring-[var(--cmms-primary)]/20"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-[var(--cmms-text-secondary)]">
              <span className="rounded-full border border-[var(--cmms-border)] bg-[var(--cmms-surface)]/80 px-2.5 py-1 font-medium tabular-nums">
                <strong className="text-[var(--cmms-text-primary)]">{visibleItems.length}</strong> Dashboard
              </span>
              <span className="rounded-full border border-[var(--cmms-border)] bg-[var(--cmms-surface)]/80 px-2.5 py-1 font-medium tabular-nums">
                <strong className="text-[var(--cmms-text-primary)]">{DASHBOARD_GROUPS.filter((g) => dashboardsByGroup(g.key).some((d) => visibleItems.includes(d))).length}</strong> กลุ่ม
              </span>
            </div>
          </div>
        </div>

        {/* ใช้บ่อย */}
        {frequentItems.length > 0 && !q && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
              <span aria-hidden="true" className="h-4 w-1 rounded-full bg-[var(--cmms-primary)]" />
              <Star size={15} aria-hidden="true" className="text-[var(--cmms-primary)]" />
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
                  onClick={() => handleOpen(item)}
                  accent="var(--cmms-primary)"
                  badge={item.status === "partial" ? <span className="rounded-full bg-[var(--cmms-warning-light)] px-2 py-0.5 text-xs font-medium text-[var(--cmms-warning-dark)]">บางส่วน</span> : null}
                />
              ))}
            </HubGrid>
          </section>
        )}

        {/* กลุ่ม */}
        {DASHBOARD_GROUPS.map((g) => {
          const items = dashboardsByGroup(g.key).filter((d) => visibleItems.includes(d));
          if (items.length === 0) return null;
          const accent = GROUP_ACCENT[g.key] ?? "var(--cmms-primary)";
          return (
            <section key={g.key} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span aria-hidden="true" className="h-4 w-1 rounded-full" style={{ backgroundColor: accent }} />
                <h2 className="text-[15px] font-semibold text-foreground">
                  {g.titleTh}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">{g.titleEn}</span>
                </h2>
                <span className="ml-auto rounded-full border border-[var(--cmms-border)] bg-[var(--cmms-surface)] px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--cmms-text-secondary)]">
                  {items.length}
                </span>
              </div>
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
                          accent={accent}
                          badge={<span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">เร็วๆ นี้</span>}
                        />
                      </div>
                    );
                  }
                  return (
                    <HubCard
                      key={item.id}
                      icon={<item.icon size={20} aria-hidden="true" />}
                      title={item.titleTh}
                      description={item.descriptionTh}
                      href={item.href}
                      onClick={() => handleOpen(item)}
                      accent={accent}
                      badge={
                        item.status === "partial" ? (
                          <span className="rounded-full bg-[var(--cmms-warning-light)] px-2 py-0.5 text-xs font-medium text-[var(--cmms-warning-dark)]">บางส่วน</span>
                        ) : null
                      }
                    />
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
