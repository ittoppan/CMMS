"use client";

/**
 * app/(dashboard)/knowledge/taxonomy/page.tsx — หมวดหมู่ & แท็กความรู้ (Phase 38)
 *
 * หมวดหมู่มีผลต่อรหัสบทความ (KN-…) และการจัดกลุ่มในรายงาน ส่วนแท็กมีผลต่อการค้นหา
 * หน้านี้จึงเป็นหน้าตั้งค่าที่มีผลจริงต่อการทำงานของช่าง
 * การปิดใช้งาน (is_active=0) ไม่ลบข้อมูลเดิม เพื่อให้บทความเก่ายังอธิบายได้
 */
import { useCallback, useEffect, useState } from "react";
import { usePageHero } from "@/lib/i18n";
import { usePageLayout } from "@/lib/pageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, RefreshCw, ListChecks, Hash, AlertTriangle } from "lucide-react";
import {
  fetchKnCategories,
  fetchKnTags,
  fetchKnConfig,
  saveKnCategory,
  saveKnTag,
  type KnCategory,
  type KnTag,
  type KnConfigResponse,
} from "@/lib/knowledge";

export default function KnowledgeTaxonomyPage() {
  const hero = usePageHero("knowledge/taxonomy");
  const layout = usePageLayout("/knowledge/taxonomy", ["hero", "content"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  const [cfg, setCfg] = useState<KnConfigResponse | null>(null);
  const [cats, setCats] = useState<KnCategory[]>([]);
  const [tags, setTags] = useState<KnTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [catId, setCatId] = useState<number | null>(null);
  const [catCode, setCatCode] = useState("");
  const [catTh, setCatTh] = useState("");
  const [catEn, setCatEn] = useState("");
  const [catParent, setCatParent] = useState("none");
  const [catSort, setCatSort] = useState("0");
  const [catDesc, setCatDesc] = useState("");
  const [catActive, setCatActive] = useState(true);

  const [tagId, setTagId] = useState<number | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagLabel, setTagLabel] = useState("");
  const [tagActive, setTagActive] = useState(true);

  const can = cfg?.can;

  const load = useCallback(async () => {
    setError("");
    try {
      const [c, ca, t] = await Promise.all([
        fetchKnConfig(),
        fetchKnCategories(true),
        fetchKnTags(true),
      ]);
      setCfg(c);
      setCats(ca.categories || []);
      setTags(t.tags || []);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลหมวดหมู่ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetCat = () => {
    setCatId(null);
    setCatCode("");
    setCatTh("");
    setCatEn("");
    setCatParent("none");
    setCatSort("0");
    setCatDesc("");
    setCatActive(true);
  };

  const resetTag = () => {
    setTagId(null);
    setTagName("");
    setTagLabel("");
    setTagActive(true);
  };

  const editCat = (c: KnCategory) => {
    setCatId(c.id);
    setCatCode(c.code);
    setCatTh(c.name_th);
    setCatEn(c.name_en || "");
    setCatParent(c.parent_id ? String(c.parent_id) : "none");
    setCatSort(String(c.sort_order ?? 0));
    setCatDesc(c.description || "");
    setCatActive(Boolean(c.is_active));
  };

  const editTag = (t: KnTag) => {
    setTagId(t.id);
    setTagName(t.tag);
    setTagLabel(t.label_th || "");
    setTagActive(Boolean(t.is_active));
  };

  const saveCategory = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await saveKnCategory({
        id: catId ?? undefined,
        code: catCode.trim(),
        name_th: catTh.trim(),
        name_en: catEn.trim(),
        parent_id: catParent === "none" ? null : Number(catParent),
        sort_order: Number(catSort) || 0,
        description: catDesc.trim() || null,
        is_active: catActive ? 1 : 0,
      });
      setNotice(`บันทึกหมวดหมู่ ${r.code} แล้ว`);
      resetCat();
      await load();
    } catch (e: any) {
      setError(e?.message || "บันทึกหมวดหมู่ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const saveTag = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await saveKnTag({
        id: tagId ?? undefined,
        tag: tagName.trim(),
        label_th: tagLabel.trim() || null,
        is_active: tagActive ? 1 : 0,
      });
      setNotice(`บันทึกแท็ก ${r.tag} แล้ว`);
      resetTag();
      await load();
    } catch (e: any) {
      setError(e?.message || "บันทึกแท็กไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

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
      {error && <Alert variant="danger" title="ทำรายการไม่สำเร็จ" description={error} />}
      {notice && <Alert variant="success" title="สำเร็จ" description={notice} />}
      {!can?.taxonomy && (
        <Alert
          variant="warning" title="คุณมีสิทธิ์ดูอย่างเดียว"
          description="การเพิ่ม/แก้ไขหมวดหมู่และแท็กต้องมีสิทธิ์ knowledge.taxonomy"
        />
      )}

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
        <Button variant="secondary" onClick={load}>
          <RefreshCw size={15} aria-hidden="true" /> รีเฟรช
        </Button>
      </div>

      {cfg && !cfg.config.enabled && (
        <Alert
          variant="warning" title="ศูนย์ความรู้ถูกปิดใช้งานอยู่"
          description="เปิดใช้งานที่หน้าตั้งค่าระบบก่อนบทความใหม่จะค้นหาเจอ"
        />
      )}

      <div style={layoutStyle("content")}>
        <Tabs defaultValue="categories">
          <TabsList>
            <TabsTrigger value="categories">
              <ListChecks size={14} aria-hidden="true" /> หมวดหมู่ ({cats.length})
            </TabsTrigger>
            <TabsTrigger value="tags">
              <Hash size={14} aria-hidden="true" /> แท็ก ({tags.length})
            </TabsTrigger>
          </TabsList>

          {/* หมวดหมู่ */}
          <TabsContent value="categories" className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>หมวดหมู่ทั้งหมด</CardTitle>
                <CardDescription>
                  รหัสหมวดหมู่ถูกใช้สร้างรหัสบทความ — เปลี่ยนรหัสเดิมแล้วบทความเก่าจะอ้างรหัสผิด
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {cats.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      title="ยังไม่มีหมวดหมู่"
                      description="สร้างหมวดหมู่แรก เช่น ตามระบบหรือตามประเภทอาการ"
                      icon={<ListChecks size={40} />}
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <th className="px-4 py-2.5">รหัส</th>
                          <th className="px-4 py-2.5">ชื่อ</th>
                          <th className="px-4 py-2.5">บทความ</th>
                          <th className="px-4 py-2.5">สถานะ</th>
                          <th className="px-4 py-2.5 text-right">แก้ไข</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cats.map((c) => (
                          <tr key={c.id} className="border-b last:border-0">
                            <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{c.name_th}</p>
                              {c.name_en && <p className="text-xs text-muted-foreground">{c.name_en}</p>}
                            </td>
                            <td className="px-4 py-3 tabular-nums">{c.article_count ?? 0}</td>
                            <td className="px-4 py-3">
                              {Boolean(c.is_active) ? (
                                <span className="cmms-status ok">
                                  <span className="cmms-status-dot" />
                                  ใช้งาน
                                </span>
                              ) : (
                                <span className="cmms-status idle">
                                  <span className="cmms-status-dot" />
                                  ปิด
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={!can?.taxonomy}
                                onClick={() => editCat(c)}
                              >
                                แก้ไข
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{catId ? "แก้ไขหมวดหมู่" : "เพิ่มหมวดหมู่"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="c-code">รหัส (ตัวพิมพ์ใหญ่/ตัวเลข) *</Label>
                  <Input
                    id="c-code"
                    value={catCode}
                    onChange={(e) => setCatCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
                    placeholder="เช่น PUMP"
                    disabled={catId !== null}
                    className="font-mono"
                  />
                  {catId !== null && (
                    <p className="text-xs text-muted-foreground">
                      <AlertTriangle size={11} className="inline" aria-hidden="true" /> รหัสเดิมลบไม่ได้
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-th">ชื่อภาษาไทย *</Label>
                  <Input id="c-th" value={catTh} onChange={(e) => setCatTh(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-en">ชื่อภาษาอังกฤษ</Label>
                  <Input id="c-en" value={catEn} onChange={(e) => setCatEn(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-parent">หมวดหมู่หลัก</Label>
                  <Select value={catParent} onValueChange={setCatParent}>
                    <SelectTrigger id="c-parent" aria-label="เลือกหมวดหมู่หลัก">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">ไม่มีหมวดหมู่หลัก</SelectItem>
                      {cats
                        .filter((c) => c.id !== catId)
                        .map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name_th}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="c-sort">ลำดับ</Label>
                    <Input
                      id="c-sort"
                      inputMode="numeric"
                      value={catSort}
                      onChange={(e) => setCatSort(e.target.value.replace(/[^0-9]/g, ""))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="c-active">สถานะ</Label>
                    <Select value={catActive ? "1" : "0"} onValueChange={(v) => setCatActive(v === "1")}>
                      <SelectTrigger id="c-active" aria-label="สถานะหมวดหมู่">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">ใช้งาน</SelectItem>
                        <SelectItem value="0">ปิดใช้งาน</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-desc">คำอธิบาย</Label>
                  <Textarea id="c-desc" value={catDesc} onChange={(e) => setCatDesc(e.target.value)} rows={2} />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={saveCategory}
                    disabled={busy || !can?.taxonomy || !catCode.trim() || !catTh.trim()}
                  >
                    <Save size={15} aria-hidden="true" /> บันทึก
                  </Button>
                  {catId !== null && (
                    <Button variant="ghost" onClick={resetCat}>
                      ยกเลิก
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  ปิดใช้งานหมวดหมู่จะไม่ลบบทความเดิม — บทความที่ใช้หมวดหมู่นี้ยังอ่านได้ตามปกติ
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* แท็ก */}
          <TabsContent value="tags" className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>แท็กทั้งหมด</CardTitle>
                <CardDescription>แท็กถูกใช้ค้นหาแบบ “ตรงกับแท็กใดแท็กหนึ่ง” เพื่อให้คำค้นภาษาช่างเจอผล</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {tags.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      title="ยังไม่มีแท็ก"
                      description="เพิ่มคำที่ช่างใช้จริง เช่น เสียงดัง เป็นก้น น้ำรั่ว"
                      icon={<Hash size={40} />}
                    />
                  </div>
                ) : (
                  <ul className="divide-y">
                    {tags.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{t.label_th || t.tag}</p>
                          <p className="font-mono text-xs text-muted-foreground">{t.tag}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {t.article_count ?? 0} บทความ
                          </span>
                          {!Boolean(t.is_active) && (
                            <Badge variant="neutral">
                              ปิด
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!can?.taxonomy}
                            onClick={() => editTag(t)}
                          >
                            แก้ไข
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{tagId ? "แก้ไขแท็ก" : "เพิ่มแท็ก"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="t-name">คำแท็ก (ภาษาอังกฤษ/ตัวพิมพ์เล็ก) *</Label>
                  <Input
                    id="t-name"
                    value={tagName}
                    onChange={(e) => setTagName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                    placeholder="เช่น vibration"
                    disabled={tagId !== null}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-label">คำแสดงผล (ภาษาไทย)</Label>
                  <Input id="t-label" value={tagLabel} onChange={(e) => setTagLabel(e.target.value)} placeholder="เช่น การสั่นสะเทือน" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-active">สถานะ</Label>
                  <Select value={tagActive ? "1" : "0"} onValueChange={(v) => setTagActive(v === "1")}>
                    <SelectTrigger id="t-active" aria-label="สถานะแท็ก">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">ใช้งาน</SelectItem>
                      <SelectItem value="0">ปิดใช้งาน</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveTag} disabled={busy || !can?.taxonomy || !tagName.trim()}>
                    <Save size={15} aria-hidden="true" /> บันทึก
                  </Button>
                  {tagId !== null && (
                    <Button variant="ghost" onClick={resetTag}>
                      ยกเลิก
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  ชื่อแท็กต้องไม่ซ้ำ — ระบบจะบอกถ้าซ้ำ
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}