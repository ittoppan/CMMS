"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AndonLamp from "@/components/AndonLamp";
import {
  Upload, Download, PackageOpen, Wrench, ClipboardCheck, Gauge, Syringe,
  FileSpreadsheet, FileDown, CheckCircle2, TriangleAlert, RotateCcw, ArrowRight,
  ShieldAlert, History, ChevronLeft, ChevronRight, Eye,
} from "lucide-react";

const PAGE_SIZE = 25;

interface ValRow {
  row: number;
  ok: boolean;
  errors: string[];
  cells: Record<string, string>;
}

interface ValResp {
  status: string;
  dataset: string;
  dataset_label: string;
  sheet: string;
  headers: { label: string; recognized: boolean; required: boolean }[];
  sheet_errors: string[];
  rows: ValRow[];
  summary: { total: number; ok: number; error: number };
}

interface ImportResult {
  status: string;
  inserted: number;
  failed: number;
  total: number;
  errors: { row: number; errors: string[] }[];
}

interface HistoryItem {
  id: string;
  dataset: string;
  file_name: string | null;
  total: number;
  inserted: number;
  failed: number;
  note: string | null;
  created_at: string;
  who: string;
}

interface DatasetMeta {
  key: string;
  label: string;
  short: string;
  desc: string;
  icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  required: string[];
  columns: string[];
  sample: Record<string, string>;
}

const DATASETS: DatasetMeta[] = [
  {
    key: "repair",
    label: "ใบสั่งงานซ่อม",
    short: "Repair Work Orders",
    desc: "นำเข้าใบแจ้งซ่อม/ใบสั่งงานซ่อมเป็นชุด — เติมข้อมูลให้วิเคราะห์ Downtime/ค่าใช้จ่าย/SLA",
    icon: Wrench,
    required: ["รหัสเครื่องจักร", "หัวข้อแจ้งซ่อม"],
    columns: ["รหัสเครื่องจักร", "หัวข้อแจ้งซ่อม", "หมายเลขงาน", "รายละเอียด / อาการ", "ความเร่งด่วน", "สถานะ", "ประเภทงาน", "รหัสช่างผู้รับงาน", "แผนก", "เวลาเสีย (นาที)", "วันที่เริ่มซ่อม", "กำหนดแล้วเสร็จ", "วันที่แล้วเสร็จ", "วันที่แจ้งงาน", "ค่าอะไหล่", "ค่าแรง", "ค่าจ้างภายนอก", "วิธีการแก้ไข / หมายเหตุ"],
    sample: { "รหัสเครื่องจักร": "MCH-001", "หัวข้อแจ้งซ่อม": "มอเตอร์สายพานมีเสียงดัง", "ความเร่งด่วน": "medium", "สถานะ": "open", "ประเภทงาน": "breakdown", "เวลาเสีย (นาที)": "45", "ค่าอะไหล่": "500", "ค่าแรง": "300" },
  },
  {
    key: "asset",
    label: "ทะเบียนเครื่องจักร",
    short: "Asset Registry",
    desc: "นำเข้าเครื่องจักร/ทรัพย์สินเป็นชุดจากไฟล์ Excel",
    icon: Gauge,
    required: ["รหัสเครื่องจักร", "ชื่อเครื่องจักร"],
    columns: ["รหัสเครื่องจักร", "ชื่อเครื่องจักร", "หมวดหมู่", "รายละเอียด", "สถานที่ติดตั้ง", "ความสำคัญ (A/B/C)", "แผนกที่ดูแล", "ผู้ผลิต", "รุ่น", "เลขซีเรียล", "วันที่ซื้อ", "หมดประกัน", "สถานะเครื่อง", "ตำแหน่ง X", "ตำแหน่ง Y", "ชั่วโมงเดินเครื่อง/เดือน"],
    sample: { "รหัสเครื่องจักร": "MCH-001", "ชื่อเครื่องจักร": "เครื่องพิมพ์บรรจุภัณฑ์ 10 สี", "หมวดหมู่": "Machine", "ความสำคัญ (A/B/C)": "B", "สถานะเครื่อง": "active", "ผู้ผลิต": "TOPPAN", "ชั่วโมงเดินเครื่อง/เดือน": "720" },
  },
  {
    key: "pm_am",
    label: "แผน PM / AM",
    short: "Preventive Maintenance",
    desc: "นำเข้าตารางซ่อมบำรุงเชิงป้องกันและรอบการตรวจเช็ค",
    icon: ClipboardCheck,
    required: ["รหัสเครื่องจักร", "หัวข้อ PM"],
    columns: ["รหัสเครื่องจักร", "หัวข้อ PM", "รายละเอียด", "ความถี่", "จำนวนรอบ", "กำหนดตรวจครั้งถัดไป", "สถานะ", "รหัสช่างผู้รับผิดชอบ", "แผนก", "หมายเหตุ"],
    sample: { "รหัสเครื่องจักร": "MCH-001", "หัวข้อ PM": "PM ประจำเดือน ตรวจสอบระบบไฟฟ้า", "ความถี่": "monthly", "จำนวนรอบ": "1", "สถานะ": "pending", "กำหนดตรวจครั้งถัดไป": "2026-10-01" },
  },
  {
    key: "spare_parts",
    label: "อะไหล่ / สต็อก",
    short: "Spare Parts & Stock",
    desc: "นำเข้ารายการอะไหล่ สต็อกขั้นต่ำ-สูงสุด ราคา และซัพพลายเออร์",
    icon: PackageOpen,
    required: ["รหัสอะไหล่", "ชื่ออะไหล่"],
    columns: ["รหัสอะไหล่", "ชื่ออะไหล่", "หมวดหมู่", "รายละเอียด", "หน่วยนับ", "คงคลัง", "จำนวนสำรอง", "ขั้นต่ำ", "สูงสุด", "ตำแหน่งจัดเก็บ", "ราคาต่อหน่วย", "ซัพพลายเออร์"],
    sample: { "รหัสอะไหล่": "SP-0001", "ชื่ออะไหล่": "O-RING NBR 640131", "หน่วยนับ": "ชิ้น", "คงคลัง": "50", "ขั้นต่ำ": "10", "สูงสุด": "100", "ราคาต่อหน่วย": "120.50" },
  },
  {
    key: "calibration",
    label: "ข้อมูลสอบเทียบ",
    short: "Calibration",
    desc: "นำเข้ารอบสอบเทียบเครื่องมือวัด สถานะ ผล และค่าใช้จ่าย",
    icon: Syringe,
    required: ["รหัสเครื่องจักร", "วันที่สอบเทียบ"],
    columns: ["รหัสเครื่องจักร", "วันที่สอบเทียบ", "สอบเทียบครั้งถัดไป", "ประเภท", "ผลสอบเทียบ", "สถานะ", "เลขที่ใบรับรอง", "ค่าใช้จ่าย", "เลขที่ PO", "ซัพพลายเออร์", "มาตรฐานที่ใช้", "หมายเหตุ"],
    sample: { "รหัสเครื่องจักร": "MCH-001", "วันที่สอบเทียบ": "2026-09-15", "ประเภท": "full", "ผลสอบเทียบ": "pass", "สถานะ": "completed", "ค่าใช้จ่าย": "2500" },
  },
];

const getCsrfToken = (): string | null => {
  if (typeof document === "undefined") return null;
  const m = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null;
  if (m?.content) return m.content;
  const v = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/)?.[1] ?? null;
  return v ? decodeURIComponent(v) : null;
};

const fmtDateTime = (iso: string): string => {
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("th-TH", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

export default function ImportExcelPage() {
  const [datasetKey, setDatasetKey] = useState("repair");
  const [file, setFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [val, setVal] = useState<ValResp | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [page, setPage] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);

  const meta = DATASETS.find((d) => d.key === datasetKey) ?? DATASETS[0];
  const okCount = val?.summary.ok ?? 0;
  const unrecognizedHeaders = (val?.headers ?? []).filter((h) => !h.recognized);
  const totalPages = Math.max(1, Math.ceil((val?.rows.length ?? 0) / PAGE_SIZE));
  const pageRows = useMemo(() => {
    if (!val) return [];
    const from = (page - 1) * PAGE_SIZE;
    return val.rows.slice(from, from + PAGE_SIZE);
  }, [val, page]);

  const loadHistory = () => {
    fetch("/api/v1/import_excel.php?action=history", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json) => setHistory(Array.isArray(json.history) ? json.history : []))
      .catch(() => setHistory([]));
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const handleTemplate = async () => {
    setErrorMsg("");
    try {
      const res = await fetch(
        `/api/v1/import_excel.php?action=template&dataset=${datasetKey}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        try { const j = await res.json(); throw new Error(j?.error || `HTTP ${res.status}`); } catch { throw new Error("ดาวน์โหลดแม่แบบไม่สำเร็จ (อาจ session หมด) — ลองเข้าสู่ระบบใหม่อีกครั้ง"); }
      }
      const blob = await res.blob();
      downloadBlob(blob, `CMMS_import_${datasetKey}_template.xlsx`);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "ดาวน์โหลดแม่แบบไม่สำเร็จ");
    }
  };

  const handleValidate = async () => {
    if (!file) {
      setErrorMsg("กรุณาเลือกไฟล์ .xlsx ก่อนกดตรวจสอบ");
      return;
    }
    setErrorMsg("");
    setValidating(true);
    setResult(null);
    try {
      const csrf = getCsrfToken();
      const fd = new FormData();
      fd.append("dataset", datasetKey);
      fd.append("file", file);
      const res = await fetch("/api/v1/import_excel.php?action=validate", {
        method: "POST",
        credentials: "include",
        headers: { ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setVal(json as ValResp);
      setPage(1);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "ตรวจสอบไฟล์ไม่สำเร็จ";
      setErrorMsg(msg);
      setVal(null);
    } finally {
      setValidating(false);
    }
  };

  const performImport = async () => {
    if (!val) return;
    setErrorMsg("");
    setImporting(true);
    try {
      const csrf = getCsrfToken();
      const res = await fetch("/api/v1/import_excel.php?action=import", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        body: JSON.stringify({
          dataset: val.dataset,
          file_name: file?.name ?? "",
          rows: val.rows.filter((r) => r.ok),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setResult(json as ImportResult);
      loadHistory();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ";
      setErrorMsg(msg);
    } finally {
      setImporting(false);
    }
  };

  const handleErrorsXlsx = async () => {
    if (!val || val.summary.error === 0) return;
    setErrorMsg("");
    try {
      const csrf = getCsrfToken();
      const res = await fetch("/api/v1/import_excel.php?action=errors_xlsx", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        body: JSON.stringify({ dataset: val.dataset, rows: val.rows.filter((r) => !r.ok) }),
      });
      if (!res.ok) {
        try { const j = await res.json(); throw new Error(j?.error || `HTTP ${res.status}`); } catch { throw new Error("สร้างไฟล์แถว error ไม่สำเร็จ"); }
      }
      const blob = await res.blob();
      downloadBlob(blob, `CMMS_import_${val.dataset}_errors.xlsx`);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "สร้างไฟล์แถว error ไม่สำเร็จ");
    }
  };

  const resetAll = () => {
    setVal(null);
    setResult(null);
    setFile(null);
    setErrorMsg("");
    setPage(1);
    const inp = document.getElementById("imp-file") as HTMLInputElement | null;
    if (inp) inp.value = "";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>REPORTS IMPORT EXCEL · CMMS-TOPPAN</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>นำเข้าข้อมูลจาก Excel (Import)</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <Upload size={14} strokeWidth={1.75} aria-hidden="true" /> แม่แบบ + ตรวจสอบ + ยืนยันก่อนบันทึก
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            ดาวน์โหลดแม่แบบ เติมข้อมูล แล้วอัปโหลดเพื่อตรวจสอบทีละแถว — นำเข้าเฉพาะที่ผ่านเท่านั้น ปลอดภัยไม่ทำข้อมูลพัง
          </p>
        </div>
      </div>

      {errorMsg && <Alert variant="danger" title={errorMsg} />}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── ซ้าย: เลือกชุดข้อมูล + แม่แบบ + อัปโหลด ── */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="space-y-4">
              <h3 className="font-bold">1. เลือกชุดข้อมูลที่ต้องการนำเข้า</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {DATASETS.map((d) => {
                  const Icon = d.icon;
                  const active = d.key === datasetKey;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => {
                        setDatasetKey(d.key);
                        setVal(null);
                        setResult(null);
                        setErrorMsg("");
                        setPage(1);
                      }}
                      className={
                        "text-left rounded-xl border p-4 transition-colors " +
                        (active
                          ? "border-[var(--cmms-primary)] bg-[var(--cmms-primary-light)]"
                          : "border-[var(--cmms-border)] bg-[var(--cmms-bg-wash)] hover:bg-[var(--cmms-bg-muted)]")
                      }
                      aria-pressed={active}
                    >
                      <div className="flex items-center gap-3">
                        <div className={"cmms-icon-tile h-10 w-10 " + (active ? "" : "blue")}>
                          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                        </div>
                        <div>
                          <p className="font-bold leading-tight">{d.label}</p>
                          <p className="text-xs text-[var(--cmms-text-secondary)]">{d.short}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">{meta.desc}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">คอลัมน์บังคับ:</span>
                {meta.required.map((c) => (
                  <Badge key={c} variant="neutral">{c}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-bold">2. ดาวน์โหลดแม่แบบ และอัปโหลดไฟล์ Excel (.xlsx)</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => setShowPreview((v) => !v)} aria-expanded={showPreview}>
                    <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
                    {showPreview ? "ซ่อนตัวอย่าง" : "ดูตัวอย่างแม่แบบ"}
                  </Button>
                  <Button variant="secondary" onClick={handleTemplate}>
                    <Download size={16} strokeWidth={1.75} aria-hidden="true" />
                    ดาวน์โหลดแม่แบบ {meta.label}
                  </Button>
                </div>
              </div>

              {showPreview && (
                <div className="space-y-2">
                  <div className="overflow-x-auto rounded-xl border border-[var(--cmms-border)]">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead>
                        <tr className="border-b border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] text-left">
                          <th className="px-3 py-2 font-semibold">คอลัมน์ในแม่แบบ</th>
                          {meta.columns.map((c) => (
                            <th
                              key={c}
                              className={"whitespace-nowrap px-3 py-2 font-semibold " + (meta.required.includes(c) ? "text-[var(--cmms-danger)]" : "")}
                            >
                              {c}{meta.required.includes(c) ? " *" : ""}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-[var(--cmms-bg-card)]">
                          <td className="px-3 py-2 font-semibold text-[var(--cmms-text-secondary)]">ตัวอย่าง</td>
                          {meta.columns.map((c) => (
                            <td
                              key={c}
                              className={
                                "max-w-[180px] truncate px-3 py-2 " +
                                (meta.required.includes(c)
                                  ? "font-medium text-[var(--cmms-text-primary)]"
                                  : "text-[var(--cmms-text-secondary)]")
                              }
                            >
                              {meta.sample[c] ?? (meta.required.includes(c) ? "ต้องระบุ" : "—")}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="flex items-center gap-2 text-sm text-[var(--cmms-text-secondary)]">
                    <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
                    แสดงคอลัมน์และรูปแบบข้อมูลในแม่แบบ — คอลัมน์ที่ติดเครื่องหมาย * จำเป็นต้องกรอก ส่วนคอลัมน์อื่นเว้นว่างได้
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-dashed border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] p-5">
                <label
                  htmlFor="imp-file"
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 text-center"
                >
                  <div className="cmms-icon-tile h-12 w-12">
                    <FileSpreadsheet size={24} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <p className="font-semibold">
                    {file ? file.name : "ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์"}
                  </p>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">
                    รองรับ .xlsx เท่านั้น · ไม่เกิน 10MB · ครั้งละสูงสุด 5,000 แถว
                  </p>
                </label>
                <input
                  id="imp-file"
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setVal(null);
                    setResult(null);
                    setErrorMsg("");
                    setPage(1);
                  }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={validating || !file} onClick={handleValidate}>
                  <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
                  {validating ? "กำลังตรวจสอบ..." : "ตรวจสอบไฟล์"}
                </Button>
                <Button variant="ghost" onClick={resetAll} disabled={validating || importing}>
                  <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" /> เริ่มใหม่
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── ขวา: ขั้นตอนวิธีใช้ ── */}
        <Card style={{ background: "var(--cmms-bg-muted)" }}>
          <CardContent className="space-y-4">
            <h3 className="font-bold">ขั้นตอนการนำเข้า</h3>
            <div className="space-y-3">
              {[
                { step: "1", text: "ดาวน์โหลดแม่แบบแล้วเติมข้อมูลในคอลัมน์หัวข้อเหมือนเดิม (ห้ามแก้แถวที่ 1)" },
                { step: "2", text: "ลบบรรทัดตัวอย่างออก และอัปโหลดไฟล์เพื่อตรวจสอบ" },
                { step: "3", text: "ดูพรีวิวทีละแถว — แถวที่เป็นสีแดงจะไม่ถูกนำเข้า" },
                { step: "4", text: "กดยืนยันนำเข้าเฉพาะแถวที่ผ่านการตรวจสอบเท่านั้น" },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-3">
                  <span className="cmms-icon-tile h-7 w-7 shrink-0 text-xs font-bold">{s.step}</span>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">{s.text}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-[var(--cmms-border)] bg-[var(--cmms-bg-wash)] p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--cmms-warning)]">
                <ShieldAlert size={15} strokeWidth={1.75} aria-hidden="true" />
                คำแนะนำสำคัญ
              </div>
              <p className="mt-1 text-sm text-[var(--cmms-text-secondary)]">
                รหัสเครื่องจักร/รหัสอะไหล่/รหัสผู้ใช้ ต้องตรงกับข้อมูลในระบบอยู่แล้ว หากไม่พบระบบจะแจ้งเป็น error รายแถวและข้ามรายการนั้น
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── ผลการตรวจสอบ (พรีวิว) ── */}
      {val && (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold">3. ผลการตรวจสอบไฟล์ — {val.dataset_label}</h3>
                <p className="text-sm text-[var(--cmms-text-secondary)]">
                  Sheet: {val.sheet} · {val.summary.total} แถว · ผ่าน {val.summary.ok} · มีปัญหา {val.summary.error}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AndonLamp status={val.summary.error > 0 ? "warn" : "ok"} showLabel size="sm" />
                {val.summary.error > 0 && (
                  <Button variant="secondary" onClick={handleErrorsXlsx}>
                    <FileDown size={16} strokeWidth={1.75} aria-hidden="true" />
                    ดาวน์โหลดแถว error ({val.summary.error})
                  </Button>
                )}
                {okCount > 0 && (
                  <Button disabled={importing} onClick={() => setConfirmOpen(true)}>
                    <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
                    ยืนยันนำเข้า {okCount} รายการ
                  </Button>
                )}
              </div>
            </div>

            {val.sheet_errors.length > 0 && (
              <Alert variant="danger" title="ปัญหาในโครงสร้างไฟล์">
                <ul className="mt-1 list-inside list-disc text-sm">
                  {val.sheet_errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </Alert>
            )}

            {unrecognizedHeaders.length > 0 && (
              <Alert variant="warning" title={`คอลัมน์ที่ไม่รู้จัก (${unrecognizedHeaders.length} คอลัมน์): ระบบจะข้ามคอลัมน์เหล่านี้`}>
                <ul className="mt-1 list-inside list-disc text-sm">
                  {unrecognizedHeaders.map((h) => <li key={h.label}>"{h.label}"</li>)}
                </ul>
              </Alert>
            )}

            <div className="overflow-x-auto rounded-xl border border-[var(--cmms-border)]">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] text-left">
                    <th className="px-3 py-2 font-semibold">แถว</th>
                    <th className="px-3 py-2 font-semibold">สถานะ</th>
                    {val.headers.map((h) => (
                      <th key={h.label} className="px-3 py-2 font-semibold">{h.label}{h.required ? " *" : ""}</th>
                    ))}
                    <th className="px-3 py-2 font-semibold">ข้อผิดพลาด</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr
                      key={r.row}
                      className={
                        "border-b border-[var(--cmms-border)] last:border-0 " +
                        (r.ok ? "bg-[var(--cmms-bg-card)]" : "bg-[var(--cmms-danger-light)]")
                      }
                    >
                      <td className="px-3 py-2 font-mono text-xs">{r.row}</td>
                      <td className="px-3 py-2">
                        <AndonLamp status={r.ok ? "ok" : "warn"} size="sm" />
                      </td>
                      {val.headers.map((h) => (
                        <td key={h.label} className="max-w-[180px] truncate px-3 py-2 text-[var(--cmms-text-secondary)]">
                          {r.cells[h.label] || "—"}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        {r.errors.length > 0 && (
                          <ul className="list-inside list-disc space-y-0.5 text-xs text-[var(--cmms-danger)]">
                            {r.errors.map((e) => <li key={e}>{e}</li>)}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[var(--cmms-text-secondary)]">
                  หน้า {page} จาก {totalPages} · แสดงแถว {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, val.rows.length)} จาก {val.rows.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>
                    <ChevronLeft size={14} strokeWidth={1.75} aria-hidden="true" /> หน้าแรก
                  </Button>
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft size={14} strokeWidth={1.75} aria-hidden="true" /> ก่อนหน้า
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    ถัดไป <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>
                    สุดท้าย <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}

            <p className="text-sm text-[var(--cmms-text-secondary)]">
              <TriangleAlert size={14} strokeWidth={1.75} className="mr-1 inline" aria-hidden="true" />
              ระบบจะนำเข้าเฉพาะแถวที่สถานะเป็นไฟเขียวเท่านั้น ({okCount} รายการ) และข้ามแถวที่มีปัญหาไว้ก่อน — กด "ดาวน์โหลดแถว error" เพื่อเอาเฉพาะแถวที่แก้ไปเป็นไฟล์ใหม่
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── ผลลัพธ์การนำเข้า ── */}
      {result && (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="cmms-icon-tile green h-12 w-12">
                <CheckCircle2 size={24} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-bold">ผลการนำเข้า</h3>
                <p className="text-sm text-[var(--cmms-text-secondary)]">
                  นำเข้าสำเร็จ {result.inserted} รายการ · ข้าม/ล้มเหลว {result.failed} รายการ
                </p>
              </div>
            </div>

            {result.inserted > 0 && <Alert variant="success" title={`บันทึกข้อมูลสำเร็จ ${result.inserted} รายการ`} />}

            {result.failed > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--cmms-danger)]">
                  <TriangleAlert size={15} strokeWidth={1.75} aria-hidden="true" />
                  รายการที่ไม่ได้นำเข้า ({result.failed})
                </div>
                <div className="overflow-x-auto rounded-xl border border-[var(--cmms-border)]">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] text-left">
                        <th className="px-3 py-2 font-semibold">แถว</th>
                        <th className="px-3 py-2 font-semibold">สาเหตุ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((e) => (
                        <tr key={e.row} className="border-b border-[var(--cmms-border)] last:border-0 bg-[var(--cmms-danger-light)]">
                          <td className="px-3 py-2 font-mono text-xs">{e.row}</td>
                          <td className="px-3 py-2">
                            <ul className="list-inside list-disc text-xs text-[var(--cmms-danger)]">
                              {e.errors.map((m) => <li key={m}>{m}</li>)}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <Button variant="secondary" onClick={resetAll}>
              <Upload size={16} strokeWidth={1.75} aria-hidden="true" /> นำเข้าไฟล์ถัดไป
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── ประวัติการนำเข้าล่าสุด (audit trail) ── */}
      {history && history.length > 0 && (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="cmms-icon-tile h-9 w-9">
                <History size={16} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <h3 className="font-bold">ประวัติการนำเข้าล่าสุด</h3>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--cmms-border)]">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] text-left">
                    <th className="px-3 py-2 font-semibold">ชุดข้อมูล</th>
                    <th className="px-3 py-2 font-semibold">ไฟล์</th>
                    <th className="px-3 py-2 font-semibold">นำเข้า</th>
                    <th className="px-3 py-2 font-semibold">ข้าม</th>
                    <th className="px-3 py-2 font-semibold">ผู้ทำรายการ</th>
                    <th className="px-3 py-2 font-semibold">เวลา</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const d = DATASETS.find((x) => x.key === h.dataset);
                    return (
                      <tr key={h.id} className="border-b border-[var(--cmms-border)] last:border-0">
                        <td className="px-3 py-2">{d?.label ?? h.dataset}</td>
                        <td className="max-w-[240px] truncate px-3 py-2 text-[var(--cmms-text-secondary)]">
                          {h.file_name || "—"}
                        </td>
                        <td className="px-3 py-2 font-semibold text-[var(--cmms-success)]">{h.inserted}</td>
                        <td className={"px-3 py-2 " + (h.failed > 0 ? "font-semibold text-[var(--cmms-danger)]" : "text-[var(--cmms-text-secondary)]")}>
                          {h.failed}
                        </td>
                        <td className="px-3 py-2 text-[var(--cmms-text-secondary)]">{h.who || "—"}</td>
                        <td className="px-3 py-2 text-[var(--cmms-text-secondary)]">{fmtDateTime(h.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ยืนยันก่อนนำเข้า (AlertDialog) ── */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันนำเข้าข้อมูล</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการนำเข้า {okCount} รายการจากไฟล์ "{file?.name ?? ""}" เข้าสู่ชุดข้อมูล {val?.dataset_label}? ระบบจะข้ามแถวที่มีปัญหาไปและบันทึกเป็น transaction เดียวกันทั้งหมด
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={performImport}>
              {importing ? "กำลังนำเข้า..." : `ยืนยันนำเข้า ${okCount} รายการ`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}