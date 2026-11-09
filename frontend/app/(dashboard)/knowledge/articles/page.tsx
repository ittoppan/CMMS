"use client";

/**
 * app/(dashboard)/knowledge/articles/page.tsx — ทะเบียนบทความความรู้ (Phase 38)
 *
 * เริ่มต้นดูเฉพาะฉบับที่เผยแพร่แล้ว เพราะผู้ใช้ทั่วไปต้องได้ขั้นตอนที่ใช้งานได้จริง
 * ผู้ดูแลความรู้จึงต้องกด "รวมฉบับที่ยังไม่เผยแพร่" เพื่อเห็นร่างของทีม
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { usePageLayout } from "@/lib/pageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RefreshCw, Plus, BookMarked, FileEdit, ShieldAlert, EyeOff, GraduationCap } from "lucide-react";
import {
  fetchKnArticles,
  fetchKnCategories,
  fetchKnConfig,
  knStatusLabel,
  knConfidentialityLabel,
  KN_STATUS_LABELS,
  KN_STATUS_TONE,
  KN_CONFIDENTIALITY_TONE,
  fmtKnDate,
  knDaysUntil,
  type KnArticle,
  type KnCategory,
  type KnConfigResponse,
} from "@/lib/knowledge";
import { cn } from "@/lib/cn";

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

function ArticlesInner() {
  const hero = usePageHero("knowledge/articles");
  const layout = usePageLayout("/knowledge/articles", ["hero", "filters", "content"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  const router = useRouter();
  const params = useSearchParams();

  const [cfg, setCfg] = useState<KnConfigResponse | null>(null);
  const [cats, setCats] = useState<KnCategory[]>([]);
  const [items, setItems] = useState<KnArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [showUnpublished, setShowUnpublished] = useState(false);

  const can = cfg?.can;

  useEffect(() => {
    fetchKnConfig().then(setCfg).catch(() => {});
    fetchKnCategories().then((r) => setCats(r.categories || [])).catch(() => {});
  }, []);

  // ตั้งค่าจาก query string เพื่อให้ลิงก์จากหน้าอื่น (เช่น /knowledge) ใช้ได้
  useEffect(() => {
    const s = params.get("status");
    const c = params.get("category_id");
    const show = params.get("include_unpublished");
    if (s) setStatus(s);
    if (c) setCategoryId(c);
    if (show === "1") setShowUnpublished(true);
  }, [params]);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const r = await fetchKnArticles({
        q: q || undefined,
        status: status || undefined,
        category_id: categoryId ? Number(categoryId) : undefined,
        include_unpublished: showUnpublished || undefined,
        page_size: 50,
      });
      setItems(r.articles || []);
      setTotal(r.total ?? 0);
    } catch (e: any) {
      setError(e?.message || "โหลดรายการบทความไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [q, status, categoryId, showUnpublished]);

  useEffect(() => {
    load();
  }, [load]);

  const hasFilter = Boolean(q || status || categoryId);

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <div style={layoutStyle("hero")} className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>
            {hero.title}
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
            {hero.desc}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={load} disabled={refreshing}>
            <RefreshCw size={15} aria-hidden="true" /> รีเฟรช
          </Button>
          {can?.create && (
            <Link href="/knowledge/articles/create" className={buttonVariants({ variant: "primary" })}>
              <Plus size={16} aria-hidden="true" /> เขียนบทความ
            </Link>
          )}
        </div>
      </div>

      {/* ตัวกรอง */}
      <div style={layoutStyle("filters")} className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") load();
            }}
            placeholder="ค้นหาชื่อ อาการ หรือคำสำคัญ"
            className="w-[280px] pl-8"
            aria-label="ค้นหาบทความความรู้"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-56" aria-label="กรองตามสถานะบทความ">
            <SelectValue placeholder="สถานะทั้งหมด" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">สถานะทั้งหมด</SelectItem>
            {Object.entries(KN_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryId} onValueChange={(v) => setCategoryId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-56" aria-label="กรองตามหมวดหมู่">
            <SelectValue placeholder="หมวดหมู่ทั้งหมด" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">หมวดหมู่ทั้งหมด</SelectItem>
            {cats.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name_th}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {can?.edit && (
          <Button
            variant={showUnpublished ? "primary" : "ghost"}
            onClick={() => setShowUnpublished((v) => !v)}
            aria-pressed={showUnpublished}
          >
            <FileEdit size={15} aria-hidden="true" />
            {showUnpublished ? "แสดงทุกสถานะ" : "รวมฉบับที่ยังไม่เผยแพร่"}
          </Button>
        )}
        {hasFilter && (
          <Button
            variant="ghost"
            onClick={() => {
              setQ("");
              setStatus("");
              setCategoryId("");
              router.replace("/knowledge/articles");
            }}
          >
            ล้างตัวกรอง
          </Button>
        )}
      </div>

      {/* ตาราง */}
      <div style={layoutStyle("content")}>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>ทะเบียนบทความความรู้</CardTitle>
              <CardDescription>
                {total} รายการ
                {!showUnpublished && " — แสดงเฉพาะฉบับที่เผยแพร่ ซึ่งเป็นฉบับที่ผู้ใช้ควรเห็น"}
              </CardDescription>
            </div>
            <BookMarked size={18} className="text-[var(--cmms-text-secondary)]" aria-hidden="true" />
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-xl" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title={hasFilter ? "ไม่พบบทความที่ตรงเงื่อนไข" : "ยังไม่มีบทความความรู้ที่เผยแพร่"}
                  description={
                    hasFilter
                      ? "ลองเปลี่ยนคำค้นหรือล้างตัวกรอง"
                      : "เริ่มจากงานที่แก้บ่อยที่สุด — บทความแรกจะเปิดใช้งานได้หลังผ่านการทบทวนและเผยแพร่เท่านั้น"
                  }
                  icon={<GraduationCap size={40} />}
                  action={
                    can?.create ? (
                      <Link href="/knowledge/articles/create" className={buttonVariants({ variant: "primary" })}>
                        <Plus size={15} aria-hidden="true" /> เขียนบทความแรก
                      </Link>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5">บทความ</th>
                      <th className="px-4 py-2.5">หมวดหมู่</th>
                      <th className="px-4 py-2.5">สถานะ</th>
                      <th className="px-4 py-2.5">การเข้าถึง</th>
                      <th className="px-4 py-2.5">เวลา / ความปลอดภัย</th>
                      <th className="px-4 py-2.5">ทบทวนถัดไป</th>
                      <th className="px-4 py-2.5 text-right">เปิด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((a) => {
                      const days = knDaysUntil(a.next_review_date);
                      return (
                        <tr key={a.id} className="border-b last:border-0 hover:bg-[var(--cmms-bg-muted)]">
                          <td className="px-4 py-3">
                            <Link href={`/knowledge/articles/${a.id}`} className="font-medium text-foreground hover:underline">
                              {a.title}
                            </Link>
                            <p className="font-mono text-xs text-muted-foreground">
                              {a.article_key} · v{a.version_no}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {a.category_name_th ?? a.category_code ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn("cmms-status", lampTone(KN_STATUS_TONE[a.status]))}>
                              <span className="cmms-status-dot" />
                              {knStatusLabel(a.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {a.confidentiality === "internal" ? (
                              <span className="text-xs text-muted-foreground">ทั่วไป</span>
                            ) : (
                              <span
                                className={cn(
                                  "cmms-status",
                                  lampTone(KN_CONFIDENTIALITY_TONE[a.confidentiality]),
                                )}
                              >
                                <span className="cmms-status-dot" />
                                {knConfidentialityLabel(a.confidentiality)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {a.estimated_minutes !== null ? (
                              <span>{a.estimated_minutes} นาที</span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <EyeOff size={12} aria-hidden="true" /> ยังไม่ได้วัด
                              </span>
                            )}
                            {Boolean(a.requires_isolation) && (
                              <p className="mt-0.5 inline-flex items-center gap-1 font-medium text-[var(--cmms-danger)]">
                                <ShieldAlert size={12} aria-hidden="true" /> ต้องล็อกเครื่อง/ตัดไฟ
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {a.next_review_date ? (
                              <span
                                className={cn(
                                  days !== null && days < 0
                                    ? "text-[var(--cmms-danger)]"
                                    : "text-muted-foreground",
                                )}
                              >
                                {fmtKnDate(a.next_review_date)}
                                {days !== null &&
                                  (days < 0 ? ` (เกิน ${Math.abs(days)} วัน)` : ` (อีก ${days} วัน)`)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/knowledge/articles/${a.id}`}
                              className={buttonVariants({ variant: "ghost", size: "sm" })}
                              aria-label={`เปิดบทความ ${a.title}`}
                            >
                              เปิด
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {total > items.length && (
          <p className="text-xs text-muted-foreground">
            แสดง {items.length} จาก {total} รายการ — ใช้ตัวกรองเพิ่มเพื่อจำกัดผลลัพธ์
          </p>
        )}

        {showUnpublished && (
          <Alert
            variant="info"
            title="กำลังดูฉบับที่ยังไม่เผยแพร่"
            description="ฉบับร่าง/รอทบทวน/อนุมัติแล้วยังไม่ใช่คำแนะนำที่ใช้งานได้ในหน้างาน ผู้ใช้ทั่วไปจะไม่เห็นฉบับเหล่านี้"
          />
        )}
      </div>
    </div>
  );
}

export default function KnowledgeArticlesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      <ArticlesInner />
    </Suspense>
  );
}