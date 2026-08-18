"use client";

import { useState, useEffect, useRef } from "react";
import { useToast } from "@/components/ToastProvider";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { DialogHeader } from "@astryxdesign/core/Dialog";
import AnimatedDialog from "@/components/AnimatedDialog";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { useRouter } from "next/navigation";
import {
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import { enqueue, pendingCount, subscribeOnline } from "@/lib/offlineQueue";
import { tliff, useLiffLang } from "@/lib/i18n-liff";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import PMChecksheetDocument from "@/components/PMChecksheetDocument";

interface CheckItem {
  id: string;
  task: string;
  type: "check" | "value";
  status: "pass" | "fail" | null;
  value: string;
  note: string;
}

// Default checklist ตามความถี่ของแผน PM (กรณีแผนยังไม่มี checklist ใน DB)
function defaultChecklist(frequencyType: string): CheckItem[] {
  const base: CheckItem[] = [
    { id: "c1", task: "ตรวจสอบสภาพโดยรวมของเครื่องจักร (ไม่มีรอยรั่ว เสียงผิดปกติ)", type: "check", status: null, value: "", note: "" },
    { id: "c2", task: "ตรวจสอบระดับน้ำมัน / สารหล่อลื่นให้อยู่ในเกณฑ์ที่กำหนด", type: "check", status: null, value: "", note: "" },
    { id: "c3", task: "ตรวจสอบสายพาน สายไฟ และจุดเชื่อมต่อ", type: "check", status: null, value: "", note: "" },
  ];
  if (frequencyType === "daily" || frequencyType === "weekly") {
    return [
      ...base,
      { id: "c4", task: "ทำความสะอาดและตรวจสอบบริเวณทำงาน", type: "check", status: null, value: "", note: "" },
    ];
  }
  return [
    ...base,
    { id: "c4", task: "ตรวจสอบความแม่นยำของชิ้นส่วนกลไก", type: "check", status: null, value: "", note: "" },
    { id: "c5", task: "บันทึกค่าอุณหภูมิมอเตอร์ (องศาเซลเซียส)", type: "value", status: null, value: "", note: "" },
    { id: "c6", task: "ตรวจสอบระบบความปลอดภัยและป้ายเตือน", type: "check", status: null, value: "", note: "" },
  ];
}

export default function PMChecksheetPage() {
  useLiffLang(); // re-render ตามภาษาที่สลับ
  const router = useRouter();
  const [plans, setPlans] = useState<{ value: string; label: string; raw: any }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [assetName, setAssetName] = useState("");
  const [checklist, setChecklist] = useState<CheckItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const reportRef = useRef<HTMLDivElement | null>(null);
  const { showToast } = useToast();

  // ── ลายเซ็นยืนยัน: ผู้ตรวจเช็ค (ช่าง) + ผู้ควบคุมเครื่อง ──
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [inspectorSig, setInspectorSig] = useState<string>("");
  const [operatorSig, setOperatorSig] = useState<string>("");
  const [operatorName, setOperatorName] = useState<string>("");
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const inspectorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const operatorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingSigRef = useRef<"inspector" | "operator" | null>(null);

  useEffect(() => {
    setPending(pendingCount());
    const off = subscribeOnline(() => setPending(pendingCount()));
    return off;
  }, []);
  // QR scan prefill: ?asset_code= / ?plan_id=
  const qrPrefillRef = useRef<{ assetCode?: string; planId?: string } | null>(null);

  // ผู้ทำรายการ = ผู้ใช้ที่ login จริง (จาก session)
  useEffect(() => {
    fetch("/api/v1/menu_permissions.php", { headers: { "ngrok-skip-browser-warning": "1" } })
      .then((res) => res.json())
      .then((json) => {
        if (json?.user?.id) setCurrentUserId(Number(json.user.id));
        if (json?.user?.full_name) setCurrentUserName(String(json.user.full_name));
      })
      .catch(() => { /* offline */ });
  }, []);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const assetCode = p.get("asset_code")?.trim().toUpperCase();
      const planId = p.get("plan_id")?.trim();
      if (assetCode || planId) qrPrefillRef.current = { assetCode, planId };
    } catch { /* ignore */ }
  }, []);

  const fetchPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/pm_am.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const open = json.filter((p: any) => p.status === "pending" || p.status === "in_progress");

        // ถ้ามาจาก QR: filter เฉพาะเครื่องที่สแกน หรือเลือกแผนตรงตาม plan_id
        let list = open;
        const prefill = qrPrefillRef.current;
        if (prefill?.planId) {
          list = open.filter((p: any) => String(p.id) === prefill.planId);
        } else if (prefill?.assetCode) {
          try {
            const assetRes = await fetch("/api/v1/index.php?resource=assets", { headers: { "ngrok-skip-browser-warning": "1" } });
            const assetJson = await assetRes.json();
            const asset = (assetJson.data || []).find((a: any) => a.code === prefill.assetCode);
            if (asset) {
              list = open.filter((p: any) => Number(p.asset_id) === Number(asset.id));
              if (list.length > 0) {
                // เลือกแผนแรกของเครื่องนั้นอัตโนมัติ (ไม่รอ state plans)
                setSelectedPlanId(String(list[0].id));
                applyPlan(list[0]);
              }
            }
          } catch { /* ignore */ }
        }

        setPlans(
          list.map((p: any) => ({
            value: String(p.id),
            label: `${p.title || `แผน PM #${p.id}`}${p.due_date ? ` (ครบกำหนด ${p.due_date})` : ""}`,
            raw: p,
          }))
        );
        if (list.length === 0 && prefill?.assetCode) {
          setError(`เครื่อง ${prefill.assetCode} ไม่มีแผน PM ที่รอดำเนินการ (pending / in_progress)`);
        }
      }
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดแผน PM ได้ กรุณาลองใหม่อีกครั้ง");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const applyPlan = async (plan: any) => {
    setSelectedPlan(plan);
    try {
      // หาชื่อเครื่องจักรจาก assets
      const assetRes = await fetch("/api/v1/index.php?resource=assets", { headers: { "ngrok-skip-browser-warning": "1" } });
      const assetJson = await assetRes.json();
      const asset = (assetJson.data || []).find((a: any) => a.id === plan.asset_id);
      setAssetName(asset ? `${asset.name}${asset.code ? ` (${asset.code})` : ""}` : "ไม่ระบุ");

      // ใช้ checklist จาก DB (JSON) หรือสร้าง default
      let items: CheckItem[] = [];
      if (plan.checklist) {
        try {
          const parsed = typeof plan.checklist === "string" ? JSON.parse(plan.checklist) : plan.checklist;
          if (Array.isArray(parsed)) {
            items = parsed.map((t: any, i: number) => ({
              id: t.id || `c${i + 1}`,
              task: typeof t === "string" ? t : t.task,
              type: t.type === "value" ? "value" : "check",
              status: null,
              value: "",
              note: "",
            }));
          }
        } catch (e) { /* fall through */ }
      }
      if (items.length === 0) items = defaultChecklist(plan.frequency_type);
      setChecklist(items);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectPlan = async (value: string) => {
    setSelectedPlanId(value);
    const plan = plans.find((p) => p.value === value)?.raw;
    if (!plan) return;
    await applyPlan(plan);
  };

  const handleCheckAll = () => {
    setChecklist((prev) =>
      prev.map((item) => (item.type === "check" ? { ...item, status: "pass" as const } : item))
    );
  };

  const handleStatus = (id: string, status: "pass" | "fail") => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
  };

  const handleValue = (id: string, value: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, value, status: value ? "pass" as const : null } : item))
    );
  };

  const handleNote = (id: string, note: string) => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, note } : item)));
  };

  // ── วาดลายเซ็นบน canvas (เมาส์/นิ้ว) — แยกช่องผู้ตรวจเช็คกับผู้ควบคุมเครื่อง ──
  const startSig = (which: "inspector" | "operator") => (e: any) => {
    drawingSigRef.current = which;
    drawSig(e);
  };
  const stopSig = () => {
    const which = drawingSigRef.current;
    drawingSigRef.current = null;
    if (!which) return;
    const canvas = which === "inspector" ? inspectorCanvasRef.current : operatorCanvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL();
      if (which === "inspector") setInspectorSig(dataUrl);
      else setOperatorSig(dataUrl);
    }
  };
  const drawSig = (e: any) => {
    const which = drawingSigRef.current;
    if (!which) return;
    const canvas = which === "inspector" ? inspectorCanvasRef.current : operatorCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "var(--cmms-text-primary)";
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const clearSig = (which: "inspector" | "operator") => {
    const canvas = which === "inspector" ? inspectorCanvasRef.current : operatorCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (which === "inspector") setInspectorSig("");
    else setOperatorSig("");
  };

  const allFilled =
    checklist.length > 0 &&
    checklist.every((item) => (item.type === "value" ? item.value.trim() !== "" : item.status !== null));

  // กด "บันทึกผลการทำ PM" → เปิดช่องเซ็นลายเซ็นก่อน แล้วค่อยบันทึกจริง
  const handleSubmit = () => {
    if (!selectedPlan) return;
    setSigModalOpen(true);
  };

  // ดาวน์โหลดใบตรวจเช็ค PM เป็น PDF (เช็กลิสต์ + ผล + ลายเซ็น 2 ช่อง)
  const handleDownloadPdf = async () => {
    if (!reportRef.current || pdfBusy || !selectedPlan) return;
    setPdfBusy(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pw) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(img, "PNG", 0, position, pw, imgHeight);
      heightLeft -= ph;
      while (heightLeft > 0) {
        position -= ph;
        pdf.addPage();
        pdf.addImage(img, "PNG", 0, position, pw, imgHeight);
        heightLeft -= ph;
      }
      pdf.save(`PM-CHECKSHEET-${selectedPlan.id}-${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast("success", "ดาวน์โหลดใบตรวจเช็ค PM เรียบร้อย");
    } catch (e) {
      console.error(e);
      showToast("error", "ไม่สามารถสร้าง PDF ได้ในเบราว์เซอร์นี้ — ลองใช้ปุ่มพิมพ์ของเบราว์เซอร์แทน");
    }
    setPdfBusy(false);
  };

  const confirmSave = async () => {
    if (!selectedPlan) return;
    if (!inspectorSig.trim() || !operatorSig.trim()) {
      showToast("error", "กรุณาเซ็นครบทั้ง 2 ช่องก่อนบันทึก (ผู้ตรวจเช็ค และ ผู้ควบคุมเครื่อง)");
      return;
    }
    if (!operatorName.trim()) {
      showToast("error", "กรุณากรอกชื่อผู้ควบคุมเครื่อง");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      const failCount = checklist.filter((i) => i.status === "fail").length;
      const body = {
        status: "completed",
        completed_at: now,
        last_done_date: now.slice(0, 10),
        completed_by: currentUserId || null,
        inspector_signature: inspectorSig,
        operator_signature: operatorSig,
        operator_name: operatorName.trim(),
        signed_at: now,
        checklist: JSON.stringify(
          checklist.map((i) => ({ task: i.task, type: i.type, status: i.status, value: i.value, note: i.note }))
        ),
        notes: failCount > 0 ? `พบรายการไม่ผ่าน ${failCount} รายการ` : "ผ่านทุกรายการ",
      };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueue({ kind: "pm_checksheet", label: `เช็คชีท PM: ${selectedPlan.title}`, url: `/api/v1/pm_am.php?id=${selectedPlan.id}`, method: "PUT", body });
        setPending(pendingCount());
        setSubmitting(false);
        setSigModalOpen(false);
        showToast("success", `บันทึกผล PM “${selectedPlan.title}” ไว้ในเครื่องแล้ว — จะส่งอัตโนมัติเมื่อกลับมาออนไลน์`);
        setSelectedPlanId("");
        setSelectedPlan(null);
        setChecklist([]);
        setAssetName("");
        return;
      }
      const res = await fetch(`/api/v1/pm_am.php?id=${selectedPlan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        showToast("success", `บันทึกผลการทำ PM ${selectedPlan.title} เรียบร้อยแล้ว`);
        setSigModalOpen(false);
        // รีเซ็ตฟอร์ม
        setSelectedPlanId("");
        setSelectedPlan(null);
        setChecklist([]);
        setAssetName("");
        fetchPlans();
      } else {
        setError(json.error || "ไม่สามารถบันทึกผลได้");
      }
    } catch (e) {
      console.error(e);
      // เน็ตหลุดระหว่างส่ง → เก็บในเครื่อง รอส่งอัตโนมัติ
      enqueue({
        kind: "pm_checksheet",
        label: `เช็คชีท PM: ${selectedPlan.title}`,
        url: `/api/v1/pm_am.php?id=${selectedPlan.id}`,
        method: "PUT",
        body: {
          status: "completed",
          completed_at: new Date().toISOString().slice(0, 19).replace("T", " "),
          last_done_date: new Date().toISOString().slice(0, 10),
          completed_by: currentUserId || null,
          inspector_signature: inspectorSig,
          operator_signature: operatorSig,
          operator_name: operatorName.trim(),
          signed_at: new Date().toISOString().slice(0, 19).replace("T", " "),
          checklist: JSON.stringify(
            checklist.map((i) => ({ task: i.task, type: i.type, status: i.status, value: i.value, note: i.note }))
          ),
          notes: checklist.filter((i) => i.status === "fail").length > 0 ? `พบรายการไม่ผ่าน ${checklist.filter((i) => i.status === "fail").length} รายการ` : "ผ่านทุกรายการ",
        },
      });
      setPending(pendingCount());
      setSigModalOpen(false);
      showToast("success", `บันทึกผล PM “${selectedPlan.title}” ไว้ในเครื่องแล้ว — จะส่งอัตโนมัติเมื่อกลับมาออนไลน์`);
      setSelectedPlanId("");
      setSelectedPlan(null);
      setChecklist([]);
      setAssetName("");
    }
    setSubmitting(false);
  };

  const renderSigCanvas = (which: "inspector" | "operator") => (
    <canvas
      ref={which === "inspector" ? inspectorCanvasRef : operatorCanvasRef}
      width={280}
      height={90}
      onMouseDown={startSig(which)}
      onMouseUp={stopSig}
      onMouseMove={drawSig}
      onTouchStart={startSig(which)}
      onTouchEnd={stopSig}
      onTouchMove={drawSig}
      style={{
        border: "2px dashed var(--cmms-primary)",
        borderRadius: 8,
        background: "#FFFFFF",
        cursor: "crosshair",
        touchAction: "none",
        width: "100%",
      }}
    />
  );

  if (loading) {
    return (
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดแผน PM...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="Error" description={error} isDismissable={false} />}

      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>PM CHECKSHEET · CMMS-TOPPAN</Text>
          <Heading level={2} style={{ color: "#fff" }}>{tliff("liff.checksheet_title")}</Heading>

          {pending > 0 && (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 14px", borderRadius: 8,
                background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)",
                fontSize: "0.85rem", fontWeight: 600, width: "fit-content",
              }}
            >
              <span className="cmms-status-dot warn" style={{ display: "inline-block" }} />
              {tliff("liff.checksheet_pending").replace("{n}", String(pending))}
            </div>
          )}
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {tliff("liff.checksheet_desc")}
          </Text>
        </VStack>
        {plans.length > 0 && (
          <button
            type="button"
            disabled={!selectedPlan}
            onClick={handleCheckAll}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-success disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircleIcon className="w-4 h-4" />
            {tliff("liff.checksheet_check_all")}
          </button>
        )}
      </div>

      {/* เลือกแผน */}
      <Card padding={4}>
        <Field inputID="pm-plan" label="เลือกแผน PM ที่ต้องการทำเช็คชีท *" isRequired>
          <div style={{ width: "100%", maxWidth: 560 }}>
            <Selector
              label="เลือกแผน PM"
              isLabelHidden
              placeholder={plans.length === 0 ? "ไม่มีแผน PM ที่รอดำเนินการ" : "เลือกแผน PM..."}
              value={selectedPlanId}
              onChange={handleSelectPlan}
              options={plans}
              isDisabled={plans.length === 0}
            />
          </div>
        </Field>
        {plans.length === 0 && (
          <Text type="body" size="sm" color="secondary">ไม่พบแผน PM ที่รอดำเนินการ (pending / in_progress)</Text>
        )}
      </Card>

      {selectedPlan && (
        <div style={{ maxWidth: 860 }}>
          <Card padding={0} style={{ overflow: "hidden" }}>
            {/* หัวแผน */}
            <div style={{ padding: "16px 24px", backgroundColor: "var(--color-muted)", borderBottom: "1px solid var(--color-border)" }}>
              <HStack gap={6} hAlign="between" wrap="wrap">
                <VStack gap={1}>
                  <HStack gap={2} vAlign="center">
                    <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>
                      {selectedPlan.frequency_type?.toUpperCase()}
                    </span>
                    <span className="cmms-status warn"><span className="cmms-status-dot" />{selectedPlan.status === "in_progress" ? "กำลังดำเนินการ" : "รอดำเนินการ"}</span>
                  </HStack>
                  <Text type="body" weight="bold">{selectedPlan.title}</Text>
                  <Text type="body" size="sm" color="secondary">เครื่องจักร: {assetName} {selectedPlan.due_date ? `• ครบกำหนด: ${selectedPlan.due_date}` : ""}</Text>
                  {!!Number(selectedPlan.is_outsource) && (
                    <span className="cmms-andon-chip" style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)", width: "fit-content" }}>
                      งานภายนอก · {selectedPlan.outsource_by || "ไม่ระบุบริษัท"}
                      {Number(selectedPlan.cost_outsource) > 0 ? ` · ${Number(selectedPlan.cost_outsource).toLocaleString("th-TH")} บาท` : ""}
                    </span>
                  )}
                </VStack>
                <VStack gap={1} hAlign="end">
                  <Text type="body" size="sm" color="secondary" weight="semibold">ความก้าวหน้า</Text>
                  <Text type="body" weight="bold">{checklist.filter((i) => (i.type === "value" ? i.value.trim() !== "" : i.status !== null)).length} / {checklist.length} ข้อ</Text>
                </VStack>
              </HStack>
            </div>

            {/* รายการตรวจ */}
            <VStack gap={0}>
              {checklist.map((item, index) => {
                const isNg = item.status === "fail";
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: 20,
                      borderBottom: index < checklist.length - 1 ? "1px solid var(--color-border)" : "none",
                      backgroundColor: isNg ? "var(--color-error-wash)" : item.status === "pass" ? "var(--color-success-wash)" : "transparent",
                    }}
                  >
                    <VStack gap={3}>
                      <HStack hAlign="between" vAlign="start" gap={3}>
                        <HStack gap={3} vAlign="start">
                          <div style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: "var(--color-muted)", color: "var(--color-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", flexShrink: 0 }}>
                            {index + 1}
                          </div>
                          <VStack gap={1}>
                            <Text type="body" weight="semibold">{item.task}</Text>
                            {item.type === "value" && (
                              <div style={{ marginTop: 6, width: 200 }}>
                                <TextInput
                                  label="ค่า"
                                  isLabelHidden
                                  placeholder="ระบุค่าตัวเลข..."
                                  value={item.value}
                                  onChange={(v) => handleValue(item.id, v)}
                                />
                              </div>
                            )}
                          </VStack>
                        </HStack>

                        {item.type === "check" && (
                          <HStack gap={2}>
                            <button
                              onClick={() => handleStatus(item.id, "pass")}
                              style={{
                                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10,
                                background: item.status === "pass" ? "var(--cmms-success)" : "var(--color-surface)",
                                color: item.status === "pass" ? "#fff" : "var(--color-secondary)",
                                border: `1px solid ${item.status === "pass" ? "transparent" : "var(--color-border)"}`,
                                fontWeight: 600, cursor: "pointer", boxShadow: item.status === "pass" ? "0 4px 12px rgba(5,150,105,0.3)" : "none",
                              }}
                            >
                              <CheckCircleIcon className="w-4 h-4" /> ผ่าน
                            </button>
                            <button
                              onClick={() => handleStatus(item.id, "fail")}
                              style={{
                                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10,
                                background: item.status === "fail" ? "var(--cmms-danger)" : "var(--color-surface)",
                                color: item.status === "fail" ? "#fff" : "var(--color-secondary)",
                                border: `1px solid ${item.status === "fail" ? "transparent" : "var(--color-border)"}`,
                                fontWeight: 600, cursor: "pointer", boxShadow: item.status === "fail" ? "0 4px 12px rgba(220,38,38,0.3)" : "none",
                              }}
                            >
                              <XCircleIcon className="w-4 h-4" /> ไม่ผ่าน
                            </button>
                          </HStack>
                        )}
                      </HStack>

                      {isNg && (
                        <div style={{ marginLeft: 40, padding: 14, backgroundColor: "var(--color-surface)", borderRadius: 8, border: "1px dashed var(--color-error)" }}>
                          <VStack gap={3}>
                            <HStack gap={2} vAlign="center">
                              <ExclamationTriangleIcon className="w-4 h-4" style={{ color: "var(--color-error)" }} />
                              <Text type="body" weight="semibold" style={{ color: "var(--color-error)" }}>พบความผิดปกติ (NG) — ระบุรายละเอียด</Text>
                            </HStack>
                            <FormLayout>
                              <Field inputID="ng-note" label="สาเหตุที่พบ / หมายเหตุ *">
                                <TextArea
                                  label="สาเหตุที่พบ / หมายเหตุ"
                                  placeholder="อธิบายอาการผิดปกติที่พบ..."
                                  value={item.note}
                                  onChange={(v) => handleNote(item.id, v)}
                                />
                              </Field>
                            </FormLayout>
                          </VStack>
                        </div>
                      )}
                    </VStack>
                  </div>
                );
              })}
            </VStack>

            {/* footer */}
            <div style={{ padding: 20, backgroundColor: "var(--color-muted)", borderTop: "1px solid var(--color-border)" }}>
              <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
                <Text type="body" color="secondary">ตรวจสอบให้ครบทุกข้อก่อนบันทึก</Text>
                <HStack gap={2} wrap="wrap">
                  <button
                    type="button"
                    disabled={pdfBusy}
                    onClick={handleDownloadPdf}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white cmms-btn-success disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                    {pdfBusy ? "กำลังสร้าง PDF..." : "ดาวน์โหลด PDF ใบตรวจเช็ค"}
                  </button>
                  <button
                    type="button"
                    disabled={submitting || !allFilled}
                    onClick={handleSubmit}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ClipboardDocumentCheckIcon className="w-4 h-4" />
                    {submitting ? "กำลังส่งข้อมูล..." : "บันทึกผลการทำ PM"}
                  </button>
                </HStack>
              </HStack>
            </div>
          </Card>

          {/* เอกสาร PDF ซ่อนไว้นอกจอ (capture ด้วย html2canvas) */}
          <div ref={reportRef} style={{ position: "absolute", left: -9999, top: 0, width: 794, zIndex: -1 }}>
            <PMChecksheetDocument
              data={{
                id: selectedPlan.id,
                title: selectedPlan.title || "ไม่ระบุ",
                assetName: assetName || "ไม่ระบุ",
                frequency: selectedPlan.frequency_type || "monthly",
                dueDate: selectedPlan.due_date || "-",
                assignee: selectedPlan.assigned_name || "-",
                checklist,
                inspectorSignature: inspectorSig,
                operatorSignature: operatorSig,
                operatorName,
                inspectorName: !!Number(selectedPlan.is_outsource) ? (selectedPlan.outsource_by || "บริษัทภายนอก") : currentUserName,
                doneAt: new Date().toLocaleDateString("th-TH"),
                notes: "",
              }}
            />
          </div>
        </div>
      )}

      {/* ── ลายเซ็นยืนยันการทำ PM: ผู้ตรวจเช็ค + ผู้ควบคุมเครื่อง ── */}
      <AnimatedDialog open={sigModalOpen && !!selectedPlan} onClose={() => { if (!submitting) setSigModalOpen(false); }}>
          <DialogHeader title={`ลงนามยืนยันการทำ PM: ${selectedPlan.title}`} />
          <VStack gap={4} style={{ padding: 24 }}>
            <Grid columns={2} gap={4}>
              <Field label={!!Number(selectedPlan.is_outsource) ? `ลายเซ็นผู้ตรวจเช็ค (บริษัทภายนอก: ${selectedPlan.outsource_by || "-"}) *` : `ลายเซ็นผู้ตรวจเช็ค (ผู้ปฏิบัติงาน: ${currentUserName || "-"}) *`} inputID="inspectorSigCanvas">
                <VStack gap={1}>
                  {renderSigCanvas("inspector")}
                  <HStack hAlign="between" vAlign="center">
                    <Text type="body" size="sm" color="secondary">วาดด้วยเมาส์/นิ้ว</Text>
                    <button type="button" onClick={() => clearSig("inspector")} className="text-xs text-slate-500 underline">ล้าง</button>
                  </HStack>
                </VStack>
              </Field>

              <Field label="ลายเซ็นผู้ควบคุมเครื่อง *" inputID="operatorSigCanvas">
                <VStack gap={1}>
                  {renderSigCanvas("operator")}
                  <HStack hAlign="between" vAlign="center">
                    <Text type="body" size="sm" color="secondary">วาดด้วยเมาส์/นิ้ว</Text>
                    <button type="button" onClick={() => clearSig("operator")} className="text-xs text-slate-500 underline">ล้าง</button>
                  </HStack>
                  <TextInput
                    label="ชื่อผู้ควบคุมเครื่อง"
                    isLabelHidden
                    placeholder="กรอกชื่อผู้ควบคุมเครื่อง..."
                    value={operatorName}
                    onChange={setOperatorName}
                  />
                </VStack>
              </Field>
            </Grid>

            {(!inspectorSig.trim() || !operatorSig.trim() || !operatorName.trim()) && (
              <HStack gap={2} vAlign="center">
                <ExclamationTriangleIcon className="w-4 h-4" style={{ color: "var(--cmms-danger)" }} />
                <Text type="body" size="sm" weight="semibold" style={{ color: "var(--cmms-danger)" }}>
                  กรุณาเซ็นครบทั้ง 2 ช่อง และกรอกชื่อผู้ควบคุมเครื่อง ก่อนบันทึกผล
                </Text>
              </HStack>
            )}

            {inspectorSig.trim() && operatorSig.trim() && (
              <HStack gap={3} vAlign="center">
                {inspectorSig && (
                  <VStack gap={1}>
                    <Text type="body" size="sm" color="secondary">ผู้ตรวจเช็ค</Text>
                    <img src={inspectorSig} alt="ลายเซ็นผู้ตรวจเช็ค" style={{ height: 44, background: "#fff", borderRadius: 6, border: "1px solid var(--cmms-border)" }} />
                  </VStack>
                )}
                {operatorSig && (
                  <VStack gap={1}>
                    <Text type="body" size="sm" color="secondary">ผู้ควบคุมเครื่อง ({operatorName || "-"})</Text>
                    <img src={operatorSig} alt="ลายเซ็นผู้ควบคุมเครื่อง" style={{ height: 44, background: "#fff", borderRadius: 6, border: "1px solid var(--cmms-border)" }} />
                  </VStack>
                )}
              </HStack>
            )}

            <HStack hAlign="end" gap={2}>
              <button
                type="button"
                onClick={() => setSigModalOpen(false)}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmSave}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ClipboardDocumentCheckIcon className="w-4 h-4" />
                {submitting ? "กำลังบันทึก..." : "ยืนยันและบันทึกผล PM"}
              </button>
            </HStack>
          </VStack>
        </AnimatedDialog>
    </VStack>
  );
}
