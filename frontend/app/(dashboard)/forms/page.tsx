"use client";

import { useState, useEffect, useMemo } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { DialogHeader } from "@astryxdesign/core/Dialog";
import AnimatedDialog from "@/components/AnimatedDialog";
import { Field } from "@astryxdesign/core/Field";
import { FileInput } from "@astryxdesign/core/FileInput";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import {
  DocumentArrowDownIcon,
  MagnifyingGlassIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

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
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>FORM CENTER · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>ศูนย์แบบฟอร์ม (Form Center)</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <DocumentTextIcon className="w-3.5 h-3.5" /> {forms.length} แบบฟอร์ม
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            แบบฟอร์มมาตรฐานของฝ่ายวิศวกรรม (F-EN / F-SF) — ดาวน์โหลดเพื่อพิมพ์ใช้หน้างานได้ทันที
          </Text>
        </VStack>
        <HStack gap={2} wrap="wrap">
          <button
            type="button"
            onClick={() => { setUpMsg(null); setUpFile(null); setUploadOpen(true); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
          >
            <ArrowUpTrayIcon className="w-4 h-4" />
            อัปโหลดแบบฟอร์ม
          </button>
          <button
            type="button"
            onClick={fetchForms}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
          >
            <ArrowPathIcon className="w-4 h-4" />
            รีเฟรช
          </button>
        </HStack>
      </div>

      {/* ═══ แบบฟอร์มดิจิทัล (formBuilder) ═══ */}
      <Card padding={5}>
        <VStack gap={4}>
          <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
            <VStack gap={0.5}>
              <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "var(--cmms-text-muted)" }}>
                DIGITAL FORMS · FORM BUILDER
              </Text>
              <Heading level={4}>แบบฟอร์มดิจิทัล (ออกแบบ + กรอก + PDF)</Heading>
              <Text type="body" size="sm" style={{ color: "var(--cmms-text-muted)" }}>
                สร้างแบบฟอร์มด้วยลาก-วาง ผูกข้อมูลจากฐานข้อมูล แล้วพิมพ์เป็น PDF — ตรง "ออกแบบแบบฟอร์ม"
              </Text>
            </VStack>
            {canDesign && (
              <a href="/forms/designer">
                <button type="button" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary">
                  <PlusIcon className="w-4 h-4" />
                  ออกแบบแบบฟอร์มใหม่
                </button>
              </a>
            )}
          </HStack>

          {digitalsLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
              <Spinner />
            </div>
          ) : digitals.length === 0 ? (
            <div style={{ padding: "20px 8px" }}>
              <Text type="body" color="secondary">ยังไม่มีแบบฟอร์มดิจิทัล — กด "ออกแบบแบบฟอร์มใหม่" เพื่อสร้าง (เฉพาะผู้ดูแลระบบ)</Text>
            </div>
          ) : (
            <Grid columns={{ minWidth: 300, repeat: "fit" }} gap={4}>
              {digitals.map((d) => (
                <Card key={d.id} padding={4} elevation="low" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <HStack hAlign="between" vAlign="start" gap={2} wrap="wrap">
                    <span className="cmms-andon-chip" style={{ background: "rgba(0,87,168,0.12)", color: "var(--cmms-primary)", fontSize: "0.7rem", padding: "3px 9px" }}>{d.code}</span>
                    <span className="cmms-andon-chip" style={{ background: "rgba(16,185,129,0.12)", color: "var(--cmms-success)", fontSize: "0.7rem", padding: "3px 9px" }}>{d.submission_count} ครั้ง</span>
                  </HStack>
                  <Text type="body" weight="bold" style={{ lineHeight: 1.4, flex: 1 }}>
                    {d.title}
                  </Text>
                  <Text type="body" size="sm" color="disabled">
                    {d.rev} · แก้ไขล่าสุด {d.updated_at ? d.updated_at.slice(0, 10) : "-"}
                  </Text>
                  <HStack gap={2} wrap="wrap">
                    <a href={`/forms/run/${d.id}`} className="flex-1">
                      <button type="button" className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white cmms-btn-primary">
                        <DocumentTextIcon className="w-3.5 h-3.5" />
                        กรอกแบบฟอร์ม
                      </button>
                    </a>
                    {canDesign && (
                      <a href="/forms/designer">
                        <button type="button" className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-[var(--cmms-border)] hover:bg-[var(--cmms-bg-wash)] transition-colors">
                          <PencilSquareIcon className="w-3.5 h-3.5" />
                          แก้ไข
                        </button>
                      </a>
                    )}
                    {canDesign && (
                      <button type="button" onClick={() => deleteDigital(d.id)} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-[var(--cmms-border)] hover:bg-[var(--cmms-bg-wash)] transition-colors" aria-label="ลบแบบฟอร์ม">
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </HStack>
                </Card>
              ))}
            </Grid>
          )}
        </VStack>
      </Card>

      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      <Toolbar
        label="ค้นหาแบบฟอร์ม"
        startContent={
          <HStack gap={2} wrap="wrap">
            <TextInput
              label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหารหัสแบบฟอร์ม หรือชื่อ... เช่น F-EN-07, ตรวจเช็ค, ใบแจ้งซ่อม"
              startIcon={MagnifyingGlassIcon}
              value={search}
              onChange={setSearch}
              style={{ width: "100%", maxWidth: 420 }}
            />
            <Selector
              label="ประเภทไฟล์"
              isLabelHidden
              placeholder="ทุกไฟล์"
              value={extFilter}
              onChange={setExtFilter}
              options={extOptions}
            />
          </HStack>
        }
      />

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <Card padding={6}>
          <VStack gap={2} hAlign="center">
            <DocumentTextIcon className="w-8 h-8" style={{ color: "var(--cmms-disabled)" }} />
            <Text type="body" color="secondary">ไม่พบแบบฟอร์มที่ค้นหา</Text>
          </VStack>
        </Card>
      ) : (
        <Grid columns={{ minWidth: 300, repeat: "fit" }} gap={4}>
          {filtered.map((f) => (
            <Card key={f.filename} padding={4} elevation="low" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <HStack hAlign="between" vAlign="start" gap={2} wrap="wrap">
                <span className="cmms-andon-chip" style={{ background: "rgba(124,58,237,0.12)", color: "var(--cmms-primary)", fontSize: "0.7rem", padding: "3px 9px" }}>{f.code || "เอกสาร"}</span>
                {f.rev && <span className="cmms-andon-chip" style={{ background: "rgba(100,116,139,0.12)", color: "var(--cmms-text-muted)", fontSize: "0.7rem", padding: "3px 9px" }}>{f.rev}</span>}
              </HStack>
              <Text type="body" weight="bold" style={{ lineHeight: 1.4, flex: 1 }}>
                {f.title}
              </Text>
              <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <span className="cmms-andon-chip" style={{ background: "rgba(16,185,129,0.12)", color: "var(--cmms-success)", fontSize: "0.7rem", padding: "3px 9px" }}>{extLabel[f.ext] || f.ext.toUpperCase()}</span>
                  <Text type="body" size="sm" color="disabled">{formatSize(f.size)}</Text>
                </HStack>
                <button
                  type="button"
                  onClick={() => download(f)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white cmms-btn-primary"
                >
                  <DocumentArrowDownIcon className="w-3.5 h-3.5" />
                  ดาวน์โหลด
                </button>
              </HStack>
            </Card>
          ))}
        </Grid>
      )}

      {/* ═══ Dialog อัปโหลดแบบฟอร์มใหม่ ═══ */}
      <AnimatedDialog open={uploadOpen} onClose={() => setUploadOpen(false)}>
          <DialogHeader title="อัปโหลดแบบฟอร์มใหม่" />
          <VStack gap={4} style={{ padding: 24 }}>
            <Text type="body" color="secondary">
              เลือกไฟล์แบบฟอร์ม (xls/xlsx/xlsm/pdf/docx/ods/doc/csv/pptx สูงสุด 25 MB) — ไฟล์จะถูกบันทึกที่ docs/EN และโผล่ในรายการทันที
            </Text>

            {upMsg && (
              <div style={{
                padding: "10px 14px", borderRadius: 8,
                background: upMsg.isError ? "var(--cmms-danger-light, #fef2f2)" : "var(--cmms-success-light)",
                border: `1px solid ${upMsg.isError ? "var(--cmms-danger, #ef4444)" : "var(--cmms-success)"}`,
                color: upMsg.isError ? "var(--cmms-danger, #ef4444)" : "var(--cmms-success)",
                fontWeight: 600, fontSize: 13,
              }}>
                {upMsg.text}
              </div>
            )}

            <FormLayout>
              <Field label="รหัสแบบฟอร์ม (ไม่บังคับ)" inputID="upCode">
                <TextInput
                  label="รหัส"
                  isLabelHidden
                  placeholder="เช่น F-EN-64 (เว้นว่าง = ใช้ชื่อไฟล์เดิม)"
                  value={upCode}
                  onChange={setUpCode}
                />
              </Field>

              <Field label="REV (ไม่บังคับ)" inputID="upRev">
                <TextInput
                  label="REV"
                  isLabelHidden
                  placeholder="เช่น REV.00 หรือ 01"
                  value={upRev}
                  onChange={setUpRev}
                />
              </Field>

              <Field label="ชื่อแบบฟอร์ม (จำเป็นเมื่อระบุรหัส)" inputID="upTitle">
                <TextInput
                  label="ชื่อ"
                  isLabelHidden
                  placeholder="เช่น ใบตรวจเช็คเครื่องจักรประจำวัน"
                  value={upTitle}
                  onChange={setUpTitle}
                />
              </Field>

              <Field label="ไฟล์แบบฟอร์ม *" inputID="upFile">
                <FileInput
                  label="เลือกไฟล์"
                  isLabelHidden
                  accept=".xls,.xlsx,.xlsm,.pdf,.docx,.ods,.doc,.csv,.pptx"
                  value={upFile}
                  onChange={(f) => {
                    const file = Array.isArray(f) ? f[0] ?? null : f;
                    setUpFile(file);
                    if (file) setUpMsg(null);
                  }}
                />
              </Field>
            </FormLayout>

            {computedName && (
              <div style={{
                padding: "10px 14px", borderRadius: 8,
                background: "var(--cmms-bg-muted)",
                border: "1px dashed var(--cmms-border)",
                fontSize: 12.5, color: "var(--cmms-text-secondary)",
              }}>
                <strong>ชื่อไฟล์ที่จะบันทึก:</strong> {computedName}
              </div>
            )}

            <HStack hAlign="end" gap={2}>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={upLoading}
                onClick={handleUpload}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
              >
                <ArrowUpTrayIcon className="w-4 h-4" />
                {upLoading ? "กำลังอัปโหลด..." : "อัปโหลด"}
              </button>
            </HStack>
          </VStack>
        </AnimatedDialog>
    </VStack>
  );
}
