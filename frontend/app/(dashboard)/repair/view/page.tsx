"use client";

import { useState, useEffect, useRef } from "react";
import { t, statusText, priorityText } from "@/lib/i18n";
import AnimatedDialog from "@/components/AnimatedDialog";
import { snapshotSave, snapshotLoad } from "@/lib/offline-store";
import { formatClockTime, formatRelativeTime } from "@/lib/time-utils";
import { serverResponds } from "@/lib/server-check";
import {
  Printer,
  ArrowLeft,
  FileDown,
  Download,
  Users,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Info,
  Trash2,
  Plus,
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import WorkOrderClosureDocument, { WorkOrderPart } from "../../../../components/WorkOrderClosureDocument";
import AndonLamp from "@/components/AndonLamp";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageShell } from "@/components/PageShell";

interface PartRow {
  id: number;
  spare_part_id: number;
  code: string;
  name: string;
  image_url?: string;
  quantity_used: number;
  unit_price: number;
  issued_qty?: number;
  remaining?: number;
  request_status?: string;
  sage_doc_no?: string;
}

interface WorkOrderDetail {
  id: number;
  workOrderNo: string;
  assetName: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignedName: string;
  receiverName: string;
  beforeImg: string;
  afterImg: string;
  receiverSignature: string;
  completedAt: string;
  createdDate: string;
  rootCause: string;
  solution: string;
  costParts: number;
  costLabor: number;
  costOutsource: number;
  downtimeMinutes: number;
  spareApprovalStatus: string;
  spareApprovedBy: string;
  spareApprovedAt: string;
  contaminateChecking?: string;
  outsourceBy?: string;
  actualStartAt?: string;
  repairTimeMinutes?: number;
  team: { user_id: number; role: string; full_name: string; status?: string; accepted_at?: string }[];
}

interface Activity {
  id: number;
  action: string;
  description: string;
  user_name?: string;
  created_at: string;
}

// สถานะ → ไฟ Andon (เหมือนหน้า /repair): เขียวเสร็จ / เหลืองค้าง / แดงเกินกำหนด
const andonOf = (s: string): "ok" | "warn" | "down" | "idle" => {
  const v = String(s || "").toLowerCase();
  if (v === "completed" || v === "closed" || v === "resolved") return "ok";
  if (v === "in_progress" || v === "waiting_parts" || v === "pending_parts" || v === "acknowledged") return "warn";
  if (v === "overdue" || v === "rejected") return "down";
  return "idle";
};

const statusLabels: Record<string, string> = {
  completed: "เสร็จสิ้น", closed: "ปิดงาน", resolved: "แก้ไขแล้ว",
  in_progress: "กำลังซ่อม", waiting_parts: "รออะไหล่", pending_parts: "รออะไหล่", acknowledged: "รับงานแล้ว",
  open: "รอดำเนินการ", pending: "รอดำเนินการ", overdue: "เกินกำหนด", rejected: "ตีกลับ",
};
const statusLabel = (s: string) => statusText(s, s || "—");
const requestStatusLabel = (s: string) => {
  const m: Record<string, string> = {
    pending: "Pending Issue — รอคลังจัดของ", Requested: "รออนุมัติ", Approved: "อนุมัติแล้ว", "Waiting Issue": "รอจ่ายของ",
    Issued: "จ่ายของแล้ว", Returned: "คืนอะไหล่แล้ว", rejected: "ตีกลับ", Cancelled: "ยกเลิก",
  };
  return m[String(s || "")] || (String(s || "") ? String(s) : "Pending Issue");
};

// ผลตรวจการปนเปื้อน (เหมือนหน้า /repair + PDF F-EN-03)
const contamLabel: Record<string, string> = {
  not_checked: "ยังไม่ตรวจ",
  clean: "ไม่พบการปนเปื้อน (ผ่าน)",
  contaminated: "พบการปนเปื้อน",
  not_applicable: "ไม่เกี่ยวข้องกับงานนี้",
};
const contamTone = (v: string): "ok" | "warn" | "down" | "idle" => {
  const c = String(v || "").toLowerCase();
  if (c === "clean") return "ok";
  if (c === "contaminated") return "down";
  if (c === "not_applicable") return "idle";
  return "warn";
};

const priorityLabels: Record<string, string> = { critical: "วิกฤต", high: "สูง", medium: "ปานกลาง", low: "ต่ำ" };
const priorityLabel = (p: string) => priorityText(p, p || "—");
const priorityBadgeVariant = (p: string): "danger" | "warning" | "info" | "neutral" => {
  const m: Record<string, "danger" | "warning" | "info" | "neutral"> = {
    critical: "danger", high: "warning", medium: "info", low: "neutral",
  };
  return m[String(p || "").toLowerCase()] || "neutral";
};

// ไทม์ไลน์: กิจกรรม → สีหลอดไฟ + ไอคอน
const toneColor = { ok: "var(--cmms-success)", warn: "var(--cmms-warning)", down: "var(--cmms-danger)", idle: "var(--cmms-text-secondary)" } as const;
const actionTone = (action: string): "ok" | "warn" | "down" | "idle" => {
  const a = String(action || "").toLowerCase();
  if (a.includes("closed") || a.includes("complete") || a.includes("resolve")) return "ok";
  if (a.includes("waiting_parts") || a.includes("pending_parts") || a.includes("reopen") || a.includes("assign")) return "warn";
  if (a.includes("overdue") || a.includes("reject")) return "down";
  return "idle";
};
const actionIcon = (action: string) => {
  const a = String(action || "").toLowerCase();
  if (a.includes("assign")) return Users;
  if (a.includes("closed") || a.includes("complete") || a.includes("resolve")) return CheckCircle2;
  if (a.includes("waiting_parts") || a.includes("pending_parts")) return Clock;
  if (a.includes("status") || a.includes("move")) return RefreshCw;
  if (a.includes("overdue") || a.includes("reject")) return AlertTriangle;
  return Info;
};

export default function RepairViewDetailsPage() {
  const [woId, setWoId] = useState<string>("1");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [parts, setParts] = useState<WorkOrderPart[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<any>(null);
  // ── เบิกอะไหล่จากใบซ่อม (Phase 12: Sage 300 = source of truth ของสต็อก; CMMS เก็บบันทึกการเบิก Pending Issue) ──
  const [partRows, setPartRows] = useState<PartRow[]>([]);
  const [partsSaving, setPartsSaving] = useState(false);
  const [partsMsg, setPartsMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [sageQuery, setSageQuery] = useState("");
  const [sageResults, setSageResults] = useState<any[]>([]);
  const [sageSearching, setSageSearching] = useState(false);
  const [sageSource, setSageSource] = useState<"sage" | "cache">("sage");
  const [lastStockInfo, setLastStockInfo] = useState<{ last_synced_at?: string; request_count: number; request_status?: string }>({ request_count: 0 });
  const [sageMsg, setSageMsg] = useState<string | null>(null);
  // โหมด offline — แสดง banner + เวลา "ข้อมูล ณ" จาก snapshot (IndexedDB)
  const [offline, setOffline] = useState(false);
  const [snapshotTime, setSnapshotTime] = useState<number | null>(null);
  const [retryMsg, setRetryMsg] = useState("");
  // เพิ่งกลับมามีเน็ต — ยังไม่ refresh ข้อมูล (คง banner ไว้ให้กด "โหลดข้อมูลใหม่")
  const [onlineBack, setOnlineBack] = useState(false);
  const offlineRef = useRef(false);
  // tick เวลาปัจจุบัน — อัปเดต "กี่นาทีที่แล้ว" บน banner ทุก 30 วิ
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);
  const [wo, setWo] = useState<WorkOrderDetail>({
    id: 0,
    workOrderNo: "-",
    assetName: "-",
    title: "-",
    description: "-",
    status: "",
    priority: "",
    assignedName: "-",
    receiverName: "-",
    beforeImg: "",
    afterImg: "",
    receiverSignature: "",
    completedAt: "-",
    createdDate: "-",
    rootCause: "-",
    solution: "-",
    costParts: 0,
    costLabor: 0,
    costOutsource: 0,
    downtimeMinutes: 0,
    spareApprovalStatus: "none",
    spareApprovedBy: "",
    spareApprovedAt: "",
    team: []
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id") || "1";
    setWoId(idParam);

    fetch(`/api/v1/repair.php?id=${idParam}`)
      .then(res => res.json())
      .then(row => {
        if (row && row.id) {
          const mapped = {
            id: row.id,
            workOrderNo: row.work_order_no || `EN-${row.id}`,
            assetName: row.asset_name || "-",
            title: row.title || "-",
            description: row.description || row.failure_report || "-",
            status: row.status || "",
            priority: row.priority || "",
            assignedName: row.assigned_name || "-",
            receiverName: row.receiver_name || "-",
            beforeImg: row.before_image_path || "",
            afterImg: row.after_image_path || "",
            receiverSignature: row.receiver_signature_path || "",
            completedAt: row.completed_at || row.updated_at || "-",
            createdDate: row.created_at || "-",
            rootCause: row.root_cause || "-",
            solution: row.solution || row.resolution || "-",
            costParts: Number(row.cost_parts || 0),
            costLabor: Number(row.cost_labor || 0),
            costOutsource: Number(row.cost_outsource || 0),
            downtimeMinutes: Number(row.downtime_minutes || 0),
            spareApprovalStatus: String(row.spare_approval_status || "none"),
            spareApprovedBy: String(row.spare_approved_by || ""),
            spareApprovedAt: String(row.spare_approved_at || ""),
            contaminateChecking: String(row.contaminate_checking || "not_checked"),
            outsourceBy: String(row.outsource_by || ""),
            actualStartAt: String(row.actual_start_at || ""),
            repairTimeMinutes: Number(row.repair_time_minutes || 0),
            team: Array.isArray(row.team) ? row.team : []
          };
          setWo(mapped);
          // offline ใช้ snapshot ล่าสุด — เก็บทุกครั้งที่โหลดสำเร็จ (พร้อมเวลา "ข้อมูล ณ")
          snapshotSave(`repair_view:${idParam}`, { wo: mapped, savedAt: Date.now() });
        }
      })
      .catch(e => {
        console.error("Fetch WO error", e);
        // offline: เปิดจาก snapshot ล่าสุด (ไม่พึ่ง SW cache — ล้างได้เมื่อ SW update)
        snapshotLoad<{ wo: WorkOrderDetail; savedAt?: number }>(`repair_view:${idParam}`).then(snap => {
          if (snap?.wo) {
            setWo(snap.wo);
            if (snap.savedAt) setSnapshotTime(snap.savedAt);
            setOffline(true);
          }
        });
      })
      .finally(() => setLoading(false));

    // อะไหล่ที่ใช้ซ่อม + สถานะใบเบิก Pending Issue (Phase 12: มาจาก spare_usage.php)
    loadParts(idParam);

    // ไทม์ไลน์การซ่อม (repair_activity_log)
    fetch(`/api/v1/repair.php?activity=1&id=${idParam}`)
      .then(res => res.json())
      .then((list: any[]) => { if (Array.isArray(list)) setActivity(list); })
      .catch(e => console.error("Fetch WO activity error", e));
  }, []);

  // ติดตาม online/offline — แสดง banner + อ่านเวลาสุดท้ายจาก snapshot (เหมือนหน้างานของฉัน)
  useEffect(() => {
    const idParam = new URLSearchParams(window.location.search).get("id") || "1";
    const updateOffline = async () => {
      const isOff = !navigator.onLine;
      if (isOff) {
        offlineRef.current = true;
        setOffline(true);
        setOnlineBack(false);
        setRetryMsg("");
        const snap = await snapshotLoad<{ wo: WorkOrderDetail; savedAt?: number }>(`repair_view:${idParam}`);
        if (snap) {
          if (snap.savedAt) setSnapshotTime(snap.savedAt);
          if (snap.wo) setWo(snap.wo);
        }
      } else if (offlineRef.current) {
        // เพิ่งกลับมามีเน็ต — โหลดข้อมูลใหม่อัตโนมัติ (เช็คเซิร์ฟเวอร์ก่อน กันวนเงียบๆ)
        offlineRef.current = false; // กัน reload ซ้ำถ้า event online หลุดซ้ำ
        const ok = await serverResponds();
        if (ok) {
          window.location.reload();
        } else {
          // เซิร์ฟเวอร์ยังไม่ตอบ — คง banner เขียวไว้ให้กด "โหลดข้อมูลใหม่" เอง
          setOnlineBack(true);
          setRetryMsg("");
        }
      }
    };
    updateOffline();
    window.addEventListener("online", updateOffline);
    window.addEventListener("offline", updateOffline);
    return () => {
      window.removeEventListener("online", updateOffline);
      window.removeEventListener("offline", updateOffline);
    };
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!reportRef.current || downloading) return;
    setDownloading(true);
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
      // เปิดหน้าต่างดูตัวอย่างก่อนดาวน์โหลด (สร้าง blob URL สำหรับแสดงใน iframe)
      pdfRef.current = pdf;
      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (e) {
      console.error("PDF generation failed:", e);
      alert('ไม่สามารถสร้าง PDF ได้ในเบราว์เซอร์นี้ — กรุณาใช้ปุ่ม "พิมพ์เอกสารปิดซ่อม" แล้วเลือก "บันทึกเป็น PDF"');
    }
    setDownloading(false);
  };

  const handleSavePdf = () => {
    if (pdfRef.current) {
      pdfRef.current.save(`F-EN-03-${wo.workOrderNo}.pdf`);
    }
  };

  const handleClosePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    pdfRef.current = null;
  };

  // ── เบิกอะไหล่จากใบซ่อม (Phase 12) ──
  const loadParts = async (idParam: string) => {
    try {
      const res = await fetch(`/api/v1/spare_usage.php?work_order_id=${idParam}`, { credentials: "include" });
      const json = await res.json();
      if (json && Array.isArray(json.parts)) {
        const mapped: PartRow[] = json.parts.map((p: any) => ({
          id: Number(p.id) || 0,
          spare_part_id: Number(p.spare_part_id) || 0,
          code: p.item_code || p.sage_item_code || "",
          name: p.item_description || "",
          quantity_used: Number(p.quantity_used) || Number(p.qty) || 0,
          unit_price: Number(p.unit_price) || 0,
          issued_qty: Number(p.issued_qty) || 0,
          remaining: Number(p.remaining) || 0,
          request_status: String(p.request_status || ""),
          sage_doc_no: p.sage_doc_no || "",
        }));
        setParts(mapped.map((m) => ({ code: m.code, name: m.name, quantity_used: m.quantity_used, unit_price: m.unit_price })));
        setPartRows(mapped);
        setLastStockInfo({
          last_synced_at: json.last_synced_at || (json.parts as any[]).find((x) => x.last_synced_at)?.last_synced_at || undefined,
          request_count: (json.parts as any[]).filter((x) => x.request_id).length,
          request_status: String((json.parts as any[]).find((x) => x.request_status)?.request_status || ""),
        });
        setPartsMsg(null);
      }
      return json;
    } catch (e) {
      console.error("Fetch WO usage error", e);
      return null;
    }
  };

  const addSagePart = async (item: any) => {
    const qty = Math.max(1, Number(sageQtyRef.current || 1));
    if (!item?.item_no) { setSageMsg("เลือกอะไหล่จากรายการค้นหาก่อน"); return; }
    setPartsSaving(true);
    setSageMsg(null);
    setPartsMsg(null);
    try {
      const csrf = await (await fetch("/api/v1/csrf.php", { credentials: "include" })).json();
      const res = await fetch("/api/v1/spare_usage.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.csrf_token },
        body: JSON.stringify({ action: "add", work_order_id: Number(woId), items: [{ item_code: item.item_no, qty }] }),
      });
      const json = await res.json();
      if (json.success) {
        setSageMsg(`เพิ่ม ${item.item_no} — ${item.description} (${qty} ${item.unit || "PCS"}) แล้ว · ใบเบิก #${json.request_id} (Pending Issue)`);
        setSageQuery("");
        setSageResults([]);
        await loadParts(String(woId));
      } else {
        setPartsMsg({ kind: "err", text: json.error || "เพิ่มอะไหล่ไม่สำเร็จ" });
      }
    } catch (e) {
      console.error(e);
      setPartsMsg({ kind: "err", text: "ไม่สามารถเพิ่มอะไหล่ได้ (เน็ตหลุด?) — ลองอีกครั้ง" });
    }
    setPartsSaving(false);
  };

  const removePart = async (rowId: number) => {
    if (!rowId) return;
    try {
      const csrf = await (await fetch("/api/v1/csrf.php", { credentials: "include" })).json();
      const res = await fetch("/api/v1/spare_usage.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.csrf_token },
        body: JSON.stringify({ action: "remove", id: rowId }),
      });
      const json = await res.json();
      if (json.success) {
        setPartRows(partRows.filter((r) => r.id !== rowId));
        await loadParts(String(woId));
      } else {
        setPartsMsg({ kind: "err", text: json.error || "ลบรายการไม่สำเร็จ" });
      }
    } catch (e) {
      console.error(e);
      setPartsMsg({ kind: "err", text: "ไม่สามารถลบรายการได้ (เน็ตหลุด?)" });
    }
  };

  const updateQty = async (rowId: number, qty: number) => {
    if (!rowId || qty <= 0) return;
    try {
      const csrf = await (await fetch("/api/v1/csrf.php", { credentials: "include" })).json();
      await fetch("/api/v1/spare_usage.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.csrf_token },
        body: JSON.stringify({ action: "set_qty", id: rowId, qty }),
      });
      loadParts(String(woId));
    } catch (e) {
      console.error(e);
    }
  };

  const sageQtyRef = useRef("1");

  // ค้นหา Item ใน Sage 300 (debounce) — ผลลัพธ์โชว์สต็อกจริงจาก Sage 300
  useEffect(() => {
    const q = sageQuery.trim();
    if (!q) { setSageResults([]); return; }
    setSageSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/sage_items.php?q=${encodeURIComponent(q)}`, { credentials: "include" });
        const json = await res.json();
        if (Array.isArray(json.items)) {
          setSageResults(json.items);
          setSageSource(json.source === "cache" ? "cache" : "sage");
        } else {
          setSageResults([]);
        }
      } catch (e) {
        console.error("Sage search error", e);
        setSageResults([]);
      }
      setSageSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [sageQuery]);

  const partsTotal = partRows.reduce((a, r) => a + r.quantity_used * r.unit_price, 0);

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">WORK ORDER DETAIL · CMMS-TOPPAN</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "งานซ่อมบำรุง", href: "/repair" },
        { label: "ใบสั่งงานซ่อม" },
      ]}
      title="ใบสั่งงานซ่อม"
      description="WORK ORDER DETAIL · CMMS-TOPPAN"
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => (window.location.href = "/repair/tracking")}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับ</span>
          </Button>
          <Button
            variant="outline"
            disabled={downloading}
            onClick={handleDownloadPdf}
            className="gap-2"
          >
            <FileDown className="w-4 h-4" />
            <span>{downloading ? t("action.building_pdf") : t("action.download_pdf_fen03")}</span>
          </Button>
          <Button
            variant="primary"
            onClick={handlePrint}
            className="gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>{t("action.print_closure_doc")}</span>
          </Button>
        </>
      }
    >
      {/* Offline banner — ข้อมูลมาจาก snapshot (IndexedDB) */}
      {offline && (
        <Alert
          variant={onlineBack ? "info" : "warning"}
          title={
            onlineBack
              ? "เชื่อมต่อกลับมาแล้ว — ข้อมูลยังไม่ทันสมัย"
              : snapshotTime
                ? `โหมดออฟไลน์ — ข้อมูล ณ ${formatClockTime(snapshotTime)} — ${formatRelativeTime(snapshotTime, now)}`
                : "โหมดออฟไลน์ — ข้อมูล ณ ครั้งล่าสุด"
          }
          action={
            <Button
              variant={onlineBack ? "primary" : "outline"}
              size="sm"
              onClick={async () => {
                if (!navigator.onLine) {
                  setRetryMsg("ยังไม่มีอินเทอร์เน็ต — ลองอีกครั้งเมื่อเชื่อมต่อได้");
                  return;
                }
                setRetryMsg("กำลังตรวจสอบการเชื่อมต่อ…");
                const ok = await serverResponds();
                if (ok) window.location.reload();
                else setRetryMsg("โหลดไม่สำเร็จ — ลองอีกครั้ง");
              }}
            >
              โหลดข้อมูลใหม่
            </Button>
          }
        >
          {retryMsg ||
            (onlineBack
              ? "กด \"โหลดข้อมูลใหม่\" เพื่อดึงข้อมูลล่าสุดจากเซิร์ฟเวอร์"
              : "กำลังแสดงข้อมูลจากเครื่องของคุณ (เปิดดูได้อย่างเดียว) — อัปเดตใหม่เมื่อกลับมาออนไลน์")}
        </Alert>
      )}

      {/* Interactive detail (Hidden on Print) */}
      <div className="no-print">
        {/* ── สถานะใบงาน + ข้อเท็จจริงของใบงาน (definition rows) ── */}
        <Card className="mb-6">
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4 flex-wrap">
              <AndonLamp status={andonOf(wo.status)} size="lg" />
              <div className="space-y-1 min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {statusLabel(wo.status)}
                </span>
                <h2 className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                  {wo.workOrderNo}
                </h2>
                <p className="text-base font-semibold text-foreground">
                  {wo.title}
                </p>
                <p className="text-sm text-muted-foreground">
                  {wo.assetName}
                </p>
              </div>
            </div>
            <div className="flex items-end justify-end">
              <Badge variant={priorityBadgeVariant(wo.priority)}>
                ความเร่งด่วน: {priorityLabel(wo.priority)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {/* ข้อเท็จจริงของใบงาน */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
              {([
                { label: "ผู้แจ้ง", value: wo.receiverName },
                { label: "ผู้รับผิดชอบ", value: wo.assignedName },
                { label: "วันที่แจ้ง", value: wo.createdDate },
                { label: "วันที่ปิด", value: wo.completedAt },
                { label: "Downtime", value: wo.downtimeMinutes ? `${wo.downtimeMinutes} นาที` : "—" },
                { label: "ค่าใช้จ่ายรวม", value: `฿${(wo.costParts + wo.costLabor + wo.costOutsource).toLocaleString()}` },
                { label: "ผลตรวจการปนเปื้อน", value: contamLabel[wo.contaminateChecking || "not_checked"] ?? "ยังไม่ตรวจ", tone: contamTone(wo.contaminateChecking || "") },
                { label: "ผู้รับเหมาภายนอก", value: wo.outsourceBy || "—", tone: wo.outsourceBy ? "warn" : "idle" },
              ] as { label: string; value: string; tone?: "ok" | "warn" | "down" | "idle" }[]).map((f) => (
                <div key={f.label} className="min-w-0 rounded-[var(--cmms-radius-sm)] border border-border p-2.5">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {f.label}
                  </dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    {f.tone && (
                      <span
                        aria-hidden="true"
                        className={`inline-block h-2 w-2 shrink-0 rounded-full ${f.tone === "ok" ? "bg-emerald-500" : f.tone === "warn" ? "bg-amber-500" : f.tone === "down" ? "bg-red-500" : "bg-zinc-400"}`}
                      />
                    )}
                    <span className="truncate">{f.value}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        {/* ── ทีมซ่อม (ผู้รับผิดชอบหลายคน) ── */}
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">ทีมซ่อม</CardTitle>
              <p className="text-xs text-muted-foreground">
                ผู้รับผิดชอบหลัก (หัวหน้าชุด) + สมาชิกในทีม — ใครในทีมก็ปิดงานได้
              </p>
            </div>
            {wo.team.length > 0 && (
              <Badge variant="info">{wo.team.length} คน</Badge>
            )}
          </CardHeader>
          <CardContent>
            {wo.team.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                ยังไม่มีการมอบหมายทีมซ่อม — ไปที่หน้า "แจกงานซ่อม" เพื่อเลือกทีม
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {wo.team.map((m) => (
                  <div
                    key={m.user_id}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                      m.role === "lead"
                        ? "border-[var(--cmms-info)]/30 bg-[var(--cmms-info-light)]"
                        : "border-border bg-muted/50"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                        m.role === "lead"
                          ? "bg-[var(--cmms-info)] text-white"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {(m.full_name || "?").charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {m.full_name || "-"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.role === "lead" ? "หัวหน้าชุด" : "สมาชิกทีม"}
                      </p>
                      {m.status === "accepted" ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            รับงานแล้ว{m.accepted_at ? ` · ${String(m.accepted_at).slice(11, 16)} น.` : ""}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                          <span className="text-[11px] text-muted-foreground">
                            ยังไม่รับงาน
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── ไทม์ไลน์การซ่อม (จาก repair_activity_log) ── */}
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span>ไทม์ไลน์การซ่อม</span>
            </CardTitle>
            <span className="text-xs text-muted-foreground">{activity.length} เหตุการณ์</span>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                ยังไม่มีประวัติการซ่อมสำหรับงานนี้
              </p>
            ) : (
              <div className="relative pl-8 space-y-5 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                {activity.map((a) => {
                  const tone = actionTone(a.action);
                  const IconCmp = actionIcon(a.action);
                  return (
                    <div key={a.id} className="relative flex items-start gap-3">
                      <div
                        className="absolute -left-8 top-0.5 w-[22px] h-[22px] rounded-full border-2 border-white flex items-center justify-center shrink-0"
                        style={{ background: `${toneColor[tone]}1A`, color: toneColor[tone] }}
                      >
                        <IconCmp className="w-3 h-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs md:text-sm font-semibold text-foreground truncate">
                            {a.description || a.action}
                          </p>
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
                            {a.created_at}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {a.user_name || "ระบบ"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── เบิกอะไหล่ที่ใช้ซ่อม (Phase 12: Pending Issue — สต็อกอ้างอิง Sage 300) ── */}
        <Card className="mb-6">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                SPARE PARTS USED · F-EN-03 · PENDING ISSUE
              </span>
              <CardTitle className="text-base">อะไหล่ที่ใช้ซ่อม (ใบเบิก)</CardTitle>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {lastStockInfo.request_status === "Issued" && (
                <Badge variant="success">
                  ✅ จ่ายของแล้ว{partRows[0]?.sage_doc_no ? ` · เอกสาร ${partRows.find((r) => r.sage_doc_no)?.sage_doc_no}` : ""}
                </Badge>
              )}
              {lastStockInfo.request_status && lastStockInfo.request_status !== "Issued" && lastStockInfo.request_status !== "Returned" && (
                <Badge variant="warning">⏳ {requestStatusLabel(lastStockInfo.request_status)} {lastStockInfo.request_count > 0 ? `(${lastStockInfo.request_count} ใบเบิก)` : ""}</Badge>
              )}
              {lastStockInfo.request_status === "Returned" && (
                <Badge variant="info">คืนอะไหล่แล้ว</Badge>
              )}
              <span className="text-muted-foreground">
                รวม {partsTotal.toLocaleString()} บาท · สต็อกอ้างอิงรายการ: <span className="font-semibold text-foreground">Sage 300 (Last known)</span>
                {lastStockInfo.last_synced_at ? ` · ข้อมูล ณ ${String(lastStockInfo.last_synced_at).slice(0, 16)}` : partRows.length ? " (ยังไม่เคยซิงก์)" : " · ยังไม่มีการเบิกในใบนี้"}
              </span>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {partsMsg && (
              <Alert variant={partsMsg.kind === "ok" ? "success" : "danger"}>
                {partsMsg.text}
              </Alert>
            )}

            {/* รายการที่เลือกแล้ว */}
            {partRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีอะไหล่ในใบเบิก — ค้นหา Item Code ใน Sage 300 แล้วกด "เพิ่ม" ด้านล่าง</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/60 text-left border-b border-border">
                      <th className="p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">รหัส</th>
                      <th className="p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">ชื่ออะไหล่</th>
                      <th className="p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">จำนวน</th>
                      <th className="p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">ราคา/หน่วย</th>
                      <th className="p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">รวม</th>
                      <th className="p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">สถานะเบิก</th>
                      <th className="p-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {partRows.map((r) => (
                      <tr key={`${r.id}-${r.code}`} className="transition-colors hover:bg-primary-light/60">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {r.image_url ? (
                              <img
                                src={r.image_url}
                                onError={(e) => {
                                  const t = e.currentTarget;
                                  if (!t.src.includes("spare_image.php")) t.src = `/api/v1/spare_image.php?id=${r.spare_part_id}`;
                                }}
                                alt={r.code}
                                className="w-8 h-8 rounded-lg object-cover border border-border"
                              />
                            ) : (
                              <span className="w-8 h-8 rounded-lg bg-primary-light/50 border border-border flex items-center justify-center text-xs font-bold text-primary uppercase">
                                {(r.name || r.code || "?").charAt(0)}
                              </span>
                            )}
                            <span className="font-semibold">{r.code}</span>
                          </div>
                        </td>
                        <td className="p-3">{r.name}</td>
                        <td className="p-3">
                          <input
                            type="number"
                            min={1}
                            value={r.quantity_used}
                            onChange={(e) =>
                              setPartRows(partRows.map((x) => (x.id === r.id ? { ...x, quantity_used: Math.max(1, Number(e.target.value) || 1) } : x)))
                            }
                            onBlur={(e) => updateQty(r.id, Math.max(1, Number(e.target.value) || 1))}
                            disabled={Number(r.issued_qty) > 0}
                            className="w-20 px-2 py-1 rounded-lg border border-input bg-card text-sm disabled:opacity-50"
                          />
                        </td>
                        <td className="p-3 tabular-nums">{(r.unit_price || 0).toLocaleString()}</td>
                        <td className="p-3 font-semibold tabular-nums">{(r.quantity_used * (r.unit_price || 0)).toLocaleString()}</td>
                        <td className="p-3 text-xs">
                          {r.request_status === "Issued" ? (
                            <Badge variant="success">จ่ายแล้ว {Number(r.issued_qty || 0).toLocaleString()}{Number(r.remaining) > 0 ? ` · เหลือ ${r.remaining}` : ""}</Badge>
                          ) : r.request_status === "Returned" ? (
                            <Badge variant="info">คืนแล้ว</Badge>
                          ) : (
                            <span className="text-muted-foreground">ยังไม่จ่าย (Pending)</span>
                          )}
                          {r.sage_doc_no && <span className="block mt-0.5 text-[11px] text-muted-foreground tabular-nums">อ้างอิง {r.sage_doc_no}</span>}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`นำอะไหล่ ${r.code} ออก`}
                            onClick={() => removePart(r.id)}
                            disabled={Number(r.issued_qty) > 0}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ค้นหา & เพิ่มอะไหล่ — สต็อกจริงจาก Sage 300 (Item Code เป็น reference key) */}
            <div className="rounded-xl border border-border p-3 space-y-3">
              <Label htmlFor="repair-view-sage-q">ค้นหาอะไหล่ใน Sage 300 (รหัส Item / ชื่อไทย-อังกฤษ)</Label>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5 min-w-[220px] flex-1">
                  <Input
                    id="repair-view-sage-q"
                    placeholder="เช่น SUP001 · O-RING · ตลับลูกปืน"
                    value={sageQuery}
                    onChange={(e) => setSageQuery(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 w-24">
                  <Label htmlFor="repair-view-new-qty">จำนวน</Label>
                  <Input
                    id="repair-view-new-qty"
                    type="number"
                    min={1}
                    defaultValue="1"
                    onChange={(e) => (sageQtyRef.current = e.target.value)}
                  />
                </div>
              </div>

              {sageSearching ? (
                <p className="text-xs text-muted-foreground">กำลังค้นหาบน Sage 300…</p>
              ) : sageResults.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/60 text-left border-b border-border">
                        <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Item Code</th>
                        <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">ชื่อรายการ</th>
                        <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">คงเหลือ (Sage 300)</th>
                        <th className="p-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">ราคา/หน่วย</th>
                        <th className="p-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">เพิ่ม</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sageResults.map((it) => (
                        <tr key={it.item_no} className="transition-colors hover:bg-primary-light/60">
                          <td className="p-2.5 font-semibold">{it.item_no}</td>
                          <td className="p-2.5">
                            {it.description}
                            <span className="text-[10px] text-muted-foreground"> ({it.unit})</span>
                          </td>
                          <td className="p-2.5">
                            <span className={`inline-flex items-center gap-1 font-semibold tabular-nums ${Number(it.available) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                              {Number(it.available).toLocaleString()}
                            </span>
                            {it.stock_status === "low" && <Badge variant="warning" className="ml-1.5">น้อย</Badge>}
                            {it.stock_status === "out_of_stock" && <Badge variant="danger" className="ml-1.5">หมด</Badge>}
                          </td>
                          <td className="p-2.5 tabular-nums">{(Number(it.avg_cost) || 0).toLocaleString()}</td>
                          <td className="p-2.5 text-right">
                            <Button size="sm" variant="outline" onClick={() => addSagePart(it)} disabled={partsSaving} className="gap-1.5">
                              <Plus className="w-3.5 h-3.5" />
                              <span>เพิ่ม</span>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : sageQuery.trim() ? (
                <p className="text-xs text-muted-foreground">ไม่พบรายการ "{sageQuery.trim()}" — ลองเปลี่ยนคำค้น หรือ Sage 300 ไม่พร้อม (แสดงผลจาก cache เท่านั้น)</p>
              ) : null}

              <p className="text-[11px] text-muted-foreground">
                แหล่งข้อมูล: {sageSource === "cache" ? "แคชล่าสุด (Last known stock — Sage 300 ไม่พร้อมใช้งาน)" : "อัปเดตสดจาก Sage 300"}
                <span className="ml-1">
                  · การเพิ่มจะสร้าง <span className="font-semibold">Pending Issue</span> ให้คลังจัดของจริงใน Sage 300 · ค่าอะไหล่ใช้ต้นทุนล่าสุดบันทึกในใบสั่งซ่อม
                </span>
              </p>
              {sageMsg && <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{sageMsg}</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Closure Document Sheet */}
      <div ref={reportRef} className="bg-white">
        <WorkOrderClosureDocument
          wo={{
            id: wo.id,
            workOrderNo: wo.workOrderNo,
            assetName: wo.assetName,
            title: wo.title,
            description: wo.description,
            status: wo.status,
            priority: wo.priority,
            assignedName: wo.assignedName,
            receiverName: wo.receiverName,
            beforeImg: wo.beforeImg,
            afterImg: wo.afterImg,
            receiverSignature: wo.receiverSignature,
            completedAt: wo.completedAt,
            createdDate: wo.createdDate,
            rootCause: wo.rootCause,
            solution: wo.solution,
            costParts: wo.costParts,
            costLabor: wo.costLabor,
            costOutsource: wo.costOutsource || 0,
            downtimeMinutes: wo.downtimeMinutes,
            contaminateChecking: wo.contaminateChecking,
            outsourceBy: wo.outsourceBy,
            actualStartAt: wo.actualStartAt,
            repairTimeMinutes: wo.repairTimeMinutes,
            parts,
          }}
        />
      </div>

      {/* Print Stylesheet */}
      <style jsx global>{`
        @media print {
          .no-print, header, aside, nav, #sidebar {
            display: none !important;
          }
          body, main {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* PDF Preview Dialog */}
      <AnimatedDialog
        open={!!previewUrl}
        onClose={() => handleClosePreview()}
        className="max-w-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 pb-4 pt-5">
          <h2 className="text-base font-semibold">
            ดูตัวอย่าง PDF — {wo.workOrderNo}
          </h2>
        </div>
        <div className="p-4 space-y-4">
          {previewUrl && (
            <iframe
              src={previewUrl}
              title={`PDF Preview ${wo.workOrderNo}`}
              className="w-full h-[68vh] rounded-lg border border-border bg-white"
            />
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={handleClosePreview}>
              ปิด
            </Button>
            <Button variant="primary" onClick={handleSavePdf} className="gap-2">
              <Download className="w-4 h-4" />
              <span>ดาวน์โหลดไฟล์ PDF</span>
            </Button>
          </div>
        </div>
      </AnimatedDialog>
    </PageShell>
  );
}
