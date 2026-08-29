"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Grid } from "@/components/layout";
import CountUp from "react-countup";
import {
  FilePlus2,
  Send,
  CalendarCheck2,
  ShieldCheck,
  TriangleAlert,
  UploadCloud,
  Save,
  RotateCw,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StageBadge } from "@/components/calibration/StageBadge";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";

interface Supplier {
  id: number;
  name: string;
  email: string;
  phone: string;
}

interface CalRow {
  id: number;
  asset_id: number;
  asset_name: string;
  asset_code: string;
  next_calibration_date: string | null;
  calibration_date: string | null;
  stage: string;
  supplier_id: number | null;
  supplier_name: string | null;
  supplier_email: string | null;
  po_number: string | null;
  po_file: string | null;
  po_cc: string | null;
  po_email_sent_at: string | null;
  provider_confirm_date: string | null;
  certificate_number: string | null;
  certificate_file: string | null;
  total_cost: string | number | null;
  standard_used: string | null;
  result: string | null;
  calibration_type: string | null;
  notes: string | null;
}

const FILTERS = [
  { key: "all", label: "ทั้งหมด" },
  { key: "ready", label: "รอออก PO" },
  { key: "po", label: "มี PO ยังไม่แจ้ง" },
  { key: "emailed", label: "แจ้งแล้ว รอวันยืนยัน" },
  { key: "sent_out", label: "รอใบรับรอง" },
  { key: "overdue", label: "เกินกำหนด" },
];

export default function CalibrationPoPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CalRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const [listRes, supRes] = await Promise.all([
        fetch("/api/v1/calibration_tracking.php"),
        fetch("/api/v1/calibration_tracking.php?suppliers=1"),
      ]);
      const list = await listRes.json();
      const sups = await supRes.json();
      if (Array.isArray(list)) {
        setRows(list.filter((r: CalRow) => r.stage !== "done"));
      }
      if (Array.isArray(sups)) setSuppliers(sups);
    } catch {
      setError("โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const s = { ready: 0, po: 0, emailed: 0, sent_out: 0, overdue: 0 };
    for (const r of rows) {
      if (r.stage === "ready") s.ready++;
      else if (r.stage === "po") s.po++;
      else if (r.stage === "emailed") s.emailed++;
      else if (r.stage === "sent_out") s.sent_out++;
      else if (r.stage === "overdue") s.overdue++;
    }
    return s;
  }, [rows]);

  const filtered =
    filter === "all" ? rows : rows.filter((r) => r.stage === filter);

  const refreshRow = async () => {
    try {
      const res = await fetch("/api/v1/calibration_tracking.php");
      const json = await res.json();
      if (Array.isArray(json)) setRows(json.filter((r: CalRow) => r.stage !== "done"));
    } catch {
      /* keep current */
    }
  };

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">CALIBRATION PO</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: "PO งานสอบเทียบ" },
      ]}
      title="PO งานสอบเทียบ"
      description="ออกหมายเลข PO / เลือกผู้ให้บริการ / ส่งอีเมลแจ้งงาน / บันทึกวันยืนยัน ครบในหน้าเดียว"
      actions={
        <Button variant="secondary" onClick={() => router.push("/calibration/calendar")}>
          <CalendarCheck2 className="h-4 w-4" />
          ดูปฏิทินสอบเทียบ
        </Button>
      }
    >
      <Grid columns={{ minWidth: 200, max: 4 }} gap={4}>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]">
              <FilePlus2 className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">รอออก PO</p>
              <div className="cmms-kpi-value">
                <CountUp end={stats.ready} />
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]">
              <Send className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">มี PO ยังไม่แจ้ง</p>
              <div className="cmms-kpi-value">
                <CountUp end={stats.po} />
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]">
              <RotateCw className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">แจ้งแล้ว / ระหว่างติดตาม</p>
              <div className="cmms-kpi-value">
                <CountUp end={stats.emailed + stats.sent_out} />
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-danger-light)] text-[var(--cmms-danger-dark)]">
              <TriangleAlert className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">เกินกำหนด</p>
              <div className="cmms-kpi-value">
                <CountUp end={stats.overdue} />
              </div>
            </div>
          </div>
        </Card>
      </Grid>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "primary" : "secondary"}
            size="sm"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          ไม่มีงานสอบเทียบที่รอจัดการในหมวดนี้
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => (
            <PoRowCard key={row.id} row={row} suppliers={suppliers} onChanged={refreshRow} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function PoRowCard({
  row,
  suppliers,
  onChanged,
}: {
  row: CalRow;
  suppliers: Supplier[];
  onChanged: () => void;
}) {
  const [supId, setSupId] = useState(row.supplier_id ? String(row.supplier_id) : "");
  const [poNo, setPoNo] = useState(row.po_number ?? "");
  const [poFile, setPoFile] = useState(row.po_file ?? "");
  const [cc, setCc] = useState(row.po_cc ?? "");
  const [confirmDate, setConfirmDate] = useState(row.provider_confirm_date ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeErr, setNoticeErr] = useState("");

  // ฟอร์มปิดงาน
  const [certNo, setCertNo] = useState("");
  const [certFile, setCertFile] = useState("");
  const [calDate, setCalDate] = useState(
    row.calibration_date ? row.calibration_date.substring(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [nextDate, setNextDate] = useState("");
  const [cost, setCost] = useState("");
  const [std, setStd] = useState("");
  const [result, setResult] = useState("pass");
  const [closeOpen, setCloseOpen] = useState(row.stage === "sent_out");

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setNotice("");
    setNoticeErr("");
    try {
      const res = await fetch("/api/v1/calibration_tracking.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.message) {
        setNotice(json.message + (json.email_sent === false ? " (อีเมล์ยังไม่ได้ส่ง)" : ""));
        onChanged();
      } else {
        setNoticeErr(json.error || `ผิดพลาด (HTTP ${res.status})`);
      }
    } catch {
      setNoticeErr("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    } finally {
      setBusy(false);
    }
  };

  const uploadFile = async (file: File, kind: "po" | "cert") => {
    const fd = new FormData();
    fd.append("folder", "calibration");
    fd.append("file", file);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/upload.php", { method: "POST", body: fd });
      const json = await res.json();
      if (json.url) {
        if (kind === "po") setPoFile(json.url);
        else setCertFile(json.url);
        setNotice("อัปโหลดไฟล์สำเร็จ — กดบันทึกด้วย");
      } else {
        setNoticeErr(json.error || "อัปโหลดไม่สำเร็จ");
      }
    } catch {
      setNoticeErr("อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <p className="text-sm font-semibold">
            {row.asset_code} — {row.asset_name}
          </p>
          <p className="text-xs text-muted-foreground">
            กำหนดสอบเทียบ: {row.next_calibration_date || "-"} · ครั้งล่าสุด:{" "}
            {row.calibration_date || "-"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StageBadge stage={row.stage} />
          {row.po_email_sent_at && (
            <span className="text-xs text-muted-foreground">
              แจ้งซัพพลายเออร์: {row.po_email_sent_at}
            </span>
          )}
        </div>
      </div>

      {(notice || noticeErr) && (
        <div className="pt-3">
          {notice ? <Alert variant="success">{notice}</Alert> : null}
          {noticeErr ? <Alert variant="danger">{noticeErr}</Alert> : null}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">ผู้ให้บริการสอบเทียบ</p>
          <Select value={supId || undefined} onValueChange={(v) => setSupId(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="เลือกผู้ให้บริการ" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">หมายเลข PO</p>
          <Input placeholder="เช่น PO-2608-001" value={poNo} onChange={(e) => setPoNo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">CC อีเมล (คั่น ; )</p>
          <Input
            placeholder="anggruethai.m@toppan.co.th;..."
            value={cc}
            onChange={(e) => setCc(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label
          htmlFor={`po-file-${row.id}`}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 text-xs font-medium text-muted-foreground hover:bg-accent"
        >
          <UploadCloud className="h-4 w-4" />
          อัปโหลดไฟล์ PO (PDF)
          <input
            id={`po-file-${row.id}`}
            type="file"
            accept=".pdf,.png,.jpg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFile(f, "po");
            }}
          />
        </label>
        {poFile && (
          <a
            href={poFile}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-[var(--cmms-primary-hover)] hover:underline"
          >
            เปิดไฟล์ PO ↗
          </a>
        )}
        <Button
          variant="primary"
          size="sm"
          disabled={busy || (!poNo && !supId && !poFile)}
          onClick={() =>
            post({ action: "save_po", id: row.id, supplier_id: supId, po_number: poNo, po_file: poFile, po_cc: cc })
          }
        >
          <Save className="h-4 w-4" />
          บันทึก PO
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || (!supId && !cc)}
          onClick={() => post({ action: "send_email", id: row.id, cc })}
        >
          <Send className="h-4 w-4" />
          ส่งอีเมลแจ้งซัพพลายเออร์
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <div className="w-full max-w-[220px] space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">วันยืนยันผู้ให้บริการ</p>
          <Input type="date" value={confirmDate} onChange={(e) => setConfirmDate(e.target.value)} />
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || !confirmDate}
          onClick={() => post({ action: "confirm_date", id: row.id, provider_confirm_date: confirmDate })}
        >
          <CalendarCheck2 className="h-4 w-4" />
          บันทึกวันยืนยัน
        </Button>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <Collapsible open={closeOpen} onOpenChange={setCloseOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md py-0.5 text-left">
            <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-[var(--cmms-success)]" />
              ปิดงานสอบเทียบ (เมื่อได้ใบรับรอง)
            </p>
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className={`shrink-0 text-muted-foreground transition-transform ${closeOpen ? "rotate-180" : ""}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
        <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="เลขใบรับรอง" placeholder="Cert No." value={certNo} onChange={(e) => setCertNo(e.target.value)} />
          <Input label="วันที่สอบเทียบ" type="date" value={calDate} onChange={(e) => setCalDate(e.target.value)} />
          <Input label="ครบกำหนดครั้งถัดไป" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
          <Input label="ค่าใช้จ่าย (บาท)" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="w-full max-w-[220px] space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">มาตรฐานที่ใช้สอบเทียบ</p>
            <Input placeholder="เช่น ISO 17025" value={std} onChange={(e) => setStd(e.target.value)} />
          </div>
          <div className="w-full max-w-[160px] space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">ผลการสอบเทียบ</p>
            <Select value={result} onValueChange={(v) => setResult(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pass">ผ่าน (Pass)</SelectItem>
                <SelectItem value="conditional">เงื่อนไข (Conditional)</SelectItem>
                <SelectItem value="fail">ไม่ผ่าน (Fail)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label
            htmlFor={`cert-file-${row.id}`}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 text-xs font-medium text-muted-foreground hover:bg-accent"
          >
            <UploadCloud className="h-4 w-4" />
            ใบรับรอง (PDF)
            <input
              id={`cert-file-${row.id}`}
              type="file"
              accept=".pdf,.png,.jpg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f, "cert");
              }}
            />
          </label>
          {certFile && (
            <a
              href={certFile}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-[var(--cmms-primary-hover)] hover:underline"
            >
              เปิดไฟล์ใบรับรอง ↗
            </a>
          )}
          <Button
            variant="primary"
            size="sm"
            disabled={busy || (!certNo && !calDate)}
            onClick={() =>
              post({
                action: "complete",
                id: row.id,
                asset_id: row.asset_id,
                calibration_type: row.calibration_type || "full",
                calibration_date: calDate,
                next_calibration_date: nextDate || null,
                certificate_number: certNo,
                certificate_file: certFile,
                total_cost: cost,
                result,
                standard_used: std,
              })
            }
          >
            <ShieldCheck className="h-4 w-4" />
            ปิดงานสอบเทียบ
          </Button>
        </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </Card>
  );
}