"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import {
  DocumentArrowDownIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  TrashIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";

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
    const required = f.required ? <span className="text-[var(--cmms-accent-danger)]"> *</span> : null;
    const label = f.label ? (
      <label className="block text-sm font-semibold text-[var(--cmms-text-primary)] mb-1.5" htmlFor={name}>
        {f.label}
        {required}
      </label>
    ) : null;

    const inputClass =
      "w-full rounded-lg border border-[var(--cmms-border)] bg-white px-3 py-2 text-sm text-[var(--cmms-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cmms-border-focus)]";

    switch (f.type) {
      case "header": {
        const level = f.subtype === "h1" ? 1 : f.subtype === "h2" ? 2 : f.subtype === "h3" ? 3 : 4;
        return (
          <div key={i} className="cmms-form-block">
            {level === 1 && <Heading level={2} style={{ color: "var(--cmms-text-primary)" }}>{f.label}</Heading>}
            {level === 2 && <Heading level={3} style={{ color: "var(--cmms-text-primary)" }}>{f.label}</Heading>}
            {level >= 3 && <Heading level={4} style={{ color: "var(--cmms-text-primary)" }}>{f.label}</Heading>}
          </div>
        );
      }
      case "paragraph":
        return (
          <div key={i} className="cmms-form-block">
            <Text type="body" style={{ color: "var(--cmms-text-secondary)" }}>{f.label}</Text>
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
                  <label key={oi} className="flex items-center gap-2 text-sm text-[var(--cmms-text-primary)]">
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
                <label key={oi} className="flex items-center gap-2 text-sm text-[var(--cmms-text-primary)]">
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
      <VStack gap={6} vAlign="center" style={{ paddingTop: 80 }}>
        <Spinner size="lg" />
        <Text type="body" style={{ color: "var(--cmms-text-muted)" }}>กำลังโหลดแบบฟอร์ม...</Text>
      </VStack>
    );
  }

  if (error || !tpl) {
    return (
      <VStack gap={6}>
        <Banner status="error" title="ไม่พบแบบฟอร์ม" description={error || "แบบฟอร์มนี้ถูกลบหรือไม่มีอยู่แล้ว"} isDismissable={false} />            <a href="/forms">
              <Button label="กลับไปศูนย์แบบฟอร์ม" variant="secondary" />
            </a>
      </VStack>
    );
  }

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>
            {hero.eyebrow}
          </Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>{tpl.title}</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              {tpl.code} {tpl.rev}
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {tpl.description || hero.desc}
          </Text>
        </VStack>
        <HStack gap={2} wrap="wrap">
          <a href="/forms">
            <Button label={t("action.back")} variant="ghost" icon={<ArrowLeftIcon className="w-4 h-4" />} />
          </a>
          {canDesign && (
            <a href={`/forms/designer`}>
              <Button label="แก้ไขฟอร์ม" variant="secondary" icon={<PencilSquareIcon className="w-4 h-4" />} />
            </a>
          )}
          <button
            type="button"
            onClick={exportPdf}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary disabled:opacity-60"
          >
            {exporting ? <Spinner size="sm" /> : <DocumentArrowDownIcon className="w-4 h-4" />}
            {t("action.download_pdf")}
          </button>
        </HStack>
      </div>

      {msg && (
        <Banner
          status={msg.isError ? "error" : "success"}
          title={msg.isError ? "เกิดข้อผิดพลาด" : "สำเร็จ"}
          description={msg.text}
          isDismissable={false}
        />
      )}

      <div className="grid md:grid-cols-12 gap-5">
        <div className="md:col-span-8">
          <Card padding={5}>
            <div ref={printRef} className="cmms-print-area" style={{ background: "#fff", borderRadius: "12px", padding: 24 }}>
              <VStack gap={4}>                  <VStack gap={1} style={{ borderBottom: "2px solid var(--cmms-border)", paddingBottom: 12 }}>
                    <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "var(--cmms-text-muted)" }}>
                      CMMS-TOPPAN · {tpl.code} {tpl.rev}
                    </Text>
                  <Heading level={3} style={{ color: "var(--cmms-text-primary)" }}>{tpl.title}</Heading>
                  {tpl.description && (
                    <Text type="body" size="sm" style={{ color: "var(--cmms-text-secondary)" }}>{tpl.description}</Text>
                  )}
                </VStack>
                {schema.length === 0 ? (
                  <Text type="body" style={{ color: "var(--cmms-text-muted)" }}>
                    แบบฟอร์มนี้ยังไม่มีฟิลด์ — กลับไปหน้าออกแบบเพื่อเพิ่มฟิลด์ก่อน
                  </Text>
                ) : (
                  schema.map((f, i) => renderField(f, i))
                )}
              </VStack>
            </div>

            <HStack gap={2} wrap="wrap" style={{ marginTop: 20 }}>
              <Button
                label={saving ? "กำลังบันทึก..." : "บันทึกผลการกรอก"}
                variant="primary"
                isDisabled={saving}
                isLoading={saving}
                icon={<CheckCircleIcon className="w-4 h-4" />}
                onClick={saveSubmission}
              />
              <Button
                label={exporting ? "กำลังสร้าง PDF..." : "สร้าง PDF"}
                variant="secondary"
                isDisabled={exporting}
                isLoading={exporting}
                icon={<DocumentArrowDownIcon className="w-4 h-4" />}
                onClick={exportPdf}
              />
            </HStack>
          </Card>
        </div>

        <div className="md:col-span-4">
          <Card padding={5}>
            <VStack gap={3}>
              <Heading level={4}>ผลการกรอกล่าสุด</Heading>
              {submissions.length === 0 && (
                <Text type="body" size="sm" style={{ color: "var(--cmms-text-muted)" }}>
                  ยังไม่มีผู้กรอกแบบฟอร์มนี้
                </Text>
              )}
              {submissions.map((s) => (
                <div key={s.id} className="rounded-lg border border-[var(--cmms-border)] p-3">
                  <HStack gap={2} vAlign="center" wrap="wrap" style={{ justifyContent: "space-between" }}>
                  <VStack gap={1}>
                    <Text type="body" size="sm" style={{ color: "var(--cmms-text-primary)" }}>
                      {s.created_name || "ไม่ระบุชื่อ"}
                    </Text>
                    <Text type="body" size="sm" style={{ color: "var(--cmms-text-muted)" }}>
                      {s.created_at}
                    </Text>
                  </VStack>
                    {canDesign && (
                      <button type="button" onClick={() => deleteSubmission(s.id)} className="text-[var(--cmms-text-muted)] hover:text-[var(--cmms-accent-danger)]" aria-label="ลบผลการกรอก">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </HStack>
                </div>
              ))}
            </VStack>
          </Card>
        </div>
      </div>
    </VStack>
  );
}
