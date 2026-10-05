"use client";

/**
 * app/(dashboard)/knowledge/page.tsx — ศูนย์ความรู้ (Phase 38 overview)
 *
 * หน้านี้เป็นทางเข้าเดียวของผู้ใช้ทั่วไป (ช่าง/ผู้ปฏิบัติงาน/ผู้ดูแล):
 *   ค้นหา → เปิดบทความ → ให้คะแนนว่าช่วยได้ไหม
 * ตัวเลขทุกตัวมาจาก /catalog ของ Phase 38 ซึ่งนับเฉพาะข้อมูลจริง
 * ถ้ายังไม่มีบทความที่เผยแพร่ จะบอกตรง ๆ ว่ายังไม่มี ไม่ใช่แสดง 0 ปลอม
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePageHero } from "@/lib/i18n";
import { usePageLayout } from "@/lib/pageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import AndonLamp from "@/components/AndonLamp";
import { Search, RefreshCw, Plus, GraduationCap, CircleAlert, ClipboardList, BookMarked, FileWarning, ArrowRight } from "lucide-react";
import {
  fetchKnCatalog,
  fetchKnFeatureStatus,
  knStatusLabel,
  KN_STATUS_TONE,
  type KnCatalog,
  type KnFeatureStatus,
} from "@/lib/knowledge";
import { cn } from "@/lib/cn";

function Kpi({
  label,
  value,
  sub,
  lamp,
}: {
  label: string;
  value: number;
  sub?: string;
  lamp?: "ok" | "warn" | "down" | "idle";
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          {lamp && <AndonLamp status={lamp} size="sm" />}
        </div>
        <div className="cmms-kpi-value">{value.toLocaleString("th-TH")}</div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </Card>
  );
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={cn("cmms-status", tone)}>
      <span className="cmms-status-dot" />
      {children}
    </span>
  );
}

function lampTone(tone: string | undefined): "ok" | "warn" | "down" | "idle" {
  switch (tone) {
    case "success":
      return "ok";
    case "warning":
      return "warn";
    case "danger":
      return "down";
    case "info":
      return "warn";
    default:
      return "idle";
  }
}

const FEATURE_TEXT: Record<string, { tone: "success" | "warning" | "danger"; label: string }> = {
  READY: { tone: "success", label: "ระบบความรู้พร้อมใช้งาน" },
  NO_PUBLISHED_KNOWLEDGE: { tone: "warning", label: "ยังไม่มีบทความที่เผยแพร่ — เริ่มเขียนบทความแรกได้เลย" },
  NO_USAGE_YET: { tone: "warning", label: "ยังไม่มีข้อมูลการใช้งาน — สถิติจะเริ่มนับจากการค้นจริง" },
  SCHEMA_MISSING: { tone: "danger", label: "ยังไม่ได้ติดตั้งตารางของศูนย์ความรู้ — ติดต่อผู้ดูแลระบบ" },
};

export default function KnowledgePage() {
  const hero = usePageHero("knowledge");
  const layout = usePageLayout("/knowledge", ["hero", "kpi", "content"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  const [cat, setCat] = useState<KnCatalog | null>(null);
  const [status, setStatus] = useState<KnFeatureStatus | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const [c, s] = await Promise.all([fetchKnCatalog(), fetchKnFeatureStatus()]);
      setCat(c);
      setStatus(s);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลศูนย์ความรู้ไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const feature = status ? FEATURE_TEXT[status.state] ?? { tone: "warning" as const, label: status.state } : null;
  const enabled = cat?.enabled ?? true;
  const trace = cat?.traceability;
  const usage = cat?.usage;

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      {/* Hero + ช่องค้นหา */}
      <div style={layoutStyle("hero")} className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            <Badge variant="primary" dot>
              <GraduationCap size={13} aria-hidden="true" /> Phase 38
            </Badge>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
            {hero.desc}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={load} disabled={refreshing}>
            <RefreshCw size={15} aria-hidden="true" /> รีเฟรช
          </Button>
          <Link href="/knowledge/articles/create" className={buttonVariants({ variant: "primary" })}>
            <Plus size={16} aria-hidden="true" /> เขียนบทความ
          </Link>
        </div>
      </div>

      {/* ช่องค้นหา — ใช้ GET เพื่อแชร์ลิงก์ได้ */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <form
          action="/knowledge/search"
          method="get"
          role="search"
          className="flex flex-1 items-center gap-2"
        >
          <div className="relative flex-1">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              name="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="พิมพ์อาการ เช่น เสียงดังผิดปกติ น้ำรั่ว หรือรหัสเครื่อง"
              className="pl-9"
              aria-label="ค้นหาความรู้"
            />
          </div>
          <Button type="submit" disabled={q.trim().length === 0}>
            ค้นหา
          </Button>
        </form>
      </div>

      {/* สถานะระบบ */}
      {feature && feature.tone !== "success" && (
        <Alert
          variant={feature.tone === "danger" ? "danger" : "warning"}
          title={feature.label}
          description={
            status?.state === "SCHEMA_MISSING"
              ? "รัน scripts/apply_phase38_knowledge.php เพื่อติดตั้งตารางและค่าตั้งตั้งต้น"
              : "เมื่อมีการใช้งานจริง ตัวเลขและช่องว่างความรู้จะอัปเดตอัตโนมัติ"
          }
        />
      )}

      {/* KPI — นับจากข้อมูลจริงเท่านั้น */}
      <div style={layoutStyle("kpi")} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading && !cat
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
          : cat && (
            <>
              <Kpi
                label="บทความที่เผยแพร่"
                value={cat.published_articles}
                sub={`บทความทั้งหมดในระบบ ${cat.total_articles}`}
                lamp={cat.published_articles > 0 ? "ok" : "warn"}
              />
              <Kpi
                label="ช่องว่างความรู้ที่ยังค้ง"
                value={cat.gaps_open}
                sub={usage?.searches_zero_result ? `จากค้นหาที่ไม่เจอ ${usage.searches_zero_result} ครั้ง` : "ยังไม่มีคำค้นที่ไม่เจอคำตอบ"}
                lamp={cat.gaps_open > 0 ? "warn" : "ok"}
              />
              <Kpi
                label="งานทบทวนที่ค้าง"
                value={cat.reviews_due}
                sub="รอบทบทวนตามเวลาและตามเหตุการณ์"
                lamp={cat.reviews_due > 0 ? "warn" : "ok"}
              />
              <Kpi
                label="เอกสารที่ล้าสมัย"
                value={cat.document_bridge.stale_references}
                sub="บทความที่อ้างเอกสารฉบับที่ไม่ใช่ฉบับล่าสุด"
                lamp={cat.document_bridge.stale_references > 0 ? "down" : "ok"}
              />
            </>
          )}
      </div>

      {/* เนื้อหาหลัก */}
      <div style={layoutStyle("content")} className="grid gap-4 lg:grid-cols-3">
        {/* หมวดหมู่ */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>หมวดหมู่ความรู้</CardTitle>
              <CardDescription>
                จัดกลุ่มตามระบบและอุปกรณ์ — เลขคือจำนวนบทความที่เผยแพร่จริง
              </CardDescription>
            </div>
            <Link
              href="/knowledge/articles"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
              aria-label="ดูบทความทั้งหมด"
            >
              ดูทั้งหมด <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
              </div>
            ) : (cat?.by_category?.length ?? 0) === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="ยังไม่มีบทความในหมวดหมู่ใดเลย"
                  description="เริ่มจากงานที่เจอบ่อยในหน้างาน แล้วเขียนเป็นอาการ–วิธีแก้ปัญหา ผู้ใช้จะค้นหาเจอในเวลาไม่กี่วินาที"
                  icon={<GraduationCap size={40} />}
                  action={
                    <Link href="/knowledge/articles/create" className={buttonVariants({ variant: "primary" })}>
                      <Plus size={15} aria-hidden="true" /> เขียนบทความแรก
                    </Link>
                  }
                />
              </div>
            ) : (
              <ul className="divide-y">
                {cat!.by_category.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--cmms-bg-muted)]">
                    <div className="min-w-0">
                      <Link
                        href={`/knowledge/articles?category_id=${c.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {c.name_th}
                      </Link>
                      <p className="font-mono text-xs text-muted-foreground">
                        {c.code}
                        {c.name_en ? ` · ${c.name_en}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                      {c.total > c.published && (
                        <span className="text-muted-foreground">ร่าง/รอตรวจ {c.total - c.published}</span>
                      )}
                      <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold tabular-nums">
                        {c.published} ฉบับ
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* สถานะด้านข้าง */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>ความครอบคลุมของความรู้</CardTitle>
              <CardDescription>ความเชื่อมโยงไปยังเครื่องและงานจริงในระบบ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {trace ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">บทความที่ผูกกับเครื่อง/งาน</span>
                    <span className="font-semibold tabular-nums">
                      {trace.published_with_relation}/{cat?.published_articles ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">บทความที่ยังไม่มีความเชื่อมโยง</span>
                    <span className="font-semibold tabular-nums">{trace.published_without_relation}</span>
                  </div>
                  {trace.note && <p className="text-xs text-muted-foreground">{trace.note}</p>}
                </>
              ) : (
                <Skeleton className="h-16 rounded-xl" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>สถิติการใช้งานจริง</CardTitle>
              <CardDescription>เกิดจากการค้นหาและการอ่านของผู้ใช้ในระบบ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {usage ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">เหตุการณ์การใช้งาน</span>
                    <span className="font-semibold tabular-nums">{usage.events}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">ผู้ตอบว่าช่วยได้/ไม่ช่วย</span>
                    <span className="font-semibold tabular-nums">{usage.helpfulness_answers}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">คำค้นทั้งหมด</span>
                    <span className="font-semibold tabular-nums">{usage.searches}</span>
                  </div>
                  {usage.answer_rate_note && (
                    <p className="text-xs text-muted-foreground">{usage.answer_rate_note}</p>
                  )}
                  {usage.top_used.length > 0 && (
                    <ul className="space-y-1.5 pt-1">
                      {usage.top_used.slice(0, 5).map((t) => (
                        <li key={t.article_id} className="flex items-center justify-between gap-2 text-xs">
                          <Link href={`/knowledge/articles/${t.article_id}`} className="truncate hover:underline">
                            {t.title}
                          </Link>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{t.c}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <Skeleton className="h-20 rounded-xl" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ทางลัด</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <QuickLink href="/knowledge/search" icon={<Search size={15} />} label="ค้นหาความรู้" />
              <QuickLink href="/knowledge/articles" icon={<BookMarked size={15} />} label="ทะเบียนบทความ" />
              <QuickLink href="/knowledge/gaps" icon={<CircleAlert size={15} />} label="ช่องว่างความรู้" />
              <QuickLink href="/knowledge/reviews" icon={<ClipboardList size={15} />} label="งานทบทวนความรู้" />
              <QuickLink href="/knowledge/usage" icon={<FileWarning size={15} />} label="สถิติการใช้งาน" />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* สถานะการเผยแพร่ */}
      {cat && enabled && Object.keys(cat.status_counts).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>บทความตามสถานะ</CardTitle>
            <CardDescription>ฉบับที่เผยแพร่แล้วแก้ไขไม่ได้ ต้องสร้างฉบับใหม่เสมอ</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(cat.status_counts).map(([k, v]) => (
              <Link
                key={k}
                href={`/knowledge/articles?status=${k}`}
                className="inline-flex items-center gap-2"
              >
                <Pill tone={lampTone(KN_STATUS_TONE[k])}>
                  {knStatusLabel(k)} {v}
                </Pill>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-accent"
    >
      <span className="text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1 font-medium text-foreground">{label}</span>
      <ArrowRight size={14} className="text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}