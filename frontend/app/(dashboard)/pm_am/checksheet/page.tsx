"use client";

import { useState, useEffect, useRef } from "react";
import { useToast } from "@/components/ToastProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select-native";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  TriangleAlert,
  Download,
} from "lucide-react";
import { enqueue, pendingCount, subscribeOnline, flushQueue } from "@/lib/offlineQueue";
import { tliff, useLiffLang } from "@/lib/i18n-liff";
import { serverResponds } from "@/lib/server-check";
import { snapshotSave, snapshotLoad } from "@/lib/offline-store";
import { formatClockTime, formatRelativeTime } from "@/lib/time-utils";
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

  const [flushing, setFlushing] = useState(false);
  const [flushMsg, setFlushMsg] = useState<string | null>(null);

  // banner offline + ปุ่ม "โหลดข้อมูลใหม่" (เหมือน my_tasks / repair/view / repair/request)
  const [offline, setOffline] = useState(false);
  const [onlineBack, setOnlineBack] = useState(false);
  const [retryMsg, setRetryMsg] = useState("");
  const offlineRef = useRef(false); // ติดตามว่าเคย offline → กลับ online (กัน banner เด้งหาย)
  // เวลา "อัปเดตล่าสุด" จาก snapshot — tick ทุก 30 วิ สำหรับ "กี่นาทีที่แล้ว"
  const [snapshotTime, setSnapshotTime] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);

  // ปุ่ม "ส่งงานค้างทั้งหมดตอนนี้" — กดเพื่อ flush คิวทันที (กลไกเดียวกับหน้าแจ้งซ่อม)
  const handleSendNow = async () => {
    if (!navigator.onLine) {
      setFlushMsg(tliff("liff.checksheet_send_offline"));
      return;
    }
    setFlushing(true);
    setFlushMsg(null);
    const { ok, failed } = await flushQueue();
    setPending(pendingCount());
    setFlushing(false);
    if (ok > 0 && failed === 0) setFlushMsg(tliff("liff.checksheet_send_done").replace("{ok}", String(ok)));
    else if (failed > 0) setFlushMsg(tliff("liff.checksheet_send_remaining").replace("{n}", String(pendingCount())));
  };

  useEffect(() => {
    setPending(pendingCount());
    const off = subscribeOnline(() => setPending(pendingCount()));
    return off;
  }, []);

  // ติดตามสถานะ offline — เพิ่งกลับมามีเน็ต → คง banner ไว้ (เขียว) ให้กด "โหลดข้อมูลใหม่"
  useEffect(() => {
    const update = () => {
      const isOff = !navigator.onLine;
      if (isOff) {
        offlineRef.current = true;
        setOffline(true);
        setOnlineBack(false);
        setRetryMsg("");
        // อ่านเวลา "อัปเดตล่าสุด" จาก snapshot (บันทึกตอนโหลดแผนสำเร็จครั้งล่าสุด)
        snapshotLoad<{ savedAt?: number }>("pm_checksheet").then((s) => {
          if (s?.savedAt) setSnapshotTime(s.savedAt);
        });
      } else if (offlineRef.current) {
        setOnlineBack(true);
        setRetryMsg("");
      }
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  // QR scan prefill: ?asset_code= / ?plan_id=
  const qrPrefillRef = useRef<{ assetCode?: string; planId?: string } | null>(null);

  // ผู้ทำรายการ = ผู้ใช้ที่ login จริง (จาก session)
  useEffect(() => {
    fetch("/api/v1/menu_permissions.php")
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
            const assetRes = await fetch("/api/v1/index.php?resource=assets");
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
        // บันทึกเวลา "อัปเดตล่าสุด" — ใช้แสดงบน banner offline (ข้อมูล ณ ... กี่นาทีที่แล้ว)
        snapshotSave("pm_checksheet", { savedAt: Date.now() });
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
      const assetRes = await fetch("/api/v1/index.php?resource=assets");
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
        backgroundColor: "rgb(255, 255, 255)",
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
        background: "white",
        cursor: "crosshair",
        touchAction: "none",
        width: "100%",
      }}
    />
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <Spinner size={28} />
        <span className="text-[var(--cmms-text-secondary)]">กำลังโหลดแผน PM...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="Error" description={error} />}

      {/* Offline banner — ยังกรอกได้ บันทึกลงเครื่อง แล้วส่งเมื่อกลับมาออนไลน์ */}
      {(offline || onlineBack) && (
        <Alert
          variant={onlineBack ? "success" : "warning"}
          title={
            onlineBack
              ? tliff("liff.checksheet_onlineback_title")
              : snapshotTime
                ? `${tliff("liff.checksheet_offline_title_short")} — ข้อมูล ณ ${formatClockTime(snapshotTime)} — ${formatRelativeTime(snapshotTime, now)}`
                : tliff("liff.checksheet_offline_title")
          }
          description={
            retryMsg ||
            (onlineBack
              ? tliff("liff.checksheet_onlineback_desc")
              : tliff("liff.checksheet_offline_desc"))
          }
          action={
            <Button
              variant={onlineBack ? "primary" : "ghost"}
              size="sm"
              onClick={async () => {
                if (!navigator.onLine) {
                  setRetryMsg(tliff("liff.checksheet_send_offline"));
                  return;
                }
                setRetryMsg(tliff("liff.checksheet_reload_checking"));
                const ok = await serverResponds();
                if (ok) window.location.reload();
                else setRetryMsg(tliff("liff.checksheet_reload_fail"));
              }}
            >
              {tliff("liff.checksheet_reload_btn")}
            </Button>
          }
        />
      )}

      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>PM CHECKSHEET · CMMS-TOPPAN</p>
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{tliff("liff.checksheet_title")}</h2>

          {pending > 0 && (
            <div
              className="w-fit max-w-full space-y-2 rounded-lg px-3.5 py-2.5 text-[0.85rem] font-semibold"
              style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="cmms-status-dot warn inline-block" />
                {tliff("liff.checksheet_pending").replace("{n}", String(pending))}
                <button
                  type="button"
                  disabled={flushing || !navigator.onLine}
                  onClick={handleSendNow}
                  className="ml-1 rounded-lg border-none px-3 py-1.5 text-[0.78rem] font-bold"
                  style={{
                    cursor: flushing ? "wait" : "pointer",
                    background: "var(--cmms-primary)",
                    color: "var(--cmms-text-on-primary, #fff)",
                    opacity: flushing || !navigator.onLine ? 0.6 : 1,
                  }}
                >
                  {flushing ? "..." : tliff("liff.checksheet_send_now")}
                </button>
              </div>
              {flushMsg && <div className="text-[0.75rem] opacity-85">{flushMsg}</div>}
            </div>
          )}
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            {tliff("liff.checksheet_desc")}
          </p>
        </div>
        {plans.length > 0 && (
          <button
            type="button"
            disabled={!selectedPlan}
            onClick={handleCheckAll}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white cmms-btn-success disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
            {tliff("liff.checksheet_check_all")}
          </button>
        )}
      </div>

      {/* เลือกแผน */}
      <Card>
        <CardContent className="p-4">
          <label htmlFor="pm-plan" className="text-sm font-medium text-[var(--cmms-text-primary)]">เลือกแผน PM ที่ต้องการทำเช็คชีท *</label>
          <div className="mt-1.5 w-full max-w-[560px]">
            <Select
              id="pm-plan"
              aria-label="เลือกแผน PM"
              placeholder={plans.length === 0 ? "ไม่มีแผน PM ที่รอดำเนินการ" : "เลือกแผน PM..."}
              value={selectedPlanId}
              onChange={(e) => handleSelectPlan(e.target.value)}
              disabled={plans.length === 0}
            >
              <option value="">{plans.length === 0 ? "ไม่มีแผน PM ที่รอดำเนินการ" : "เลือกแผน PM..."}</option>
              {plans.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          </div>
          {plans.length === 0 && (
            <p className="mt-2 text-sm text-[var(--cmms-text-secondary)]">ไม่พบแผน PM ที่รอดำเนินการ (pending / in_progress)</p>
          )}
        </CardContent>
      </Card>

      {selectedPlan && (
        <div className="max-w-[860px]">
          <Card className="overflow-hidden p-0">
            {/* หัวแผน */}
            <div className="px-6 py-4" style={{ backgroundColor: "var(--cmms-bg-muted)", borderBottom: "1px solid var(--cmms-border)" }}>
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>
                      {selectedPlan.frequency_type?.toUpperCase()}
                    </span>
                    <span className="cmms-status warn"><span className="cmms-status-dot" />{selectedPlan.status === "in_progress" ? "กำลังดำเนินการ" : "รอดำเนินการ"}</span>
                  </div>
                  <p className="font-bold">{selectedPlan.title}</p>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">เครื่องจักร: {assetName} {selectedPlan.due_date ? `• ครบกำหนด: ${selectedPlan.due_date}` : ""}</p>
                  {!!Number(selectedPlan.is_outsource) && (
                    <span className="cmms-andon-chip w-fit" style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}>
                      งานภายนอก · {selectedPlan.outsource_by || "ไม่ระบุบริษัท"}
                      {Number(selectedPlan.cost_outsource) > 0 ? ` · ${Number(selectedPlan.cost_outsource).toLocaleString("th-TH")} บาท` : ""}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[var(--cmms-text-secondary)]">ความก้าวหน้า</p>
                  <p className="font-bold">{checklist.filter((i) => (i.type === "value" ? i.value.trim() !== "" : i.status !== null)).length} / {checklist.length} ข้อ</p>
                </div>
              </div>
            </div>

            {/* รายการตรวจ */}
            <div>
              {checklist.map((item, index) => {
                const isNg = item.status === "fail";
                return (
                  <div
                    key={item.id}
                    className="p-5"
                    style={{
                      borderBottom: index < checklist.length - 1 ? "1px solid var(--cmms-border)" : "none",
                      backgroundColor: isNg ? "var(--cmms-danger-light)" : item.status === "pass" ? "var(--cmms-success-light)" : "transparent",
                    }}
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-bold" style={{ backgroundColor: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                            {index + 1}
                          </div>
                          <div className="min-w-0 space-y-1">
                            <p className="font-semibold">{item.task}</p>
                            {item.type === "value" && (
                              <div className="mt-1.5 w-[200px] max-w-full">
                                <Input
                                  label="ค่า"
                                  isLabelHidden
                                  placeholder="ระบุค่าตัวเลข..."
                                  value={item.value}
                                  onChange={(e) => handleValue(item.id, e.target.value)}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {item.type === "check" && (
                          <div className="flex shrink-0 gap-2">
                            <button
                              onClick={() => handleStatus(item.id, "pass")}
                              className="flex items-center gap-1.5 rounded-[10px] border px-4 py-2 font-semibold"
                              style={{
                                background: item.status === "pass" ? "var(--cmms-success)" : "var(--cmms-bg-card)",
                                color: item.status === "pass" ? "#fff" : "var(--cmms-text-secondary)",
                                borderColor: item.status === "pass" ? "transparent" : "var(--cmms-border)",
                                cursor: "pointer",
                                boxShadow: item.status === "pass" ? "0 4px 12px rgba(5,150,105,0.3)" : "none",
                              }}
                            >
                              <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" /> ผ่าน
                            </button>
                            <button
                              onClick={() => handleStatus(item.id, "fail")}
                              className="flex items-center gap-1.5 rounded-[10px] border px-4 py-2 font-semibold"
                              style={{
                                background: item.status === "fail" ? "var(--cmms-danger)" : "var(--cmms-bg-card)",
                                color: item.status === "fail" ? "#fff" : "var(--cmms-text-secondary)",
                                borderColor: item.status === "fail" ? "transparent" : "var(--cmms-border)",
                                cursor: "pointer",
                                boxShadow: item.status === "fail" ? "0 4px 12px rgba(220,38,38,0.3)" : "none",
                              }}
                            >
                              <XCircle size={16} strokeWidth={1.75} aria-hidden="true" /> ไม่ผ่าน
                            </button>
                          </div>
                        )}
                      </div>

                      {isNg && (
                        <div className="ml-0 space-y-3 rounded-lg border border-dashed p-3.5 sm:ml-10" style={{ backgroundColor: "var(--cmms-bg-card)", borderColor: "var(--cmms-danger)" }}>
                          <div className="flex items-center gap-2">
                            <TriangleAlert size={16} strokeWidth={1.75} style={{ color: "var(--cmms-danger)" }} aria-hidden="true" />
                            <p className="font-semibold" style={{ color: "var(--cmms-danger)" }}>พบความผิดปกติ (NG) — ระบุรายละเอียด</p>
                          </div>
                          <Textarea
                            label="สาเหตุที่พบ / หมายเหตุ *"
                            placeholder="อธิบายอาการผิดปกติที่พบ..."
                            value={item.note}
                            onChange={(e) => handleNote(item.id, e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* footer */}
            <div className="p-5" style={{ backgroundColor: "var(--cmms-bg-muted)", borderTop: "1px solid var(--cmms-border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[var(--cmms-text-secondary)]">ตรวจสอบให้ครบทุกข้อก่อนบันทึก</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pdfBusy}
                    onClick={handleDownloadPdf}
                    className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white cmms-btn-success disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download size={16} strokeWidth={1.75} aria-hidden="true" />
                    {pdfBusy ? "กำลังสร้าง PDF..." : "ดาวน์โหลด PDF ใบตรวจเช็ค"}
                  </button>
                  <button
                    type="button"
                    disabled={submitting || !allFilled}
                    onClick={handleSubmit}
                    className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white cmms-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ClipboardCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                    {submitting ? "กำลังส่งข้อมูล..." : "บันทึกผลการทำ PM"}
                  </button>
                </div>
              </div>
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
      <Dialog
        open={sigModalOpen && !!selectedPlan}
        onClose={() => { if (!submitting) setSigModalOpen(false); }}
        title={selectedPlan ? `ลงนามยืนยันการทำ PM: ${selectedPlan.title}` : ""}
      >
        {selectedPlan && (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-[var(--cmms-text-primary)]">
                  {!!Number(selectedPlan.is_outsource) ? `ลายเซ็นผู้ตรวจเช็ค (บริษัทภายนอก: ${selectedPlan.outsource_by || "-"}) *` : `ลายเซ็นผู้ตรวจเช็ค (ผู้ปฏิบัติงาน: ${currentUserName || "-"}) *`}
                </label>
                {renderSigCanvas("inspector")}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--cmms-text-secondary)]">วาดด้วยเมาส์/นิ้ว</span>
                  <button type="button" onClick={() => clearSig("inspector")} className="text-xs underline" style={{ color: "var(--cmms-text-muted)" }}>ล้าง</button>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="operator-name-input" className="text-sm font-medium text-[var(--cmms-text-primary)]">ลายเซ็นผู้ควบคุมเครื่อง *</label>
                {renderSigCanvas("operator")}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--cmms-text-secondary)]">วาดด้วยเมาส์/นิ้ว</span>
                  <button type="button" onClick={() => clearSig("operator")} className="text-xs underline" style={{ color: "var(--cmms-text-muted)" }}>ล้าง</button>
                </div>
                <Input
                  id="operator-name-input"
                  label="ชื่อผู้ควบคุมเครื่อง"
                  isLabelHidden
                  placeholder="กรอกชื่อผู้ควบคุมเครื่อง..."
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                />
              </div>
            </div>

            {(!inspectorSig.trim() || !operatorSig.trim() || !operatorName.trim()) && (
              <div className="flex items-center gap-2">
                <TriangleAlert size={16} strokeWidth={1.75} style={{ color: "var(--cmms-danger)" }} aria-hidden="true" />
                <p className="text-sm font-semibold" style={{ color: "var(--cmms-danger)" }}>
                  กรุณาเซ็นครบทั้ง 2 ช่อง และกรอกชื่อผู้ควบคุมเครื่อง ก่อนบันทึกผล
                </p>
              </div>
            )}

            {inspectorSig.trim() && operatorSig.trim() && (
              <div className="flex flex-wrap items-center gap-3">
                {inspectorSig && (
                  <div className="space-y-1">
                    <p className="text-sm text-[var(--cmms-text-secondary)]">ผู้ตรวจเช็ค</p>
                    <img src={inspectorSig} alt="ลายเซ็นผู้ตรวจเช็ค" style={{ height: 44, background: "white", borderRadius: 6, border: "1px solid var(--cmms-border)" }} />
                  </div>
                )}
                {operatorSig && (
                  <div className="space-y-1">
                    <p className="text-sm text-[var(--cmms-text-secondary)]">ผู้ควบคุมเครื่อง ({operatorName || "-"})</p>
                    <img src={operatorSig} alt="ลายเซ็นผู้ควบคุมเครื่อง" style={{ height: 44, background: "white", borderRadius: 6, border: "1px solid var(--cmms-border)" }} />
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSigModalOpen(false)} disabled={submitting}>
                ยกเลิก
              </Button>
              <Button onClick={confirmSave} disabled={submitting}>
                <ClipboardCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                {submitting ? "กำลังบันทึก..." : "ยืนยันและบันทึกผล PM"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
