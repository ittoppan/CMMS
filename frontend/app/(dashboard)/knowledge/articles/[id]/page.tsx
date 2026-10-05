"use client";

/**
 * app/(dashboard)/knowledge/articles/[id]/page.tsx — รายละเอียดบทความความรู้ (Phase 38)
 *
 * หน้านี้คือ "หน้าคู่มือประจำเครื่อง" ของช่าง จึงต้องอ่านง่ายมากกว่าหน้าทะเบียน
 * ทุกปุ่ม action ผูกกับสถานะจริง + สิทธิ์จาก config.can เท่านั้น ไม่เดา
 * การแก้ไขทึ้นใหม่ = new_version เสมอ (ฉบับที่เผยแพร่ immutable)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  RefreshCw,
  ShieldAlert,
  FileText,
  Link2,
  History,
  ThumbsUp,
  ThumbsDown,
  CircleHelp,
  Send,
  CheckCircle2,
  Undo2,
  Rocket,
  GitBranch,
  Archive,
  GraduationCap,
  AlertTriangle,
  Trash2,
  CalendarClock,
} from "lucide-react";
import {
  fetchKnArticle,
  fetchKnConfig,
  updateKnArticle,
  submitKnArticle,
  approveKnArticle,
  sendBackKnArticle,
  publishKnArticle,
  newKnVersion,
  archiveKnArticle,
  removeKnRelation,
  removeKnDocumentRef,
  logKnUsage,
  sendKnFeedback,
  checkKnDocumentStale,
  currentDevice,
  knStatusLabel,
  knConfidentialityLabel,
  knHelpfulnessLabel,
  knEntityTypeLabel,
  knRelationLinkLabel,
  knDocLinkLabel,
  knUsageActionLabel,
  KN_STATUS_TONE,
  KN_CONFIDENTIALITY_TONE,
  KN_HELPFULNESS_LABELS,
  fmtKnDate,
  fmtKnDateTime,
  knDaysUntil,
  type KnArticleDetail,
  type KnConfigResponse,
  type Tone,
} from "@/lib/knowledge";
import { cn } from "@/lib/cn";

function lampTone(tone: Tone | undefined): "ok" | "warn" | "down" | "idle" {
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

function Section({
  title,
  children,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Prose({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <div className="whitespace-pre-wrap rounded-lg bg-[var(--cmms-bg-muted)] px-3.5 py-3 text-sm leading-relaxed text-foreground">
      {text}
    </div>
  );
}

/** แปลง plain text ให้อ่านง่ายขึ้นเล็กน้อย โดยไม่ตีความ HTML */
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

export default function KnowledgeArticleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const hero = usePageHero("knowledge/articles/[id]");

  const [detail, setDetail] = useState<KnArticleDetail | null>(null);
  const [cfg, setCfg] = useState<KnConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // modal state
  const [editing, setEditing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [findings, setFindings] = useState("");
  const [reason, setReason] = useState("");

  // form
  const [summary, setSummary] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [resolution, setResolution] = useState("");
  const [prevention, setPrevention] = useState("");
  const [safetyNotes, setSafetyNotes] = useState("");
  const [minutes, setMinutes] = useState("");
  const [confidentiality, setConfidentiality] = useState("internal");

  const [feedbackState, setFeedbackState] = useState<string | null>(null);

  const article = detail?.article;
  const can = cfg?.can;

  const load = useCallback(async () => {
    setError("");
    try {
      const [d, c] = await Promise.all([fetchKnArticle(Number(id), true), fetchKnConfig()]);
      setDetail(d);
      setCfg(c);
      setSummary(d.article.summary ?? "");
      setSymptoms(d.article.symptoms ?? "");
      setDiagnosis(d.article.diagnosis ?? "");
      setRootCause(d.article.root_cause ?? "");
      setResolution(d.article.resolution ?? "");
      setPrevention(d.article.prevention ?? "");
      setSafetyNotes(d.article.safety_notes ?? "");
      setMinutes(d.article.estimated_minutes === null ? "" : String(d.article.estimated_minutes));
      setConfidentiality(d.article.confidentiality ?? "internal");
    } catch (e: any) {
      setError(e?.message || "โหลดบทความไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // บันทึกการเปิดอ่าน 1 ครั้งต่อหน้า — เป็นข้อมูลจริงที่ใช้วัดว่าบทความได้ถูกใช้
  const loggedRef = useRef(false);
  useEffect(() => {
    if (!article || loggedRef.current) return;
    loggedRef.current = true;
    logKnUsage(article.id, "view", { device: currentDevice() }).catch(() => {});
  }, [article]);

  const run = async (name: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      after?.();
    } catch (e: any) {
      setError(e?.message || "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  const submitFeedback = async (helpfulness: "helpful" | "not_helpful" | "no_answer") => {
    if (!article) return;
    setBusy("feedback");
    try {
      await sendKnFeedback(article.id, helpfulness, undefined, currentDevice());
      setFeedbackState(helpfulness);
      await load();
    } catch (e: any) {
      setError(e?.message || "บันทึกความคิดเห็นไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="space-y-4">
        <Alert variant="danger" title="ไม่พบบทความ" description={error || "บทความอาจถูกลบ หรือคุณไม่มีสิทธิ์เข้าถึงระดับการเข้าถึงนี้"} />
        <Link href="/knowledge/articles" className={buttonVariants({ variant: "secondary" })}>
          <ArrowLeft size={15} aria-hidden="true" /> กลับไปทะเบียน
        </Link>
      </div>
    );
  }

  const isPublished = article.status === "published";
  const editable = article.status === "draft" || article.status === "in_review" || article.status === "approved";
  const days = knDaysUntil(article.next_review_date);
  const usage = article.usage;

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="ทำรายการไม่สำเร็จ" description={error} />}
      {notice && <Alert variant="success" title="สำเร็จ" description={notice} />}

      {/* Hero */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>
            {article.title}
          </h1>
          <p className="mt-1 font-mono text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
            {article.article_key} · v{article.version_no}
            {article.category_name_th ? ` · ${article.category_name_th}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={cn("cmms-status", lampTone(KN_STATUS_TONE[article.status]))}>
              <span className="cmms-status-dot" />
              {knStatusLabel(article.status)}
            </span>
            {article.confidentiality !== "internal" && (
              <span className={cn("cmms-status", lampTone(KN_CONFIDENTIALITY_TONE[article.confidentiality]))}>
                <span className="cmms-status-dot" />
                {knConfidentialityLabel(article.confidentiality)}
              </span>
            )}
            {Boolean(article.requires_isolation) && (
              <span className={cn("cmms-status", "down")}>
                <span className="cmms-status-dot" />
                <ShieldAlert size={12} aria-hidden="true" /> ต้องล็อกเครื่อง/ตัดไฟ
              </span>
            )}
            {article.review_overdue && (
              <span className={cn("cmms-status", "down")}>
                <span className="cmms-status-dot" />
                <CalendarClock size={12} aria-hidden="true" /> ทบทวนเกินกำหนด
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" onClick={load} disabled={busy !== ""}>
            <RefreshCw size={15} aria-hidden="true" /> รีเฟรช
          </Button>
          <Button variant="ghost" onClick={() => router.push("/knowledge/articles")}>
            <ArrowLeft size={15} aria-hidden="true" /> ทะเบียน
          </Button>
        </div>
      </div>

      {/* แถบ action ตามสถานะจริง */}
      {(can?.edit || can?.submit || can?.approve || can?.publish || can?.review) && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-4">
            <span className="mr-1 text-xs text-muted-foreground">ดำเนินการ:</span>

            {can?.edit && editable && (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={busy !== ""}>
                แก้ไข
              </Button>
            )}
            {can?.submit && article.status === "draft" && (
              <Button
                variant="primary"
                size="sm"
                disabled={busy !== ""}
                onClick={() =>
                  run("submit", async () => {
                    const r = await submitKnArticle(article.id);
                    setNotice(`ส่งทบทวนแล้ว (รอบที่ ${r.review_round})`);
                  })
                }
              >
                <Send size={14} aria-hidden="true" /> ส่งทบทวน
              </Button>
            )}
            {can?.approve && article.status === "in_review" && (
              <>
                <Button variant="primary" size="sm" onClick={() => setApproving(true)} disabled={busy !== ""}>
                  <CheckCircle2 size={14} aria-hidden="true" /> อนุมัติ
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setRejecting(true)} disabled={busy !== ""}>
                  <Undo2 size={14} aria-hidden="true" /> ส่งแก้
                </Button>
              </>
            )}
            {can?.publish && article.status === "approved" && (
              <Button
                variant="primary"
                size="sm"
                disabled={busy !== ""}
                onClick={() =>
                  run("publish", async () => {
                    await publishKnArticle(article.id);
                    setNotice("เผยแพร่แล้ว — ฉบับก่อนหน้าถูกแทนที่อัตโนมัติ");
                  })
                }
              >
                <Rocket size={14} aria-hidden="true" /> เผยแพร่
              </Button>
            )}
            {isPublished && (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy !== ""}
                onClick={() =>
                  run("newver", async () => {
                    const r = await newKnVersion(article.id);
                    router.push(`/knowledge/articles/${r.id}`);
                  })
                }
              >
                <GitBranch size={14} aria-hidden="true" /> สร้างฉบับใหม่
              </Button>
            )}
            {(article.status === "superseded" || article.status === "archived") && (
              <span className="text-xs text-muted-foreground">ปิดฉบับนี้แล้ว อ่านได้อย่างเดียว</span>
            )}
          </CardContent>
        </Card>
      )}

      {/* เนื้อหา + แถบข้าง */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {editing ? (
            <Card>
              <CardHeader>
                <CardTitle>แก้ไขบทความ</CardTitle>
                <CardDescription>
                  {article.status === "approved" && "ฉบับนี้อนุมัติแล้ว หากแก้เนื้อหาจริงระบบจะส่งกลับไปเป็นร่างเพื่อทบทวนใหม่"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="e-summary">สรุป</Label>
                  <Textarea id="e-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-symptoms">อาการที่พบ</Label>
                  <Textarea id="e-symptoms" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} rows={3} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-diagnosis">การวินิจฉัย</Label>
                  <Textarea id="e-diagnosis" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={3} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-root">สาเหตุราก</Label>
                  <Textarea id="e-root" value={rootCause} onChange={(e) => setRootCause(e.target.value)} rows={3} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-resolution">วิธีแก้ปัญหา</Label>
                  <Textarea id="e-resolution" value={resolution} onChange={(e) => setResolution(e.target.value)} rows={5} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-prevention">การป้องกัน</Label>
                  <Textarea id="e-prevention" value={prevention} onChange={(e) => setPrevention(e.target.value)} rows={3} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-safety">ข้อควรระวังด้านความปลอดภัย</Label>
                  <Textarea id="e-safety" value={safetyNotes} onChange={(e) => setSafetyNotes(e.target.value)} rows={3} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="e-mins">ใช้เวลาประมาณ (นาที)</Label>
                    <Input
                      id="e-mins"
                      inputMode="numeric"
                      value={minutes}
                      onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="ไม่ทราบ"
                    />
                    <Hint>เว้นว่างไว้ = ยังไม่ได้วัด (ระบบจะไม่แสดงเป็น 0)</Hint>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="e-conf">ระดับการเข้าถึง</Label>
                    <Select value={confidentiality} onValueChange={setConfidentiality}>
                      <SelectTrigger id="e-conf" aria-label="เลือกระดับการเข้าถึง">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">ทั่วไป (Internal)</SelectItem>
                        <SelectItem value="restricted">จำกัดสิทธิ์ (Restricted)</SelectItem>
                        <SelectItem value="confidential">ลับ (Confidential)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy !== ""}
                    onClick={() =>
                      run("save", async () => {
                        await updateKnArticle(article.id, {
                          summary: summary.trim() || null,
                          symptoms: symptoms.trim() || null,
                          diagnosis: diagnosis.trim() || null,
                          root_cause: rootCause.trim() || null,
                          resolution: resolution.trim(),
                          prevention: prevention.trim() || null,
                          safety_notes: safetyNotes.trim() || null,
                          estimated_minutes: minutes.trim() === "" ? null : Number(minutes),
                          confidentiality,
                        });
                        setEditing(false);
                        setNotice("บันทึกการแก้ไขแล้ว");
                      })
                    }
                  >
                    บันทึก
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(false)}>
                    ยกเลิก
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="space-y-5 p-5">
                <Section title="อาการที่พบ" icon={<AlertTriangle size={14} />}>
                  <Prose text={article.symptoms} />
                </Section>
                <Section title="การวินิจฉัย">
                  <Prose text={article.diagnosis} />
                </Section>
                <Section title="สาเหตุราก">
                  <Prose text={article.root_cause} />
                </Section>
                <Section title="วิธีแก้ปัญหา" icon={<GraduationCap size={14} />}>
                  <Prose text={article.resolution} />
                </Section>
                <Section title="การป้องกันไม่ให้เกิดซ้ำ">
                  <Prose text={article.prevention} />
                </Section>
                {article.safety_notes && (
                  <div className="rounded-xl border border-[var(--cmms-warning)]/40 bg-[var(--cmms-warning-subtle)] p-3.5">
                    <p className="flex items-center gap-1.5 text-sm font-bold">
                      <ShieldAlert size={15} aria-hidden="true" /> ความปลอดภัย — ต้องทำก่อน
                    </p>
                    <div className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{article.safety_notes}</div>
                  </div>
                )}
                {!article.symptoms && !article.diagnosis && !article.resolution && (
                  <EmptyState
                    title="บทความนี้ยังไม่มีเนื้อหาขั้นตอน"
                    description="อยู่ระหว่างร่าง ยังไม่พร้อมใช้งานในหน้างาน"
                    icon={<GraduationCap size={36} />}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* ความเชื่อมโยงไปยังข้อมูลจริงในระบบ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">เชื่อมโยงไปยังข้อมูลในระบบ</CardTitle>
              <CardDescription>
                Knowledge อ้างอิงข้อมูลเหล่านี้เท่านั้น — ไม่แก้หรือลบข้อมูลต้นทาง
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <Link2 size={13} aria-hidden="true" /> เครื่อง / อะไหล่ / งาน ({article.relations.length})
                </h3>
                {article.relations.length === 0 ? (
                  <Hint>
                    ยังไม่มีความเชื่อมโยง — ควรเพิ่มอย่างน้อย 1 รายการก่อนเผยแพร่
                    {cfg?.config.publish_requires_relation ? " (ระบบบังคับ)" : ""}
                  </Hint>
                ) : (
                  <ul className="space-y-1.5">
                    {article.relations.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {r.entity_label ?? `${r.entity_type} #${r.entity_id}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {knEntityTypeLabel(r.entity_type)} · {knRelationLinkLabel(r.link_type)}
                            {r.note ? ` · ${r.note}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {r.target_missing && (
                            <Badge variant="danger">
                              ข้อมูลต้นทางถูกลบ
                            </Badge>
                          )}
                          {can?.edit && editable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy !== ""}
                              onClick={() =>
                                run(`rel-${r.id}`, () => removeKnRelation(article.id, r.id))
                              }
                              aria-label={`ลบความเชื่อมโยง ${r.entity_label ?? r.entity_id}`}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <FileText size={13} aria-hidden="true" /> เอกสารควบคุม ({article.documents.length})
                </h3>
                {article.documents.length === 0 ? (
                  <Hint>ยังไม่ได้อ้างอิงเอกสารควบคุมฉบับใด</Hint>
                ) : (
                  <ul className="space-y-1.5">
                    {article.documents.map((d) => (
                      <li
                        key={d.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/documents/${d.document_id}`}
                            className="text-sm font-medium hover:underline"
                          >
                            {d.document_title ?? `เอกสาร #${d.document_id}`}
                          </Link>
                          <p className="font-mono text-xs text-muted-foreground">
                            {d.doc_no} · {knDocLinkLabel(d.link_type)}
                            {d.written_revision_no ? ` · อ้าง rev ${d.written_revision_no}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {Boolean(d.is_stale) && (
                            <Badge variant="danger">
                              ฉบับล้าสมัย
                            </Badge>
                          )}
                          {can?.edit && editable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy !== ""}
                              onClick={() => run(`doc-${d.id}`, () => removeKnDocumentRef(article.id, d.id))}
                              aria-label={`ลบการอ้างอิงเอกสาร ${d.doc_no}`}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {can?.edit && editable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    disabled={busy !== ""}
                    onClick={() =>
                      run("stale", async () => {
                        const r = await checkKnDocumentStale(article.id);
                        setNotice(
                          `ตรวจการอ้างอิงเอกสาร ${r.checked} รายการ — พบฉบับล้าสมัย ${r.flagged.length} รายการ`,
                        );
                      })
                    }
                  >
                    <RefreshCw size={14} aria-hidden="true" /> ตรวจฉบับล้าสมัย
                  </Button>
                )}
              </div>

              {can?.edit && editable && (
                <Hint>
                  การเพิ่มความเชื่อมโยงทำได้จากหน้าเอกสารควบคุม (Phase 32) หรือผ่าน API
                  knowledge.php — หน้านี้เน้นการอ่านเป็นหลัก
                </Hint>
              )}
            </CardContent>
          </Card>
        </div>

        {/* แถบข้าง */}
        <div className="space-y-4">
          {/* feedback */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">บทความนี้ช่วยได้ไหม?</CardTitle>
              <CardDescription>คำตอบของคุณใช้จัดลำดับงานทบทวน</CardDescription>
            </CardHeader>
            <CardContent>
              {feedbackState ? (
                <Alert
                  variant="success"
                  title="ขอบคุณ"
                  description={`บันทึก "${knHelpfulnessLabel(feedbackState)}" แล้ว`}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy !== ""}
                    onClick={() => submitFeedback("helpful")}
                  >
                    <ThumbsUp size={14} aria-hidden="true" /> {KN_HELPFULNESS_LABELS.helpful}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy !== ""}
                    onClick={() => submitFeedback("not_helpful")}
                  >
                    <ThumbsDown size={14} aria-hidden="true" /> {KN_HELPFULNESS_LABELS.not_helpful}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy !== ""}
                    onClick={() => submitFeedback("no_answer")}
                  >
                    <CircleHelp size={14} aria-hidden="true" /> {KN_HELPFULNESS_LABELS.no_answer}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ข้อมูลบทความ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ข้อมูลบทความ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <Row label="หมวดหมู่" value={article.category_name_th ?? article.category_code ?? "—"} />
              <Row label="แท็ก" value={article.tags.length ? article.tags.join(", ") : "—"} />
              <Row
                label="ใช้เวลาประมาณ"
                value={
                  article.estimated_minutes === null ? (
                    <span className="text-muted-foreground">ยังไม่ได้วัด</span>
                  ) : (
                    `${article.estimated_minutes} นาที`
                  )
                }
              />
              <Row
                label="ทบทวนถัดไป"
                value={
                  article.next_review_date ? (
                    <span className={cn(days !== null && days < 0 && "text-[var(--cmms-danger)]")}>
                      {fmtKnDate(article.next_review_date)}
                      {days !== null && (days < 0 ? ` (เกิน ${Math.abs(days)} วัน)` : ` (อีก ${days} วัน)`)}
                    </span>
                  ) : (
                    "—"
                  )
                }
              />
              {article.published_at && <Row label="เผยแพร่เมื่อ" value={fmtKnDateTime(article.published_at)} />}
              {article.updated_at && <Row label="แก้ไขล่าสุด" value={fmtKnDateTime(article.updated_at)} />}
            </CardContent>
          </Card>

          {/* สถิติการใช้งานจริง */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">การใช้งานจริง</CardTitle>
              <CardDescription>
                {usage?.has_usage_data
                  ? `นับจากเหตุการณ์ในระบบ ${usage.total_events} ครั้ง`
                  : "ยังไม่มีเหตุการณ์การใช้งาน — สถิติจะไม่แสดงตัวเลขปลอม"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {usage?.has_usage_data ? (
                <>
                  <Row label="การเข้าถึง (ไม่รวมคะแนน)" value={<b className="tabular-nums">{usage.views}</b>} />
                  <Row
                    label="คำตอบว่าช่วยได้/ไม่ช่วย"
                    value={<b className="tabular-nums">{usage.answers}</b>}
                  />
                  {Object.entries(usage.by_action).length > 0 && (
                    <div className="pt-1">
                      <p className="text-xs font-semibold text-muted-foreground">แยกตามการกระทำ</p>
                      <ul className="mt-1 space-y-0.5">
                        {Object.entries(usage.by_action).map(([a, c]) => (
                          <li key={a} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{knUsageActionLabel(a)}</span>
                            <span className="tabular-nums">{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {usage.last_used_at && (
                    <Row label="ใช้ล่าสุด" value={fmtKnDateTime(usage.last_used_at)} />
                  )}
                </>
              ) : (
                <Hint>ยังไม่มีข้อมูลการใช้งานสำหรับบทความนี้</Hint>
              )}
            </CardContent>
          </Card>

          {/* ประวัติฉบับ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ประวัติฉบับ ({article.versions.length})</CardTitle>
              <CardDescription>ฉบับที่เผยแพร่แล้วแก้ไขไม่ได้</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {article.versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <Link href={`/knowledge/articles/${v.id}`} className="font-medium hover:underline">
                        v{v.version_no}
                      </Link>
                      {v.status === article.status && v.id === article.id && (
                        <span className="ml-1.5 text-xs text-muted-foreground">(กำลังดู)</span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className={cn("cmms-status", lampTone(KN_STATUS_TONE[v.status]))}>
                        <span className="cmms-status-dot" />
                        {knStatusLabel(v.status)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* ประวัติการทบทวน */}
          {article.reviews && article.reviews.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-base">
                  <History size={15} aria-hidden="true" /> ประวัติการทบทวน ({article.reviews.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {article.reviews.map((r) => (
                    <li key={r.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">รอบที่ {r.round_no}</span>
                        <span className={cn("cmms-status", lampTone(KN_STATUS_TONE[r.status] ? KN_STATUS_TONE[r.status] : undefined))}>
                          <span className="cmms-status-dot" />
                          {knStatusLabel(r.status)}
                        </span>
                      </div>
                      {r.due_date && <p className="mt-0.5 text-muted-foreground">ครบกำหนด {fmtKnDate(r.due_date)}</p>}
                      {r.findings && <p className="mt-1">ผลตรวจ: {r.findings}</p>}
                      {r.recommendations && <p className="mt-0.5 text-muted-foreground">ข้อเสนอ: {r.recommendations}</p>}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* เก็บถาวร */}
          {(article.status === "superseded" || can?.publish) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">เก็บถาวร</CardTitle>
                <CardDescription>ใช้เมื่อบทความไม่จำเป็นต้องใช้ในหน้างานอีกต่อไป</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {article.status !== "archived" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy !== ""}
                    onClick={() =>
                      run("archive", async () => {
                        if (!reason.trim()) throw new Error("กรุณาระบุเหตุผลก่อนเก็บถาวร");
                        await archiveKnArticle(article.id, reason.trim());
                        setReason("");
                        setNotice("เก็บถาวรแล้ว");
                      })
                    }
                  >
                    <Archive size={14} aria-hidden="true" /> เก็บถาวร
                  </Button>
                )}
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="เหตุผล (จำเป็น)"
                  aria-label="เหตุผลการเก็บถาวร"
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal: อนุมัติ */}
      {approving && (
        <Modal title="อนุมัติบทความ" onClose={() => setApproving(false)}>
          <div className="space-y-3">
            <Label htmlFor="ap-findings">ผลการตรวจสอบ</Label>
            <Textarea
              id="ap-findings"
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              rows={4}
              placeholder="ยืนยันว่าตรวจสอบแล้วว่าขั้นตอนถูกต้องและปลอดภัย"
            />
            <Hint>ผู้เขียนบทความตัวเองอนุมัติไม่ได้ ระบบจะปฏิเสธให้อัตโนมัติ</Hint>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setApproving(false)}>
                ยกเลิก
              </Button>
              <Button
                disabled={busy !== "" || findings.trim().length === 0}
                onClick={() =>
                  run("approve", async () => {
                    await approveKnArticle(article.id, findings.trim());
                    setApproving(false);
                    setFindings("");
                    setNotice("อนุมัติแล้ว — พร้อมเผยแพร่");
                  })
                }
              >
                <CheckCircle2 size={15} aria-hidden="true" /> ยืนยันการอนุมัติ
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: ส่งแก้ */}
      {rejecting && (
        <Modal title="ส่งกลับไปแก้ไข" onClose={() => setRejecting(false)}>
          <div className="space-y-3">
            <Label htmlFor="rj-reason">เหตุผลที่ต้องแก้ไข</Label>
            <Textarea
              id="rj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="ระบุให้ชัดว่าต้องแก้ส่วนไหน"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRejecting(false)}>
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                disabled={busy !== "" || reason.trim().length === 0}
                onClick={() =>
                  run("sendback", async () => {
                    await sendBackKnArticle(article.id, reason.trim());
                    setRejecting(false);
                    setReason("");
                    setNotice("ส่งกลับเป็นฉบับร่างแล้ว");
                  })
                }
              >
                <Undo2 size={15} aria-hidden="true" /> ส่งกลับ
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <h2 className="mb-3 text-base font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}