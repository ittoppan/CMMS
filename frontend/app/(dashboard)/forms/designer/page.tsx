"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import {
  CheckCircleIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  DocumentTextIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import $ from "jquery";
import { loadFormBuilder } from "@/lib/form-builder-loader";
import { usePageHero, t } from "@/lib/i18n";

interface TemplateSummary {
  id: number;
  code: string;
  title: string;
  rev: string;
  description: string;
  updated_at: string;
  submission_count: number;
}

export default function FormDesignerPage() {
  const hero = usePageHero("forms/designer", {
    eyebrow: "FORM DESIGNER · CMMS-TOPPAN",
    title: "ออกแบบแบบฟอร์มดิจิทัล",
    desc: "ลาก-วางสร้างแบบฟอร์ม F-EN ผูกข้อมูลจริงจากฐานข้อมูล แล้วพิมพ์เป็น PDF",
  });

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  // ฟอร์ม meta
  const [selectedId, setSelectedId] = useState(0);
  const [code, setCode] = useState("F-EN-");
  const [title, setTitle] = useState("");
  const [rev, setRev] = useState("REV.00");
  const [description, setDescription] = useState("");

  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [builderReady, setBuilderReady] = useState(false);

  const builderRef = useRef<HTMLDivElement | null>(null);

  // formBuilder plugin เก็บ instance ไว้ใน $(el).data('fbInstance') — เรียกเมธอดผ่าน string API
  const fbCall = (method: string, ...args: unknown[]) => {
    if (!builderRef.current) return undefined;
    try {
      return ($(builderRef.current) as any).formBuilder(method, ...args);
    } catch (e) {
      console.error("formBuilder call error", method, e);
      return undefined;
    }
  };

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch("/api/v1/form_templates.php", { credentials: "include" });
      const json = await res.json();
      if (json.status === "success") {
        setTemplates(json.data || []);
        if (!json.can_design) {
          setMsg({ text: "คุณไม่มีสิทธิ์ออกแบบแบบฟอร์ม — เฉพาะผู้ดูแลระบบเท่านั้น", isError: true });
        }
      } else {
        setMsg({ text: json.message || "โหลดรายการแบบฟอร์มไม่สำเร็จ", isError: true });
      }
    } catch (e) {
      console.error("Fetch templates error", e);
      setMsg({ text: "ไม่สามารถเชื่อมต่อระบบได้", isError: true });
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  // init formBuilder
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadFormBuilder();
        if (cancelled || !builderRef.current) return;
        $(builderRef.current).formBuilder({
          formData: "",
          controlOrder: [
            "header", "paragraph", "text", "textarea", "number", "date",
            "select", "checkbox-group", "radio-group", "autocomplete", "file", "hidden",
          ],
          disableFields: ["button"],
          // attribute "ข้อมูลจากฐานข้อมูล" (data-bind) — โผล่ในหน้าตั้งค่าทุกฟิลด์
          typeUserAttrs: {
            "*": {
              "data-bind": {
                label: "ข้อมูลจากฐานข้อมูล",
                type: "select",
                options: {
                  "": "ไม่ผูกข้อมูล (พิมพ์เอง)",
                  machine: "ทะเบียนเครื่องจักร",
                  spare_part: "คลังอะไหล่",
                  user: "ผู้ใช้ระบบ",
                  department: "แผนก",
                },
                value: "",
              },
            },
          },
          disabledAttrs: ["access", "className", "subtype", "description", "multiple", "toggle", "other"],
          disableInjectedStyle: true,
          notify: {
            error: () => {},
            success: () => {},
          },
        });
        if (!cancelled) setBuilderReady(true);
      } catch (e) {
        console.error("formBuilder init error", e);
        if (!cancelled) setMsg({ text: "โหลดตัวออกแบบฟอร์มไม่สำเร็จ — ลองรีเฟรชหน้านี้", isError: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadTemplate = useCallback(async (id: number) => {
    if (!builderRef.current) return;
    setMsg(null);
    setSavedId(null);
    try {
      const res = await fetch(`/api/v1/form_templates.php?id=${id}`, { credentials: "include" });
      const json = await res.json();
      if (json.status !== "success" || !json.data) {
        setMsg({ text: json.message || "โหลดแบบฟอร์มไม่สำเร็จ", isError: true });
        return;
      }
      const row = json.data;
      setCode(row.code);
      setTitle(row.title);
      setRev(row.rev);
      setDescription(row.description || "");
      fbCall("formData", row.schema || "");
    } catch (e) {
      console.error("Load template error", e);
      setMsg({ text: "โหลดแบบฟอร์มไม่สำเร็จ", isError: true });
    }
  }, []);

  const handleSelect = useCallback(
    (id: number) => {
      setSelectedId(id);
      if (id > 0) loadTemplate(id);
      else {
        setCode("F-EN-");
        setTitle("");
        setRev("REV.00");
        setDescription("");
        setSavedId(null);
        fbCall("formData", "");
      }
    },
    [loadTemplate]
  );

  const saveForm = useCallback(async () => {
    if (!builderRef.current) return;
    setMsg(null);
    let schema = "";
    try {
      schema = String(fbCall("formData") || "");
    } catch (e) {
      console.error("Read formData error", e);
      setMsg({ text: "อ่านฟอร์มจากตัวออกแบบไม่สำเร็จ", isError: true });
      return;
    }
    if (!schema || schema.trim() === "" || schema === "[]") {
      setMsg({ text: "กรุณาลากฟิลด์เข้ามาในฟอร์มก่อนบันทึก", isError: true });
      return;
    }
    if (!title.trim()) {
      setMsg({ text: "กรุณากรอกชื่อแบบฟอร์ม", isError: true });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/v1/form_templates.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: selectedId > 0 ? selectedId : undefined,
          code: code.trim(),
          title: title.trim(),
          rev: rev.trim(),
          description: description.trim(),
          schema,
        }),
      });
      const json = await res.json();
      if (json.status === "success") {
        setSavedId(json.id);
        setSelectedId(json.id);
        setMsg({ text: "บันทึกแบบฟอร์มเรียบร้อยแล้ว — กด \"เปิดกรอก\" เพื่อทดลองใช้", isError: false });
        fetchTemplates();
      } else {
        setMsg({ text: json.message || "บันทึกไม่สำเร็จ", isError: true });
      }
    } catch (e) {
      console.error("Save template error", e);
      setMsg({ text: "ไม่สามารถเชื่อมต่อระบบได้", isError: true });
    } finally {
      setSaving(false);
    }
  }, [code, title, rev, description, selectedId, fetchTemplates]);

  const deleteForm = useCallback(async () => {
    if (!selectedId || !window.confirm("ลบแบบฟอร์มนี้และผลการกรอกทั้งหมด?")) return;
    setMsg(null);
    try {
      const res = await fetch(`/api/v1/form_templates.php?id=${selectedId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (json.status === "success") {
        setMsg({ text: "ลบแบบฟอร์มแล้ว", isError: false });
        handleSelect(0);
        fetchTemplates();
      } else {
        setMsg({ text: json.message || "ลบไม่สำเร็จ", isError: true });
      }
    } catch (e) {
      console.error("Delete template error", e);
      setMsg({ text: "ไม่สามารถเชื่อมต่อระบบได้", isError: true });
    }
  }, [selectedId, handleSelect, fetchTemplates]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>
            {hero.eyebrow}
          </Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>{hero.title}</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <DocumentTextIcon className="w-3.5 h-3.5" /> {templates.length} แบบฟอร์ม
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>{hero.desc}</Text>
        </VStack>
        <HStack gap={2} wrap="wrap">
          <a
            href="/forms"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
          >
            <ArrowRightIcon className="w-4 h-4" />
            {t("action.back")}
          </a>
          <button
            type="button"
            onClick={saveForm}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary disabled:opacity-60"
          >
            {saving ? <Spinner size="sm" /> : <CheckCircleIcon className="w-4 h-4" />}
            {t("action.save")}
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
        <Card padding={5}>
          <VStack gap={4}>
            <HStack gap={3} wrap="wrap" vAlign="end">
              <div className="flex-1 min-w-[220px]">
                <Selector
                  label="โหลดแบบฟอร์มเดิม"
                  value={String(selectedId)}
                  onChange={(v: string) => handleSelect(Number(v))}
                  options={[{ label: "— สร้างแบบฟอร์มใหม่ —", value: "0" }, ...templates.map((tpl) => ({ label: `${tpl.code} ${tpl.rev} — ${tpl.title}`, value: String(tpl.id) }))]}
                />
              </div>
              <HStack gap={2}>
                <TextInput label="รหัส (F-EN-xx)" value={code} onChange={setCode} width="xs" />
                <TextInput label="REV" value={rev} onChange={setRev} width="xs" />
              </HStack>
            </HStack>
            <div className="grid md:grid-cols-12 gap-4">
              <div className="md:col-span-6">
                <TextInput label="ชื่อแบบฟอร์ม" value={title} onChange={setTitle} />
              </div>
              <div className="md:col-span-6">
                <TextArea label="คำอธิบาย (ขึ้นหัว PDF)" value={description} onChange={setDescription} rows={1} />
              </div>
            </div>

            {selectedId > 0 && (
              <HStack gap={2}>
                {savedId !== null && (
                  <a href={`/forms/run/${savedId}`}>
                    <Button label="เปิดกรอกแบบฟอร์ม" variant="primary" size="sm" />
                  </a>
                )}
                <Button label="ลบแบบฟอร์มนี้" variant="ghost" size="sm" icon={<TrashIcon className="w-4 h-4" />} onClick={deleteForm} />
              </HStack>
            )}
          </VStack>
        </Card>
      </div>

      <Card padding={5}>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center">
            <Heading level={4}>พื้นที่ออกแบบ (ลากฟิลด์จากซ้าย)</Heading>
            {!builderReady && <Spinner size="sm" />}
            {builderReady && (
              <button type="button" onClick={() => { fbCall("formData", ""); }} className="text-sm text-[var(--cmms-text-muted)] hover:text-[var(--cmms-text-primary)] underline">
                ล้างฟอร์ม
              </button>
            )}
          </HStack>
          <Text type="body" size="sm" style={{ color: "var(--cmms-text-muted)" }}>
            เลือกฟิลด์ แล้วกดรูปเฟืองเพื่อตั้งค่า — ตรง "ข้อมูลจากฐานข้อมูล" เลือกแหล่งข้อมูล (เครื่องจักร / อะไหล่ / ผู้ใช้ / แผนก) ฟิลด์นั้นจะกลายเป็น dropdown ในหน้าอนุมัติให้เลือกค่าจริง
          </Text>
          <div
            ref={builderRef}
            className="cmms-formbuilder-stage"
            style={{ minHeight: "480px", border: "1px solid var(--cmms-border)", borderRadius: "12px", padding: "16px", background: "var(--cmms-bg-wash)" }}
          />
        </VStack>
      </Card>
    </VStack>
  );
}
