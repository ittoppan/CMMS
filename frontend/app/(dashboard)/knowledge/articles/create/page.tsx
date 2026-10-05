"use client";

/**
 * app/(dashboard)/knowledge/articles/create/page.tsx — เขียนบทความความรู้ใหม่ (Phase 38)
 *
 * ฟอร์มนี้เขียนครั้งเดียวแล้วจบ: server จะสร้าง article_key ให้เองจากหมวดหมู่
 * การแก้ไขหลังสร้างต้องไปที่หน้า detail (ตามกฎ immutable ของ Phase 38)
 * ผู้ใช้ต้องลากอย่างน้อย 1 ความสัมพันธ์หรืออ้างอิงเอกสาร เพื่อให้ทบทวนได้
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Save, ArrowLeft, GraduationCap, ShieldAlert, Info } from "lucide-react";
import {
  fetchKnCategories,
  fetchKnTags,
  fetchKnConfig,
  createKnArticle,
  KN_CONFIDENTIALITY_LABELS,
  type KnCategory,
  type KnTag,
  type KnConfigResponse,
} from "@/lib/knowledge";

export default function KnowledgeArticleCreatePage() {
  const hero = usePageHero("knowledge/articles/create");
  const router = useRouter();

  const [cfg, setCfg] = useState<KnConfigResponse | null>(null);
  const [cats, setCats] = useState<KnCategory[]>([]);
  const [tags, setTags] = useState<KnTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [resolution, setResolution] = useState("");
  const [prevention, setPrevention] = useState("");
  const [safetyNotes, setSafetyNotes] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [requiresIsolation, setRequiresIsolation] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [confidentiality, setConfidentiality] = useState("internal");
  const [reviewCycle, setReviewCycle] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([fetchKnConfig(), fetchKnCategories(), fetchKnTags()])
      .then(([c, cat, tg]) => {
        setCfg(c);
        setCats(cat.categories || []);
        setTags(tg.tags || []);
        if (cat.categories?.[0]) setCategoryId(String(cat.categories[0].id));
      })
      .catch((e: any) => setError(e?.message || "โหลดข้อมูลตั้งต้นไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const submit = useCallback(async () => {
    setFormError("");
    if (title.trim().length < 5) {
      setFormError("ชื่อบทความต้องยาวอย่างน้อย 5 ตัวอักษร");
      return;
    }
    if (!resolution.trim()) {
      setFormError("ต้องระบุวิธีแก้ปัญหา (resolution) เพราะเป็นสิ่งที่ช่างจะทำตาม");
      return;
    }
    if (!categoryId) {
      setFormError("เลือกหมวดหมู่ของบทความ");
      return;
    }

    setSaving(true);
    try {
      const res = await createKnArticle({
        title: title.trim(),
        summary: summary.trim() || null,
        symptoms: symptoms.trim() || null,
        diagnosis: diagnosis.trim() || null,
        root_cause: rootCause.trim() || null,
        resolution: resolution.trim(),
        prevention: prevention.trim() || null,
        safety_notes: safetyNotes.trim() || null,
        // ค่าว่าง = ไม่ทราบ ต้องปล่อยเป็น null ห้ามใส่ 0
        estimated_minutes: estimatedMinutes.trim() === "" ? null : Number(estimatedMinutes),
        requires_isolation: requiresIsolation ? 1 : 0,
        category_id: Number(categoryId),
        confidentiality,
        review_cycle_days: reviewCycle.trim() === "" ? null : Number(reviewCycle),
        tags: selectedTags,
      });
      router.push(`/knowledge/articles/${res.id}`);
    } catch (e: any) {
      setFormError(e?.message || "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }, [
    title,
    summary,
    symptoms,
    diagnosis,
    rootCause,
    resolution,
    prevention,
    safetyNotes,
    estimatedMinutes,
    requiresIsolation,
    categoryId,
    confidentiality,
    reviewCycle,
    selectedTags,
    router,
  ]);

  const can = cfg?.can;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="โหลดข้อมูลตั้งต้นไม่สำเร็จ" description={error} />}
      {formError && <Alert variant="danger" title="บันทึกไม่สำเร็จ" description={formError} />}
      {!can?.create && (
        <Alert
          variant="warning"
          title="คุณไม่มีสิทธิ์เขียนบทความ"
          description="หน้านี้สำหรับผู้ที่ได้รับสิทธิ์ knowledge.create เท่านั้น"
        />
      )}

      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>
              {hero.title}
            </h1>
            <Badge variant="primary" dot>
              <GraduationCap size={13} aria-hidden="true" /> Draft
            </Badge>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
            {hero.desc}
          </p>
        </div>
        <Link href="/knowledge/articles" className={buttonVariants({ variant: "secondary" })}>
          <ArrowLeft size={15} aria-hidden="true" /> กลับไปทะเบียน
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* เนื้อหาหลัก */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>สิ่งที่ต้องรู้</CardTitle>
              <CardDescription>
                เขียนด้วยภาษาที่ช่างคนอื่นจะเข้าใจ และเขียนจากงานที่เคยเจอจริง
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="title">ชื่อบทความ *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น เปลี่ยนพื้นเสียงมอเตอร์เป่าลมไม่ได้"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="summary">สรุปสั้น ๆ</Label>
                <Textarea
                  id="summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={2}
                  placeholder="หนึ่งประโยค บอกว่าเรื่องนี้คืออะไร"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="symptoms">อาการที่พบ</Label>
                <Textarea
                  id="symptoms"
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  rows={3}
                  placeholder="ผู้ใช้จะเจออาการแบบไหน เห็นหรือได้กลิ่นอะไร"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="diagnosis">การวินิจฉัย</Label>
                <Textarea
                  id="diagnosis"
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  rows={3}
                  placeholder="ตรวจอะไรไปแล้ว ได้ผลอย่างไร"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="root_cause">สาเหตุราก</Label>
                <Textarea
                  id="root_cause"
                  value={rootCause}
                  onChange={(e) => setRootCause(e.target.value)}
                  rows={3}
                  placeholder="ทำไมถึงเกิดขึ้นได้"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="resolution">วิธีแก้ปัญหา *</Label>
                <Textarea
                  id="resolution"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={5}
                  placeholder="ไล่ตามลำดับที่ช่างต้องทำจริง"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prevention">การป้องกันไม่ให้เกิดซ้ำ</Label>
                <Textarea
                  id="prevention"
                  value={prevention}
                  onChange={(e) => setPrevention(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="safety" className="flex items-center gap-1.5">
                  <ShieldAlert size={14} aria-hidden="true" /> ข้อควรระวังด้านความปลอดภัย
                </Label>
                <Textarea
                  id="safety"
                  value={safetyNotes}
                  onChange={(e) => setSafetyNotes(e.target.value)}
                  rows={3}
                  placeholder="ต้องล็อกเครื่อง/ตัดไฟ หรือใช้อุปกรณ์ป้องกันอะไร"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>แท็กความรู้</CardTitle>
              <CardDescription>ใช้ค้นหาและจัดกลุ่ม — เลือกได้หลายรายการ</CardDescription>
            </CardHeader>
            <CardContent>
              {tags.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีแท็กในระบบ ผู้ดูแลสามารถเพิ่มได้ที่หน้าหมวดหมู่ & แท็ก</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tags.map((t) => {
                    const on = selectedTags.includes(t.tag);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTag(t.tag)}
                        aria-pressed={on}
                        className={
                          on
                            ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                            : "rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
                        }
                      >
                        {t.label_th || t.tag}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ตัวเลือกข้าง */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>การจัดหมวด</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="category">หมวดหมู่ *</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="category" aria-label="เลือกหมวดหมู่">
                    <SelectValue placeholder="เลือกหมวดหมู่" />
                  </SelectTrigger>
                  <SelectContent>
                    {cats.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name_th}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">หมวดหมู่กำหนดรหัสบทความ (KN-…)</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="conf">ระดับการเข้าถึง</Label>
                <Select value={confidentiality} onValueChange={setConfidentiality}>
                  <SelectTrigger id="conf" aria-label="เลือกระดับการเข้าถึง">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(KN_CONFIDENTIALITY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {confidentiality !== "internal" && (
                  <p className="text-xs text-[var(--cmms-warning)]">
                    ผู้ใช้ที่ไม่มีสิทธิ์จะไม่เห็นบทความนี้ในผลการค้นหา
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ระยะเวลา & ความปลอดภัย</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="mins">ใช้เวลาประมาณ (นาที)</Label>
                <Input
                  id="mins"
                  inputMode="numeric"
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="ไม่ทราบ"
                />
                <p className="text-xs text-muted-foreground">
                  เว้นว่างไว้ถ้ายังไม่ได้วัดจริง — ระบบจะแสดงว่า “ยังไม่ได้วัด” ไม่ใช่ 0
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="isolation"
                  checked={requiresIsolation}
                  onCheckedChange={(v) => setRequiresIsolation(v === true)}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="isolation" className="flex items-center gap-1.5">
                    <ShieldAlert size={14} aria-hidden="true" /> ต้องล็อกเครื่อง/ตัดไฟก่อน
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    ถ้าเป็นงานที่ต้องปิดไฟ/แยกพลังงาน ติดฉลากเตือนจะแสดงในผลการค้นหา
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cycle">รอบการทบทวน (วัน)</Label>
                <Input
                  id="cycle"
                  inputMode="numeric"
                  value={reviewCycle}
                  onChange={(e) => setReviewCycle(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder={String(cfg?.config.review_default_days ?? 180)}
                />
                <p className="text-xs text-muted-foreground">
                  ระบบจะตั้งวันทบทวนถัดไปให้อัตโนมัติหลังเผยแพร่
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">ขั้นตอนถัดไป</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>บันทึกแล้วบทความจะอยู่ในสถานะ “ร่าง”</p>
              <p>ต้องส่งทบทวน → อนุมัติ → เผยแพร่ จึงจะค้นหาเจอ</p>
              <p className="flex items-start gap-1.5">
                <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                ผู้เขียนอนุมัติบทความตัวเองไม่ได้ (เพื่อให้มีคนตรวจงานจริง)
              </p>
            </CardContent>
          </Card>

          <Button
            className="w-full"
            disabled={saving || !can?.create}
            onClick={submit}
            size="lg"
          >
            <Save size={16} aria-hidden="true" />
            {saving ? "กำลังบันทึก…" : "บันทึกเป็นฉบับร่าง"}
          </Button>
        </div>
      </div>
    </div>
  );
}