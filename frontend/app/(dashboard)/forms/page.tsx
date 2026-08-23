"use client";

import { useState, useEffect, useMemo } from "react";
import { PageShell } from "@/components/PageShell";
import { Grid } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AnimatedDialog from "@/components/AnimatedDialog";
import {
  FileDown,
  FileText,
  RefreshCw,
  Upload,
  Plus,
  SquarePen,
  Trash2,
  Search,
} from "lucide-react";

interface FormItem {
  code: string;
  rev: string;
  title: string;
  filename: string;
  ext: string;
  size: number;
}

const extLabel: Record<string, string> = {
  xls: "Excel (.xls)",
  xlsx: "Excel (.xlsx)",
  xlsm: "Excel Macro",
  pdf: "PDF",
  docx: "Word",
  ods: "OpenOffice",
};

function formatSize(bytes: number): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FormsPage() {
  const [forms, setForms] = useState<FormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [extFilter, setExtFilter] = useState("all");

  // อัปโหลดแบบฟอร์มใหม่
  const [uploadOpen, setUploadOpen] = useState(false);
  const [upCode, setUpCode] = useState("");
  const [upRev, setUpRev] = useState("");
  const [upTitle, setUpTitle] = useState("");
  const [upFile, setUpFile] = useState<File | null>(null);
  const [upLoading, setUpLoading] = useState(false);
  const [upMsg, setUpMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // แบบฟอร์มดิจิทัล (ออกแบบด้วย formBuilder)
  const [digitals, setDigitals] = useState<
    { id: number; code: string; title: string; rev: string; description: string; updated_at: string; submission_count: number }[]
  >([]);
  const [digitalsLoading, setDigitalsLoading] = useState(true);
  const [canDesign, setCanDesign] = useState(false);

  const fetchDigitals = async () => {
    setDigitalsLoading(true);
    try {
      const res = await fetch("/api/v1/form_templates.php", { credentials: "include" });
      const json = await res.json();
      if (json.status === "success") {
        setDigitals(json.data || []);
        setCanDesign(!!json.can_design);
      }
    } catch (e) {
      console.error("Fetch digital forms error", e);
    } finally {
      setDigitalsLoading(false);
    }
  };

  const deleteDigital = async (id: number) => {
    if (!window.confirm("ลบแบบฟอร์มดิจิทัลนี้และผลการกรอกทั้งหมด?")) return;
    try {
      const res = await fetch(`/api/v1/form_templates.php?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (json.status === "success") fetchDigitals();
    } catch (e) {
      console.error("Delete digital form error", e);
    }
  };

  const fetchForms = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/forms.php");
      const json = await res.json();
      if (json.status === "success") {
        setForms(json.data || []);
      } else {
        setError(json.message || "ไม่สามารถโหลดรายการแบบฟอร์มได้");
      }
    } catch (e) {
      console.error("Fetch forms error", e);
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForms();
    fetchDigitals();
  }, []);

  const extOptions = useMemo(() => {
    const set = new Set<string>(forms.map((f) => f.ext));
    return [
      { value: "all", label: "ทุกไฟล์" },
      ...[...set].sort().map((e) => ({ value: e, label: extLabel[e] || e.toUpperCase() })),
    ];
  }, [forms]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forms.filter((f) => {
      const matchExt = extFilter === "all" || f.ext === extFilter;
      const matchSearch =
        !q ||
        f.title.toLowerCase().includes(q) ||
        f.code.toLowerCase().includes(q) ||
        f.filename.toLowerCase().includes(q) ||
        (f.rev && f.rev.toLowerCase().includes(q));
      return matchExt && matchSearch;
    });
  }, [forms, search, extFilter]);

  const download = (f: FormItem) => {
    window.open(`/api/v1/forms.php?download=${encodeURIComponent(f.filename)}`, "_blank");
  };

  // ชื่อไฟล์ที่จะถูกสร้างเมื่อระบุ code (ตัวอย่างให้เห็นก่อนกดอัปโหลด)
  const computedName = useMemo(() => {
    if (!upCode.trim()) return upFile ? upFile.name : "";
    const code = upCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const rev = upRev.trim()
      ? (/^REV\.\d{2}$/i.test(upRev.trim()) ? upRev.trim().toUpperCase() : `REV.${String(parseInt(upRev, 10) || 0).padStart(2, "0")}`)
      : "REV.00";
    const ext = upFile?.name.split(".").pop() || "xlsx";
    return upTitle.trim() ? `${code} ${rev} ${upTitle.trim()}.${ext}` : `${code} ${rev} .${ext}`;
  }, [upCode, upRev, upTitle, upFile]);

  const handleUpload = async () => {
    if (!upFile) {
      setUpMsg({ text: "กรุณาเลือกไฟล์แบบฟอร์มก่อน", isError: true });
      return;
    }
    setUpLoading(true);
    setUpMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", upFile);
      if (upCode.trim()) {
        fd.append("code", upCode.trim());
        fd.append("rev", upRev.trim() || "REV.00");
        fd.append("title", upTitle.trim());
      }
      const res = await fetch("/api/v1/forms.php", { method: "POST", body: fd });
      const json = await res.json();
      if (json.status === "success") {
        setUpMsg({ text: `✅ อัปโหลดสำเร็จ: ${json.file?.filename || upFile.name}`, isError: false });
        setUpCode(""); setUpRev(""); setUpTitle(""); setUpFile(null);
        fetchForms();
      } else {
        setUpMsg({ text: `❌ ${json.message || "อัปโหลดไม่สำเร็จ"}`, isError: true });
      }
    } catch (e) {
      console.error("Upload form error", e);
      setUpMsg({ text: "ไม่สามารถเชื่อมต่อระบบได้", isError: true });
    } finally {
      setUpLoading(false);
    }
  };

  return (
    <PageShell
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "อนุมัติ & เอกสาร", href: "/forms" },
        { label: "ศูนย์แบบฟอร์ม (Form Center)" },
      ]}
      title="ศูนย์แบบฟอร์ม (Form Center)"
      description="แบบฟอร์มมาตรฐานของฝ่ายวิศวกรรม (F-EN / F-SF) — ดาวน์โหลดเพื่อพิมพ์ใช้หน้างานได้ทันที"
      actions={
        <>
          <Button onClick={() => { setUpMsg(null); setUpFile(null); setUploadOpen(true); }}>
            <Upload className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            อัปโหลดแบบฟอร์ม
          </Button>
          <Button variant="secondary" onClick={fetchForms}>
            <RefreshCw className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            รีเฟรช
          </Button>
        </>
      }
    >
      {/* ═══ แบบฟอร์มดิจิทัล (formBuilder) ═══ */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle>แบบฟอร์มดิจิทัล (ออกแบบ + กรอก + PDF)</CardTitle>
            <CardDescription>
              สร้างแบบฟอร์มด้วยลาก-วาง ผูกข้อมูลจากฐานข้อมูล แล้วพิมพ์เป็น PDF — ตรง &quot;ออกแบบแบบฟอร์ม&quot;
            </CardDescription>
          </div>
          {canDesign && (
            <a href="/forms/designer" className={buttonVariants({ size: "sm" })}>
              <Plus className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              ออกแบบแบบฟอร์มใหม่
            </a>
          )}
        </CardHeader>
        <CardContent>
          {digitalsLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : digitals.length === 0 ? (
            <p className="py-5 text-sm text-muted-foreground">
              ยังไม่มีแบบฟอร์มดิจิทัล — กด &quot;ออกแบบแบบฟอร์มใหม่&quot; เพื่อสร้าง (เฉพาะผู้ดูแลระบบ)
            </p>
          ) : (
            <Grid columns={{ minWidth: 300, repeat: "fit" }} gap={4}>
              {digitals.map((d) => (
                <Card key={d.id} className="flex flex-col gap-3 p-4 shadow-none">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Badge variant="primary">{d.code}</Badge>
                    <Badge variant="success">{d.submission_count} ครั้ง</Badge>
                  </div>
                  <p className="flex-1 text-sm font-semibold leading-snug text-foreground">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.rev} · แก้ไขล่าสุด {d.updated_at ? d.updated_at.slice(0, 10) : "-"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a href={`/forms/run/${d.id}`} className={`${buttonVariants({ size: "sm" })} min-w-0 flex-1`}>
                      <FileText className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                      กรอกแบบฟอร์ม
                    </a>
                    {canDesign && (
                      <a href="/forms/designer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                        <SquarePen className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                        แก้ไข
                      </a>
                    )}
                    {canDesign && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => deleteDigital(d.id)}
                        aria-label="ลบแบบฟอร์ม"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </Grid>
          )}
        </CardContent>
      </Card>

      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      {/* Filter card */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <div className="relative min-w-[220px] flex-1 sm:max-w-[420px]">
            <Search
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหารหัสแบบฟอร์ม หรือชื่อ... เช่น F-EN-07, ตรวจเช็ค, ใบแจ้งซ่อม"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={extFilter} onValueChange={(v) => setExtFilter(v)}>
            <SelectTrigger className="w-full sm:w-[200px]" aria-label="ประเภทไฟล์">
              <SelectValue placeholder="ทุกไฟล์" />
            </SelectTrigger>
            <SelectContent>
              {extOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* ═══ แบบฟอร์มมาตรฐาน (ไฟล์) ═══ */}
      {loading ? (
        <Card>
          <CardContent className="flex justify-center py-12">
            <Spinner />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={<FileText className="w-8 h-8" strokeWidth={1.75} aria-hidden="true" />}
              title="ไม่พบแบบฟอร์มที่ค้นหา"
              description="ลองปรับคำค้นหาหรือประเภทไฟล์"
            />
          </CardContent>
        </Card>
      ) : (
        <Grid columns={{ minWidth: 300, repeat: "fit" }} gap={4}>
          {filtered.map((f) => (
            <Card key={f.filename} className="flex flex-col gap-3 p-4 shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Badge variant="primary">{f.code || "เอกสาร"}</Badge>
                {f.rev && <Badge variant="neutral">{f.rev}</Badge>}
              </div>
              <p className="flex-1 text-sm font-semibold leading-snug text-foreground">{f.title}</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="success">{extLabel[f.ext] || f.ext.toUpperCase()}</Badge>
                  <span className="text-xs text-muted-foreground">{formatSize(f.size)}</span>
                </div>
                <Button size="sm" onClick={() => download(f)} className="gap-1.5">
                  <FileDown className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                  ดาวน์โหลด
                </Button>
              </div>
            </Card>
          ))}
        </Grid>
      )}

      {/* ═══ Dialog อัปโหลดแบบฟอร์มใหม่ ═══ */}
      <AnimatedDialog open={uploadOpen} onClose={() => setUploadOpen(false)}>
        <div className="border-b border-border p-5">
          <h2 className="text-base font-semibold">อัปโหลดแบบฟอร์มใหม่</h2>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            เลือกไฟล์แบบฟอร์ม (xls/xlsx/xlsm/pdf/docx/ods/doc/csv/pptx สูงสุด 25 MB) — ไฟล์จะถูกบันทึกที่ docs/EN และโผล่ในรายการทันที
          </p>

          {upMsg && (
            <Alert variant={upMsg.isError ? "danger" : "success"}>{upMsg.text}</Alert>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="upCode">รหัสแบบฟอร์ม (ไม่บังคับ)</Label>
              <Input
                id="upCode"
                placeholder="เช่น F-EN-64 (เว้นว่าง = ใช้ชื่อไฟล์เดิม)"
                value={upCode}
                onChange={(e) => setUpCode(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="upRev">REV (ไม่บังคับ)</Label>
              <Input
                id="upRev"
                placeholder="เช่น REV.00 หรือ 01"
                value={upRev}
                onChange={(e) => setUpRev(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="upTitle">ชื่อแบบฟอร์ม (จำเป็นเมื่อระบุรหัส)</Label>
              <Input
                id="upTitle"
                placeholder="เช่น ใบตรวจเช็คเครื่องจักรประจำวัน"
                value={upTitle}
                onChange={(e) => setUpTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="upFile">
                ไฟล์แบบฟอร์ม <span className="text-destructive">*</span>
              </Label>
              <Input
                id="upFile"
                type="file"
                accept=".xls,.xlsx,.xlsm,.pdf,.docx,.ods,.doc,.csv,.pptx"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setUpFile(file);
                  if (file) setUpMsg(null);
                }}
                className="py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-[var(--cmms-bg-muted)] file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-[var(--cmms-bg-wash)]"
              />
            </div>
          </div>

          {computedName && (
            <div className="rounded-lg border border-dashed border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] px-3.5 py-2.5 text-xs text-[var(--cmms-text-secondary)]">
              <strong>ชื่อไฟล์ที่จะบันทึก:</strong> {computedName}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              ยกเลิก
            </Button>
            <Button disabled={upLoading} onClick={handleUpload}>
              <Upload className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              {upLoading ? "กำลังอัปโหลด..." : "อัปโหลด"}
            </Button>
          </div>
        </div>
      </AnimatedDialog>
    </PageShell>
  );
}
