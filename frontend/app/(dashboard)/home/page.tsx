"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { NAV_GROUPS, sectionAccent, sectionIcon, type NavItemDef } from "@/components/dashboard/sidebar-nav";
import { useMenuPermission } from "@/lib/useMenuPermission";
import { getFrequentMenuItems } from "@/lib/frequent-menus";
import { t } from "@/lib/i18n";
import { usePageHero } from "@/lib/i18n";
import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

/** หน้าแรกแบบเมนูหลัก (app launcher) — ฉากเปิดหลังล็อกอิน โทนสว่าง (light launcher) */

interface Kpis {
  counts?: {
    requests_open?: number;
    active?: number;
    assigned?: number;
    overdue?: number;
    critical_active?: number;
    waiting_parts?: number;
  };
  can?: { review?: boolean; plan?: boolean; verify?: boolean };
}

interface Lamp {
  label: string;
  href: string;
  count: number;
  tone: "green" | "amber" | "red" | "blue";
}

const LAMP_TONE_CLASS: Record<Lamp["tone"], string> = {
  green: "cmms-home-tone-green",
  amber: "cmms-home-tone-amber",
  red: "cmms-home-tone-red",
  blue: "cmms-home-tone-blue",
};

const TILE_BADGE: Record<string, (k: Kpis["counts"]) => { n?: number; warn?: boolean; crit?: boolean } | undefined> = {
  "/repair/my_tasks": (k) => {
    const n = (k?.assigned ?? 0) + (k?.active ?? 0);
    return n > 0 ? { n, warn: true } : undefined;
  },
  "/repair": (k) => (k?.active ? { n: k.active } : undefined),
  "/repair/request": () => undefined,
  "/supervisor/review": (k) => (k?.requests_open ? { n: k.requests_open, warn: true } : undefined),
  "/repair/tracking": (k) => (k?.overdue ? { n: k.overdue, crit: true } : undefined),
};

function TileIcon({ ico, style }: { ico: ReactNode; style?: React.CSSProperties }) {
  return <span className="cmms-home-tile-ico" aria-hidden="true" style={style}>{ico}</span>;
}

/** การ์ดเมนู (แถว "ใช้บ่อย" + กลุ่มเมนูปกติ ใช้หน้าตาเดียวกัน) */
function MenuTileLink({ href, icon, label, counts, accent }: { href: string; icon: LucideIcon; label: string; counts: Kpis["counts"]; accent?: string }) {
  const badge = TILE_BADGE[href]?.(counts);
  const Icon = icon;
  return (
    <Link href={href} className="block h-full">
      <span
        className={`cmms-home-tile${href === "/repair/request" ? " cmms-home-signature" : ""}`}
      >
        <TileIcon ico={<Icon className="w-5 h-5" strokeWidth={1.75} />} style={accent && href !== "/repair/request" ? { background: `${accent}1A`, color: accent } : undefined} />
        <span className="cmms-home-tile-name">{label}</span>
        {badge ? (
          <span
            className={`cmms-home-tile-badge${badge.crit ? " crit" : badge.warn ? " warn" : ""}`}
          >
            {badge.n ?? 0}
          </span>
        ) : (
          <span className="cmms-home-tile-desc">
            {href === "/repair/request"
              ? "แจ้งซ่อมเครื่องจักร ส่งเข้าคิวหัวหน้าทันที"
              : null}
          </span>
        )}
      </span>
    </Link>
  );
}

export default function HomePage() {
  const hero = usePageHero("home");

  const { canShow, permission, userFullName } = useMenuPermission();
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [nowLabel, setNowLabel] = useState("");
  const canShowRef = useRef(canShow);
  canShowRef.current = canShow;

  // UX P5: เมนู "ใช้บ่อย" 8 รายการ — คำนวณฝั่ง client หลังสิทธิ์พร้อมเท่านั้น (กัน hydration mismatch)
  const [freqItems, setFreqItems] = useState<NavItemDef[] | null>(null);
  useEffect(() => {
    setFreqItems(getFrequentMenuItems(8, (k) => canShowRef.current(k)));
  }, [permission]);

  useEffect(() => {
    setNowLabel(new Intl.DateTimeFormat("th-TH", { dateStyle: "full", timeStyle: "short" }).format(new Date()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/supervisor.php?action=kpis")
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j && typeof j === "object") setKpis(j as Kpis); })
      .catch(() => { if (!cancelled) setKpis(null); });
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({
        titleKey: g.titleKey,
        title: t(g.titleKey),
        accent: sectionAccent(g.titleKey),
        groupIcon: sectionIcon(g.titleKey),
        items: g.items
          .filter((it) => !it.secondary && canShow(it.perm))
          .map((it) => ({ href: it.href, icon: it.icon, label: it.label ?? (it.labelKey ? t(it.labelKey) : "") })),
      }))
        .filter((g) => g.items.length > 0)
        .map((g) => ({ ...g, items: g.items.slice(0, 4) })),
    [canShow]
  );

  const lamps: Lamp[] = useMemo(() => {
    const c = kpis?.counts ?? {};
    return [
      { label: "งานวิกฤต", href: "/repair?priority=critical", count: c.critical_active ?? 0, tone: "red" },
      { label: "เกินกำหนด", href: "/repair/tracking", count: c.overdue ?? 0, tone: "amber" },
      { label: "รออนุมัติ", href: "/supervisor/review", count: c.requests_open ?? 0, tone: "blue" },
      { label: "มีช่างกำลังทำ", href: "/repair", count: c.active ?? 0, tone: "green" },
    ];
  }, [kpis]);

  const goto = useCallback((href: string) => {
    window.location.href = href;
  }, []);

  return (
    <PageShell
      breadcrumbs={[{ label: "หน้าแรก", href: "/home" }]}
      eyebrow={<p className="cmms-eyebrow">จุดเริ่มการทำงานทุกวัน</p>}
      title="หน้าแรก"
      description={`สวัสดี${userFullName ? ` คุณ${userFullName}` : ""}${nowLabel ? ` · ${nowLabel}` : ""}`}
    >
      <div className="cmms-home p-5 sm:p-7 space-y-8">
        <section className="cmms-home-hero" aria-label="ยินดีต้อนรับ">
          <div className="cmms-home-hero-text">
            <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.72)" }}>CMMS-TOPPAN · จุดเริ่มการทำงานทุกวัน</p>
            <h2 className="cmms-home-hero-title">
              สวัสดี{userFullName ? ` คุณ${userFullName}` : ""}
            </h2>
            <p className="cmms-home-hero-sub">{nowLabel || "กำลังโหลดเวลา..."}</p>
          </div>
          <div className="cmms-home-hero-stats" aria-label="สถิติด่วน">
            {lamps.map((l) => (
              <button
                key={l.label}
                type="button"
                className="cmms-home-hero-stat"
                onClick={() => goto(l.href)}
              >
                <span className="cmms-home-hero-stat-num">{l.count}</span>
                <span className="cmms-home-hero-stat-label">{l.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="สถานะพื้นที่การผลิต (ANDON)">
          <div className="flex flex-wrap gap-3">
            {lamps.map((l) => (
              <button
                key={l.label}
                type="button"
                className="cmms-home-lamp"
                onClick={() => goto(l.href)}
              >
                <span
                  className={`cmms-home-lamp-dot ${LAMP_TONE_CLASS[l.tone]}`}
                  style={{
                    background: "currentColor",
                    opacity: l.count > 0 ? undefined : 0.28,
                    animation: l.count > 0 ? undefined : "none",
                  }}
                />
                <span className="flex flex-col">
                  <span className="cmms-home-lamp-num">{l.count}</span>
                  <span className="cmms-home-lamp-label">{l.label}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {freqItems && freqItems.length > 0 && (
          <section aria-label="เมนูที่ใช้บ่อย">
            <h3 className="cmms-home-group-title flex items-center gap-2">
              <span className="cmms-home-group-icon" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary)" }}>
                <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
              </span>
              ใช้บ่อย
            </h3>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {freqItems.map((it) => (
                <MenuTileLink key={it.href} href={it.href} icon={it.icon} label={it.label ?? (it.labelKey ? t(it.labelKey) : "")} counts={kpis?.counts ?? {}} />
              ))}
            </div>
          </section>
        )}

        {groups.map((g) => {
          const GroupIcon = g.groupIcon;
          return (
          <section key={g.title} aria-label={g.title}>
            <h3 className="cmms-home-group-title flex items-center gap-2">
              <span className="cmms-home-group-icon" style={{ background: `${g.accent}1A`, color: g.accent }}>
                <GroupIcon className="w-3.5 h-3.5" strokeWidth={2} />
              </span>
              {g.title}
            </h3>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {g.items.map((it) => (
                <MenuTileLink key={it.href} href={it.href} icon={it.icon} label={it.label} counts={kpis?.counts ?? {}} accent={g.accent} />
              ))}
            </div>
          </section>
          );
        })}
      </div>
    </PageShell>
  );
}
