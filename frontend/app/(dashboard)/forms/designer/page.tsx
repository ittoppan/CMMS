"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/PageShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  ArrowRight,
  Plus,
  Trash2,
} from "lucide-react";
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
          i18n: { location: "/assets/lang/" },
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
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "อนุมัติ & เอกสาร", href: "/forms" },
        { label: hero.title },
      ]}
      title={hero.title}
      description={hero.desc}
      actions={
        <>
          <a href="/forms" className={buttonVariants({ variant: "secondary" })}>
            <ArrowRight className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            {t("action.back")}
          </a>
          <Button onClick={saveForm} disabled={saving}>
            {saving ? <Spinner size={16} label="" /> : <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
            {t("action.save")}
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

      {/* ═══ Meta ของแบบฟอร์ม ═══ */}
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลแบบฟอร์ม</CardTitle>
          <CardDescription>โหลดแบบฟอร์มเดิมเพื่อแก้ไข หรือตั้งชื่อแบบฟอร์มใหม่</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1 space-y-1.5">
                <Label>โหลดแบบฟอร์มเดิม</Label>
                <Select
                  value={String(selectedId)}
                  onValueChange={(v: string) => handleSelect(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="— สร้างแบบฟอร์มใหม่ —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">— สร้างแบบฟอร์มใหม่ —</SelectItem>
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={String(tpl.id)}>
                        {`${tpl.code} ${tpl.rev} — ${tpl.title}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <div className="w-[140px] space-y-1.5">
                  <Label htmlFor="fb-code">รหัส (F-EN-xx)</Label>
                  <Input id="fb-code" value={code} onChange={(e) => setCode(e.target.value)} />
                </div>
                <div className="w-[120px] space-y-1.5">
                  <Label htmlFor="fb-rev">REV</Label>
                  <Input id="fb-rev" value={rev} onChange={(e) => setRev(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-12">
              <div className="space-y-1.5 md:col-span-6">
                <Label htmlFor="fb-title">ชื่อแบบฟอร์ม</Label>
                <Input id="fb-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5 md:col-span-6">
                <Label htmlFor="fb-desc">คำอธิบาย (ขึ้นหัว PDF)</Label>
                <Textarea id="fb-desc" rows={1} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>

            {selectedId > 0 && (
              <div className="flex gap-2">
                {savedId !== null && (
                  <a href={`/forms/run/${savedId}`} className={buttonVariants({ variant: "primary", size: "sm" })}>
                    เปิดกรอกแบบฟอร์ม
                  </a>
                )}
                <Button variant="ghost" size="sm" onClick={deleteForm} className="gap-1.5">
                  <Trash2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                  ลบแบบฟอร์มนี้
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ═══ พื้นที่ออกแบบ (formBuilder) ═══ */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>พื้นที่ออกแบบ (ลากฟิลด์จากซ้าย)</CardTitle>
          <div className="flex items-center gap-2">
            {!builderReady && <Spinner size={16} label="" />}
            {builderReady && (
              <button
                type="button"
                onClick={() => { fbCall("formData", ""); }}
                className="text-sm text-muted-foreground underline hover:text-foreground"
              >
                ล้างฟอร์ม
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            เลือกฟิลด์ แล้วกดรูปเฟืองเพื่อตั้งค่า — ตรง &quot;ข้อมูลจากฐานข้อมูล&quot; เลือกแหล่งข้อมูล (เครื่องจักร / อะไหล่ / ผู้ใช้ / แผนก) ฟิลด์นั้นจะกลายเป็น dropdown ในหน้าอนุมัติให้เลือกค่าจริง
          </p>
          <div
            ref={builderRef}
            className="cmms-formbuilder-stage"
            style={{ minHeight: "480px", border: "1px solid var(--cmms-border)", borderRadius: "12px", padding: "16px", background: "var(--cmms-bg-wash)" }}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
