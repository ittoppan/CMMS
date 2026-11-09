"use client";

/**
 * app/(dashboard)/knowledge/gaps/[id]/page.tsx — รายละเอียดช่องว่างความรู้ (Phase 38)
 *
 * หน้านี้ต้องพิสูจน์ให้เห็นว่าช่องว่างเกิดจากอะไรจริง ๆ — จึงแสดงบรรทัดค้นหาเป็นหลักฐาน
 * ทุก action ผูกกับช่องว่างรายการนี้เท่านั้น และบังคับเหตุผล/หมายเหตุเมื่อปิด
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  RefreshCw,
  ClipboardList,
  CheckCircle2,
  XCircle,
  Search,
  Play,
  BookMarked,
} from "lucide-react";
import {
  fetchKnGap,
  fetchKnConfig,
  knGapAction,
  knGapStatusLabel,
  knGapPriorityLabel,
  KN_GAP_PRIORITY_LABELS,
  KN_GAP_STATUS_TONE,
  KN_GAP_PRIORITY_TONE,
  fmtKnDateTime,
  type KnGapDetail,
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

export default function KnowledgeGapDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const hero = usePageHero("knowledge/gaps/[id]");

  const [detail, setDetail] = useState<KnGapDetail | null>(null);
  const [cfg, setCfg] = useState<KnConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [priority, setPriority] = useState("");
  const [priorityReason, setPriorityReason] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [resolvedArticleId, setResolvedArticleId] = useState("");
  const [closeNote, setCloseNote] = useState("");

  const gap = detail?.gap;
  const can = cfg?.can;

  const load = useCallback(async () => {
    setError("");
    try {
      const [d, c] = await Promise.all([fetchKnGap(Number(id)), fetchKnConfig()]);
      setDetail(d);
      setCfg(c);
      setPriority(d.gap.priority);
    } catch (e: any) {
      setError(e?.message || "โหลดช่องว่างความรู้ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (name: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      setNotice(ok);
    } catch (e: any) {
      setError(e?.message || "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!gap) {
    return (
      <div className="space-y-4">
        <Alert variant="danger" title="ไม่พบช่องว่างความรู้" description={error} />
        <Link href="/knowledge/gaps" className={buttonVariants({ variant: "secondary" })}>
          <ArrowLeft size={15} aria-hidden="true" /> กลับไปรายการ
        </Link>
      </div>
    );
  }

  const open = gap.status === "open" || gap.status === "triaged" || gap.status === "in_progress";

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="ทำรายการไม่สำเร็จ" description={error} />}
      {notice && <Alert variant="success" title="สำเร็จ" description={notice} />}

      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>
            {gap.search_term}
          </h1>
          <p className="mt-1 font-mono text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
            พบ {gap.occurrences} ครั้ง · ล่าสุด {fmtKnDateTime(gap.last_seen_at)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={cn("cmms-status", lampTone(KN_GAP_STATUS_TONE[gap.status]))}>
              <span className="cmms-status-dot" />
              {knGapStatusLabel(gap.status)}
            </span>
            <span className={cn("cmms-status", lampTone(KN_GAP_PRIORITY_TONE[gap.priority]))}>
              <span className="cmms-status-dot" />
              {knGapPriorityLabel(gap.priority)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={load} disabled={busy !== ""}>
            <RefreshCw size={15} aria-hidden="true" /> รีเฟรช
          </Button>
          <Button variant="ghost" onClick={() => router.push("/knowledge/gaps")}>
            <ArrowLeft size={15} aria-hidden="true" /> รายการ
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* หลักฐาน */}
          <Card>
            <CardHeader>
              <CardTitle>หลักฐาน — บรรทัดค้นหาจริง</CardTitle>
              <CardDescription>
                ทุกบรรทัดคือคำค้นที่บันทึกไว้จริง ({detail.evidence_searches.length} รายการ)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {detail.evidence_searches.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  ไม่มีบรรทัดหลักฐานในช่วงเวลาที่เก็บข้อมูล — ถ้าคาดว่าควรมี ให้ตรวจการตั้งค่า retention
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5">คำค้น</th>
                        <th className="px-4 py-2.5">ผลลัพธ์</th>
                        <th className="px-4 py-2.5">เครื่อง</th>
                        <th className="px-4 py-2.5">ผู้ค้น</th>
                        <th className="px-4 py-2.5">เวลา</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.evidence_searches.map((s) => (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="px-4 py-2.5 font-mono text-xs">{s.normalized_query}</td>
                          <td className="px-4 py-2.5 tabular-nums">{s.result_count}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {s.asset_id ? `#${s.asset_id}` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {s.user_id ? `#${s.user_id}` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {fmtKnDateTime(s.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ดำเนินการ */}
          {can?.manage_gaps && (
            <Card>
              <CardHeader>
                <CardTitle>ดำเนินการ</CardTitle>
                <CardDescription>ทุกขั้นตอนจะถูกบันทึกในประวัติการตรวจสอบ</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {open ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="prio">ลำดับความสำคัญ</Label>
                        <Select value={priority} onValueChange={setPriority}>
                          <SelectTrigger id="prio" aria-label="เลือกลำดับความสำคัญ">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(KN_GAP_PRIORITY_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>
                                {v}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="due">กำหนดเสร็จ</Label>
                        <Input
                          id="due"
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="preason">เหตุผลที่เลือกลำดับนี้</Label>
                      <Textarea
                        id="preason"
                        value={priorityReason}
                        onChange={(e) => setPriorityReason(e.target.value)}
                        rows={2}
                        placeholder="เช่น เกิดบ่อยและทำให้หยุดเครื่อง"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {gap.status === "open" && (
                        <Button
                          size="sm"
                          disabled={busy !== ""}
                          onClick={() =>
                            run("triage", () =>
                              knGapAction(gap.id, "triaged", {
                                priority: priority as never,
                                priority_reason: priorityReason || undefined,
                                due_date: dueDate || undefined,
                              }),
                            "คัดกรองช่องว่างความรู้แล้ว",
                          )}
                        >
                          <ClipboardList size={14} aria-hidden="true" /> คัดกรองแล้ว
                        </Button>
                      )}
                      {gap.status !== "in_progress" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy !== ""}
                          onClick={() =>
                            run("progress", () => knGapAction(gap.id, "in_progress"), "เปลี่ยนเป็นกำลังทำแล้ว")
                          }
                        >
                          <Play size={14} aria-hidden="true" /> เริ่มทำ
                        </Button>
                      )}
                      </div>

                    <div className="space-y-1.5 border-t pt-3">
                      <Label htmlFor="resolved">รหัสบทความที่ปิดช่องว่างนี้</Label>
                      <div className="flex gap-2">
                        <Input
                          id="resolved"
                          inputMode="numeric"
                          value={resolvedArticleId}
                          onChange={(e) => setResolvedArticleId(e.target.value.replace(/[^0-9]/g, ""))}
                          placeholder="เช่น 12 (ไม่บังคับ แต่ควรระบุ)"
                        />
                        <Button
                          variant="secondary"
                          disabled={busy !== ""}
                          onClick={() =>
                            run(
                              "resolve",
                              () =>
                                knGapAction(gap.id, "resolve", {
                                  resolved_article_id: resolvedArticleId ? Number(resolvedArticleId) : undefined,
                                }),
                              "ปิดช่องว่างความรู้แล้ว",
                            )
                          }
                        >
                          <CheckCircle2 size={14} aria-hidden="true" /> ปิดว่ามีบทความแล้ว
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5 border-t pt-3">
                      <Label htmlFor="close">ปิดเป็น “ไม่ต้องทำ” พร้อมเหตุผล</Label>
                      <Textarea
                        id="close"
                        value={closeNote}
                        onChange={(e) => setCloseNote(e.target.value)}
                        rows={2}
                        placeholder="เช่น เป็นเรื่องเฉพาะเครื่อง ไม่เป็นรูปแบบทั่วไป"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy !== "" || closeNote.trim().length === 0}
                        onClick={() =>
                          run(
                            "reject",
                            () => knGapAction(gap.id, "reject", { close_note: closeNote.trim() }),
                            "ปิดช่องว่างความรู้โดยไม่ต้องเขียน",
                          )
                        }
                      >
                        <XCircle size={14} aria-hidden="true" /> ไม่ต้องเขียนความรู้
                      </Button>
                    </div>
                  </>
                ) : (
                  <Alert
                    variant="success"
                    title={`ช่องว่างนี้ปิดแล้ว (${knGapStatusLabel(gap.status)})`}
                    description={
                      gap.resolved_article_id
                        ? "เชื่อมกับบทความที่ปิดช่องว่างนี้แล้ว"
                        : gap.close_note || "ไม่ได้สร้างบทความจากช่องว่างนี้"
                    }
                  />
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* สรุป */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">สรุป</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <Row label="คำค้น (normalized)" value={<span className="font-mono text-xs">{gap.normalized_term}</span>} />
              <Row label="พบครั้ง" value={<b className="tabular-nums">{gap.occurrences}</b>} />
              <Row label="ครั้งแรก" value={fmtKnDateTime(gap.first_seen_at)} />
              <Row label="ล่าสุด" value={fmtKnDateTime(gap.last_seen_at)} />
              <Row label="เครื่อง" value={gap.asset_id ? `#${gap.asset_id}` : "—"} />
              <Row label="กำหนดเสร็จ" value={gap.due_date ?? "—"} />
              {gap.triaged_at && <Row label="คัดกรองเมื่อ" value={fmtKnDateTime(gap.triaged_at)} />}
              {gap.resolved_at && <Row label="ปิดเมื่อ" value={fmtKnDateTime(gap.resolved_at)} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">ทำอะไรต่อ</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Link
                href={`/knowledge/search?q=${encodeURIComponent(gap.search_term)}`}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
              >
                <Search size={15} className="text-muted-foreground" aria-hidden="true" />
                ค้นคำนี้อีกครั้ง
              </Link>
              <Link
                href={`/knowledge/articles/create?gap_id=${gap.id}`}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
              >
                <BookMarked size={15} className="text-muted-foreground" aria-hidden="true" />
                เขียนบทความจากช่องว่างนี้
              </Link>
              {gap.resolved_article_id && (
                <Link
                  href={`/knowledge/articles/${gap.resolved_article_id}`}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
                >
                  <BookMarked size={15} className="text-muted-foreground" aria-hidden="true" />
                  บทความที่ปิดช่องว่างนี้
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
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