"use client";

/**
 * app/(dashboard)/knowledge/search/page.tsx — ค้นหาความรู้ (Phase 38)
 *
 * ข้อสำคัญเรื่องความจริงของข้อมูล:
 *   - answered=false คือ "ค้นไม่เจอ" ไม่ใช่ระบบล่ม จะแสดงชัดเจน
 *   - gap_opened เป็นผลจริงจาก server (เกิดเมื่อคำค้นสะสมถึงเกณฑ์)
 *   - บันทึกการคลิกดูผลลัพธ์ผ่าน search_click เพื่อให้นับ "ถูกใช้" ได้จริง
 *   - ห้ามแสดงเวลาตอบกลับถ้า server คืน took_ms = null
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
import {
  Search,
  RefreshCw,
  CircleAlert,
  FileText,
  ClipboardList,
  ShieldAlert,
  Timer,
  ThumbsUp,
  ThumbsDown,
  CircleHelp,
  ArrowRight,
  FileWarning,
} from "lucide-react";
import {
  searchKn,
  clickKnSearchResult,
  logKnUsage,
  sendKnFeedback,
  currentDevice,
  knStatusLabel,
  knConfidentialityLabel,
  knHelpfulnessLabel,
  KN_STATUS_TONE,
  KN_CONFIDENTIALITY_TONE,
  KN_HELPFULNESS_LABELS,
  fmtKnDate,
  knDaysUntil,
  type KnSearchResponse,
  type KnSearchHit,
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

function SearchBox({ initial, auto }: { initial: string; auto?: boolean }) {
  const [q, setQ] = useState(initial);
  const [asset, setAsset] = useState("");
  const router = useRouter();

  useEffect(() => {
    setQ(initial);
  }, [initial]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (asset.trim()) params.set("asset_id", asset.trim());
    router.push(`/knowledge/search${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <form onSubmit={submit} role="search" className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus={auto}
          placeholder="พิมพ์อาการหรือข้อมูลเครื่อง เช่น พื้นเสียงผิดปกติ เช่น M-104"
          className="pl-9"
          aria-label="ค้นหาความรู้"
        />
      </div>
      <Input
        value={asset}
        onChange={(e) => setAsset(e.target.value)}
        inputMode="numeric"
        placeholder="รหัสเครื่อง (ถ้ารู้)"
        className="sm:w-44"
        aria-label="รหัสเครื่องจักร"
      />
      <Button type="submit">ค้นหา</Button>
    </form>
  );
}

function HitCard({
  hit,
  searchLogId,
  onOpened,
}: {
  hit: KnSearchHit;
  searchLogId: number;
  onOpened: (articleId: number) => void;
}) {
  const days = knDaysUntil(hit.next_review_date);

  const open = () => {
    onOpened(hit.id);
    // log การใช้งานที่ server แล้วถ้าผิดพลาดก็ไม่กระทบการเปิดหน้า
    logKnUsage(hit.id, "open_procedure", {
      device: currentDevice(),
      entity_type: "asset",
    }).catch(() => {});
  };

  return (
    <Card className="transition-colors hover:border-[var(--cmms-primary)]/40">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base">
              <Link href={`/knowledge/articles/${hit.id}`} className="hover:underline">
                {hit.title}
              </Link>
            </CardTitle>
            <CardDescription className="font-mono text-xs">
              {hit.article_key} · v{hit.version_no}
              {hit.category_code ? ` · ${hit.category_name_th ?? hit.category_code}` : ""}
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <span className={cn("cmms-status", lampTone(KN_STATUS_TONE[hit.status]))}>
              <span className="cmms-status-dot" />
              {knStatusLabel(hit.status)}
            </span>
            {hit.confidentiality !== "internal" && (
              <span className={cn("cmms-status", lampTone(KN_CONFIDENTIALITY_TONE[hit.confidentiality]))}>
                <span className="cmms-status-dot" />
                {knConfidentialityLabel(hit.confidentiality)}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hit.summary && <p className="text-sm leading-relaxed text-foreground">{hit.summary}</p>}
        {hit.symptoms && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">อาการ: </span>
            {hit.symptoms}
          </p>
        )}
        {hit.diagnosis && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">การวินิจฉัย: </span>
            {hit.diagnosis}
          </p>
        )}
        {hit.resolution && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">วิธีแก้: </span>
            {hit.resolution}
          </p>
        )}
        {hit.safety_notes && (
          <p className="flex items-start gap-1.5 rounded-lg bg-[var(--cmms-warning-subtle)] px-2.5 py-2 text-xs text-foreground">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold">ความปลอดภัย: </span>
              {hit.safety_notes}
            </span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
          {hit.estimated_minutes !== null && (
            <span className="inline-flex items-center gap-1">
              <Timer size={13} aria-hidden="true" /> ใช้เวลาประมาณ {hit.estimated_minutes} นาที
            </span>
          )}
          {Boolean(hit.requires_isolation) && (
            <span className="inline-flex items-center gap-1 font-medium text-[var(--cmms-danger)]">
              <ShieldAlert size={13} aria-hidden="true" /> ต้องล็อกเครื่อง/ตัดไฟก่อน
            </span>
          )}
          {hit.next_review_date && (
            <span className={cn(days !== null && days < 0 && "text-[var(--cmms-danger)]")}>
              ทบทวนถัดไป {fmtKnDate(hit.next_review_date)}
              {days !== null && (days < 0 ? ` (เกิน ${Math.abs(days)} วัน)` : ` (อีก ${days} วัน)`)}
            </span>
          )}
        </div>
        <Button
          variant="primary"
          size="sm"
          className="mt-1"
          onClick={open}
          aria-label={`เปิดขั้นตอนของ ${hit.title}`}
        >
          เปิดขั้นตอน <ArrowRight size={14} aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  );
}

function FeedbackBar({ articleId, title }: { articleId: number; title: string }) {
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);

  const send = async (helpfulness: "helpful" | "not_helpful" | "no_answer") => {
    setBusy(true);
    try {
      // apiJson ใส่ X-CSRF-Token ให้เอง — ห้ามยิง fetch ตรงเพราะจะโดน 403
      await sendKnFeedback(articleId, helpfulness, comment || undefined, currentDevice());
      setDone(helpfulness);
    } catch {
      setDone("error");
    } finally {
      setBusy(false);
    }
  };

  if (done === "error") {
    return (
      <Alert variant="warning" title="บันทึกความคิดเห็นไม่สำเร็จ" description="ลองอีกครั้ง หรือแจ้งผู้ดูแลระบบ" />
    );
  }
  if (done) {
    return (
      <Alert
        variant="success"
        title="ขอบคุณสำหรับความคิดเห็น"
        description={`บันทึกแล้วว่า "${knHelpfulnessLabel(done)}" สำหรับ ${title}`}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">บทความนี้ช่วยได้ไหม?</CardTitle>
        <CardDescription>
          คำตอบของคุณถูกใช้เลือกบทความที่ควรปรับปรุงหรือทบทวน — ไม่บันทึกการค้นหาที่ไม่เกี่ยวข้อง
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => send("helpful")}>
            <ThumbsUp size={14} aria-hidden="true" /> {KN_HELPFULNESS_LABELS.helpful}
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => send("not_helpful")}>
            <ThumbsDown size={14} aria-hidden="true" /> {KN_HELPFULNESS_LABELS.not_helpful}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => send("no_answer")}>
            <CircleHelp size={14} aria-hidden="true" /> {KN_HELPFULNESS_LABELS.no_answer}
          </Button>
        </div>
        {showComment ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="บอกสั้น ๆ ว่าขาดอะไร (ไม่บังคับ)"
              aria-label="ความคิดเห็นเพิ่มเติม"
            />
          </div>
        ) : (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowComment(true)}
          >
            เพิ่มความคิดเห็น
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function SearchInner() {
  const hero = usePageHero("knowledge/search");
  const layout = usePageLayout("/knowledge/search", ["hero", "content", "charts"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const assetId = (params.get("asset_id") ?? "").trim();

  const [res, setRes] = useState<KnSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedbackFor, setFeedbackFor] = useState<{ id: number; title: string } | null>(null);

  const run = useCallback(async () => {
    if (!q) {
      setRes(null);
      setFeedbackFor(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const r = await searchKn(q, assetId ? { asset_id: Number(assetId) } : {});
      setRes(r);
      // ข้อเสนอให้ตอบหน้าแรกทันทีที่เจอบทความ
      const first = r.results[0];
      setFeedbackFor(first ? { id: first.id, title: first.title } : null);
    } catch (e: any) {
      setError(e?.message || "ค้นหาไม่สำเร็จ");
      setRes(null);
    } finally {
      setLoading(false);
    }
  }, [q, assetId]);

  useEffect(() => {
    run();
  }, [run]);

  const onOpened = (articleId: number) => {
    if (!res?.search_log_id) return;
    clickKnSearchResult(res.search_log_id, articleId, currentDevice()).catch(() => {});
  };

  const noAnswer = res && !res.answered;

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="ค้นหาไม่สำเร็จ" description={error} />}

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
        <Button variant="secondary" onClick={run} disabled={loading || !q}>
          <RefreshCw size={15} aria-hidden="true" /> ค้นใหม่
        </Button>
      </div>

      <SearchBox initial={q} auto={!q} />

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
        </div>
      )}

      {!loading && !q && (
        <EmptyState
          title="เริ่มจากอาการที่เจอหน้างาน"
          description="พิมพ์อาการแบบภาษาช่าง เช่น “เสียงดังตอนสตาร์ท” หรือใส่รหัสเครื่อง แล้วระบบจะหาบทความความรู้และเอกสารควบคุมที่เกี่ยวข้องให้"
          icon={<Search size={40} />}
          action={
            <Link href="/knowledge/articles" className={buttonVariants({ variant: "primary" })}>
              <ClipboardList size={15} aria-hidden="true" /> ดูบทความทั้งหมด
            </Link>
          }
        />
      )}

      {!loading && q && res && noAnswer && (
        <Alert
          variant="warning"
          title={`ไม่พบคำตอบสำหรับ "${res.query}"`}
          description={`บันทึกคำค้นนี้แล้ว (${res.took_ms !== null ? `ใช้เวลา ${res.took_ms} มิลลิวินาที` : "ไม่ทราบเวลาตอบกลับ"}) — ทีมงานจะเห็นในรายการช่องว่างความรู้เพื่อพิจารณาเขียนบทความ`}
        />
      )}

      {!loading && q && res && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>บทความความรู้ {res.knowledge_count} รายการ</span>
            {res.documents.length > 0 && <span>เอกสารควบคุม {res.documents.length} รายการ</span>}
            <span className={cn(res.answered && "text-[var(--cmms-success)]")}>
              {res.answered ? "มีคำตอบในระบบความรู้" : "ยังไม่มีคำตอบในระบบความรู้"}
            </span>
          </div>

          {/* ผลลัพธ์ */}
          <div style={layoutStyle("content")} className="space-y-3">
            {res.results.length === 0 ? (
              <EmptyState
                title="ยังไม่มีบทความที่ตรงคำค้นนี้"
                description="ลองใช้คำที่ใกล้เคียง หรือเปิดรายการช่องว่างความรู้เพื่อดูว่ามีคนค้นเรื่องเดียวกันอยู่แล้วหรือยัง"
                icon={<CircleAlert size={40} />}
                action={
                  <Link href="/knowledge/gaps" className={buttonVariants({ variant: "primary" })}>
                    ดูช่องว่างความรู้
                  </Link>
                }
              />
            ) : (
              res.results.map((hit) => (
                <HitCard key={hit.id} hit={hit} searchLogId={res.search_log_id} onOpened={onOpened} />
              ))
            )}
          </div>

          {/* คำค้นที่ยังไม่มีคำตอบ → ต้องการการกระทำของคน */}
          <div style={layoutStyle("charts")} className="space-y-4">
            {res.gap_opened?.opened && (
              <Alert
                variant="info"
                title="บันทึกเป็นช่องว่างความรู้แล้ว"
                description={`เกิดการค้นสะสมครบ ${res.gap_opened.occurrences} ครั้ง — ทีมงานสามารถสร้างบทความจากช่องว่างนี้ได้ที่หน้า ช่องว่างความรู้`}
              />
            )}

            {res.documents.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>เอกสารควบคุมที่เกี่ยวข้อง</CardTitle>
                  <CardDescription>เอกสารในระบบควบคุมเอกสารของ CMMS-TOPPAN เป็นเจ้าของเนื้อหาหลักตามกฎของ Phase 38</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {res.documents.map((d) => (
                    <Link
                      key={`doc-${d.id}`}
                      href={`/documents/${d.id}`}
                      className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-accent"
                    >
                      <FileText size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{d.title}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {d.doc_no}
                          {d.doc_type ? ` · ${d.doc_type}` : ""}
                        </p>
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}

            {feedbackFor && (
              <FeedbackBar articleId={feedbackFor.id} title={feedbackFor.title} />
            )}

            {!res.answered && (
              <Card>
                <CardHeader>
                  <CardTitle>ช่องว่างความรู้ที่เกี่ยวข้อง</CardTitle>
                  <CardDescription>ดูว่าคำค้นใกล้เคียงกันเคยถูกบันทึกไว้แล้วหรือยัง</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="/knowledge/gaps" className={buttonVariants({ variant: "secondary" })}>
                    <FileWarning size={15} aria-hidden="true" /> เปิดรายการช่องว่างความรู้
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function KnowledgeSearchPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      <SearchInner />
    </Suspense>
  );
}