"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/PageShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  FileDown,
  ArrowLeft,
  CheckCircle2,
  Trash2,
  SquarePen,
} from "lucide-react";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useParams } from "next/navigation";
import { FORM_DATA_SOURCES, fetchDataSourceOptions, DataOption, dataSourceLabel } from "@/lib/form-data-sources";
import { usePageHero, t } from "@/lib/i18n";

interface SchemaField {
  type: string;
  label?: string;
  name?: string;
  subtype?: string;
  required?: boolean;
  placeholder?: string;
  description?: string;
  values?: { label: string; value: string; selected?: boolean }[];
  "data-bind"?: string;
  dataBind?: string;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
}

interface TemplateDetail {
  id: number;
  code: string;
  title: string;
  rev: string;
  description: string;
  schema: string;
  updated_at: string;
  created_name?: string;
}

interface Submission {
  id: number;
  data: string;
  created_at: string;
  created_name?: string;
}

type FieldValues = Record<string, string | string[]>;

/** formBuilder บันทึก attribute เป็น dataBind (camelCase) — รองรับทั้งสองแบบ */
function fieldBind(f: SchemaField): string {
  return f["data-bind"] || f.dataBind || "";
}

function parseSchema(raw: string): SchemaField[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function FormRunPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id ?? 0);

  const hero = usePageHero("forms/run", {
    eyebrow: "FORM FILL · CMMS-TOPPAN",
    title: "กรอกแบบฟอร์ม",
    desc: "กรอกข้อมูลแบบฟอร์มดิจิทัล — ฟิลด์ที่ผูกฐานข้อมูลเลือกค่าจริง แล้วพิมพ์เป็น PDF",
  });

  const [tpl, setTpl] = useState<TemplateDetail | null>(null);
  const [canDesign, setCanDesign] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [values, setValues] = useState<FieldValues>({});
  const [bindOptions, setBindOptions] = useState<Record<string, DataOption[]>>({});
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const printRef = useRef<HTMLDivElement | null>(null);

  const schema = useMemo(() => (tpl ? parseSchema(tpl.schema) : []), [tpl]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/form_templates.php?id=${id}`, { credentials: "include" });
      const json = await res.json();
      if (json.status !== "success" || !json.data) {
        setError(json.message || "ไม่พบแบบฟอร์ม");
        return;
      }
      setTpl(json.data);
      setCanDesign(!!json.can_design);
      setSubmissions(json.submissions || []);
      // prefill จาก schema: checkbox/radio selected + ค่าเริ่มต้น
      const fields = parseSchema(json.data.schema || "");
      const initial: FieldValues = {};
      const binds: Record<string, DataOption[]> = {};
      const keys = new Set<string>();
      for (const f of fields) {
        if (!f.name) continue;
        if (f.type === "checkbox-group") {
          const selected = (f.values || []).filter((v) => v.selected).map((v) => v.value);
          initial[f.name] = selected;
        } else if (f.type === "radio-group" || f.type === "select") {
          const sel = (f.values || []).find((v) => v.selected);
          initial[f.name] = sel ? sel.value : "";
        } else {
          initial[f.name] = "";
        }
        const bind = fieldBind(f);
        if (bind && !keys.has(bind)) {
          keys.add(bind);
          const src = FORM_DATA_SOURCES.find((s) => s.key === bind);
          if (src) binds[bind] = await fetchDataSourceOptions(src).catch(() => []);
        }
      }
      setValues(initial);
      setBindOptions(binds);
    } catch (e) {
      console.error("Load form error", e);
      setError("ไม่สามารถเชื่อมต่อระบบได้");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const setValue = (name: string, v: string | string[]) => {
    setValues((prev) => ({ ...prev, [name]: v }));
  };

  const fieldName = (f: SchemaField, i: number) => f.name || `field_${i}`;

  const renderField = (f: SchemaField, i: number) => {
    const name = fieldName(f, i);
    const value = (values[name] ?? "") as string;
    const bind = fieldBind(f);
    const required = f.required ? <span className="text-destructive"> *</span> : null;
    const label = f.label ? (
      <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor={name}>
        {f.label}
        {required}
      </label>
    ) : null;

    const inputClass =
      "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";

    switch (f.type) {
      case "header": {
        const level = f.subtype === "h1" ? 1 : f.subtype === "h2" ? 2 : f.subtype === "h3" ? 3 : 4;
        return (
          <div key={i} className="cmms-form-block">
            {level === 1 && <h2 className="text-lg font-semibold tracking-tight text-foreground">{f.label}</h2>}
            {level === 2 && <h3 className="text-base font-semibold text-foreground">{f.label}</h3>}
            {level >= 3 && <h4 className="text-sm font-medium text-foreground">{f.label}</h4>}
          </div>
        );
      }
      case "paragraph":
        return (
          <div key={i} className="cmms-form-block">
            <p className="text-sm text-muted-foreground">{f.label}</p>
          </div>
        );
      case "textarea":
        return (
          <div key={i} className="cmms-form-block">
            {label}
            <textarea
              id={name}
              rows={f.rows || 3}
              className={inputClass}
              placeholder={f.placeholder}
              value={value}
              onChange={(e) => setValue(name, e.target.value)}
            />
          </div>
        );
      case "select":
      case "autocomplete":
        return (
          <div key={i} className="cmms-form-block">
            {label}
            <select id={name} className={inputClass} value={value} onChange={(e) => setValue(name, e.target.value)}>
              <option value="">— เลือก —</option>
              {(f.values || []).map((opt, oi) => (
                <option key={oi} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        );
      case "checkbox-group":
        return (
          <div key={i} className="cmms-form-block">
            {label}
            <div className="space-y-1.5">
              {(f.values || []).map((opt, oi) => {
                const arr = (values[name] ?? []) as string[];
                return (
                  <label key={oi} className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={arr.includes(opt.value)}
                      onChange={(e) => {
                        const next = e.target.checked ? [...arr, opt.value] : arr.filter((v) => v !== opt.value);
                        setValue(name, next);
                      }}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </div>
        );
      case "radio-group":
        return (
          <div key={i} className="cmms-form-block">
            {label}
            <div className="space-y-1.5">
              {(f.values || []).map((opt, oi) => (
                <label key={oi} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name={name}
                    value={opt.value}
                    checked={value === opt.value}
                    onChange={(e) => setValue(name, e.target.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        );
      case "file":
        return (
          <div key={i} className="cmms-form-block">
            {label}
            <input type="file" className={inputClass} />
          </div>
        );
      case "hidden":
        return null;
      default:
        // text / number / date
        return (
          <div key={i} className="cmms-form-block">
            {label}
            {bind ? (
              <select
                id={name}
                className={inputClass}
                value={value}
                onChange={(e) => setValue(name, e.target.value)}
              >
                <option value="">— เลือก{dataSourceLabel(bind) ? ` ${dataSourceLabel(bind)}` : ""} —</option>
                {(bindOptions[bind] || []).map((opt, oi) => (
                  <option key={oi} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <input
                id={name}
                type={f.subtype === "number" ? "number" : f.subtype === "date" ? "date" : "text"}
                className={inputClass}
                placeholder={f.placeholder}
                min={f.min}
                max={f.max}
                step={f.step}
                value={value}
                onChange={(e) => setValue(name, e.target.value)}
              />
            )}
          </div>
        );
    }
  };

  const saveSubmission = useCallback(async () => {
    if (!tpl) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v1/form_templates.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "submit", id: tpl.id, data: values }),
      });
      const json = await res.json();
      if (json.status === "success") {
        setMsg({ text: "บันทึกผลการกรอกเรียบร้อยแล้ว", isError: false });
        load();
      } else {
        setMsg({ text: json.message || "บันทึกไม่สำเร็จ", isError: true });
      }
    } catch (e) {
      console.error("Submit error", e);
      setMsg({ text: "ไม่สามารถเชื่อมต่อระบบได้", isError: true });
    } finally {
      setSaving(false);
    }
  }, [tpl, values, load]);

  const exportPdf = useCallback(async () => {
    if (!printRef.current || !tpl) return;
    setExporting(true);
    setMsg(null);
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = 210;
      const pageH = 297;
      const imgW = pageW;
      const imgH = (canvas.height * pageW) / canvas.width;
      const imgData = canvas.toDataURL("image/png");
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
        heightLeft -= pageH;
      }
      pdf.save(`${tpl.code} ${tpl.title}.pdf`);
      setMsg({ text: "สร้าง PDF เรียบร้อยแล้ว", isError: false });
    } catch (e) {
      console.error("PDF export error", e);
      setMsg({ text: "สร้าง PDF ไม่สำเร็จ — ลองใหม่", isError: true });
    } finally {
      setExporting(false);
    }
  }, [tpl]);

  const deleteSubmission = useCallback(async (sid: number) => {
    if (!window.confirm("ลบผลการกรอกนี้?")) return;
    try {
      const res = await fetch("/api/v1/form_templates.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "delete_submission", id: sid }),
      });
      const json = await res.json();
      if (json.status === "success") {
        load();
      } else {
        setMsg({ text: json.message || "ลบไม่สำเร็จ", isError: true });
      }
    } catch (e) {
      console.error("Delete submission error", e);
    }
  }, [load]);

  if (loading) {
    return (
      <PageShell
        breadcrumbs={[
          { label: "หน้าแรก", href: "/dashboard" },
          { label: "อนุมัติ & เอกสาร", href: "/forms" },
          { label: hero.title },
        ]}
        title={hero.title}
        description={hero.desc}
      >
        <div className="flex flex-col items-center gap-3 py-20">
          <Spinner size={28} label="" />
          <p className="text-sm text-muted-foreground">กำลังโหลดแบบฟอร์ม...</p>
        </div>
      </PageShell>
    );
  }

  if (error || !tpl) {
    return (
      <PageShell
        breadcrumbs={[
          { label: "หน้าแรก", href: "/dashboard" },
          { label: "อนุมัติ & เอกสาร", href: "/forms" },
          { label: "ไม่พบแบบฟอร์ม" },
        ]}
        title="ไม่พบแบบฟอร์ม"
      >
        <div className="space-y-4">
          <Alert variant="danger" title="ไม่พบแบบฟอร์ม" description={error || "แบบฟอร์มนี้ถูกลบหรือไม่มีอยู่แล้ว"} />
          <a href="/forms" className={buttonVariants({ variant: "secondary" })}>
            กลับไปศูนย์แบบฟอร์ม
          </a>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "อนุมัติ & เอกสาร", href: "/forms" },
        { label: tpl.title },
      ]}
      title={tpl.title}
      description={tpl.description || hero.desc}
      actions={
        <>
          <a href="/forms" className={buttonVariants({ variant: "ghost" })}>
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            {t("action.back")}
          </a>
          {canDesign && (
            <a href={`/forms/designer`} className={buttonVariants({ variant: "secondary" })}>
              <SquarePen className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              แก้ไขฟอร์ม
            </a>
          )}
          <Button onClick={exportPdf} disabled={exporting}>
            {exporting ? <Spinner size={16} label="" /> : <FileDown className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
            {t("action.download_pdf")}
          </Button>
        </>
      }
    >
      {msg && (
        <Alert
          variant={msg.isError ? "danger" : "success"}
          title={msg.isError ? "เกิดข้อผิดพลาด" : "สำเร็จ"}
          description={msg.text}
        />
      )}

      <div className="grid gap-5 md:grid-cols-12">
        <div className="md:col-span-8">
          <Card>
            <CardContent className="p-5">
              <div ref={printRef} className="cmms-print-area rounded-xl bg-white p-6">
                <div className="space-y-4">
                  <div className="space-y-1 border-b-2 border-border pb-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      CMMS-TOPPAN · {tpl.code} {tpl.rev}
                    </p>
                    <h2 className="text-base font-semibold text-foreground">{tpl.title}</h2>
                    {tpl.description && (
                      <p className="text-sm text-muted-foreground">{tpl.description}</p>
                    )}
                  </div>
                  {schema.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      แบบฟอร์มนี้ยังไม่มีฟิลด์ — กลับไปหน้าออกแบบเพื่อเพิ่มฟิลด์ก่อน
                    </p>
                  ) : (
                    schema.map((f, i) => renderField(f, i))
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button onClick={saveSubmission} disabled={saving} className="gap-1.5">
                  <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                  {saving ? "กำลังบันทึก..." : "บันทึกผลการกรอก"}
                </Button>
                <Button variant="secondary" onClick={exportPdf} disabled={exporting} className="gap-1.5">
                  <FileDown className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                  {exporting ? "กำลังสร้าง PDF..." : "สร้าง PDF"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>ผลการกรอกล่าสุด</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {submissions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  ยังไม่มีผู้กรอกแบบฟอร์มนี้
                </p>
              )}
              {submissions.map((s) => (
                <div key={s.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm text-foreground">
                        {s.created_name || "ไม่ระบุชื่อ"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.created_at}
                      </p>
                    </div>
                    {canDesign && (
                      <button type="button" onClick={() => deleteSubmission(s.id)} className="text-muted-foreground hover:text-destructive" aria-label="ลบผลการกรอก">
                        <Trash2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
