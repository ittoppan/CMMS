"use client";

// Inspection History — Phase 13
// ประวัติการตรวจเช็ค ตามเครื่องจักร / ตามผล / ช่วงเวลา (ข้อมูลจาก v_asset_inspection_history)
// สนับสนุน test #16 (Inspection History) — แสดงผลตรวจ + สาเหตุ + WO/MR ที่ถูกสร้างอัตโนมัติ

import { useState, useEffect, useCallback, useRef } from "react";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClipboardCheck, History, Wrench, FileText, ArrowLeft } from "lucide-react";

const RESULT_LABELS: Record<string, string> = {
  pass: "ผ่าน", pass_with_warning: "ผ่าน (มีข้อสังเกต)", fail: "ไม่ผ่าน", critical_fail: "วิกฤต",
};
const RESULT_STYLE: Record<string, React.CSSProperties> = {
  pass: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  pass_with_warning: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  fail: { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" },
  critical_fail: { background: "var(--cmms-danger)", color: "#fff" },
};

export default function InspectionHistoryPage() {
  const hero = usePageHero("inspections");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [assetId, setAssetId] = useState<string>("");
  const [assetName, setAssetName] = useState<string>("");
  const [resultFilter, setResultFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const reqRef = useRef(0);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      setAssetId(p.get("asset_id")?.trim() ?? "");
    } catch { /* ignore */ }
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    const reqId = ++reqRef.current;
    try {
      const q: string[] = [];
      if (assetId) q.push(`asset=${encodeURIComponent(assetId)}`);
      if (resultFilter) q.push(`result=${encodeURIComponent(resultFilter)}`);
      if (dateFrom) q.push(`date_from=${encodeURIComponent(dateFrom)}`);
      if (dateTo) q.push(`date_to=${encodeURIComponent(dateTo)}`);
      if (!assetId) q.push("limit=200");
      const res = await fetch(`/api/v1/inspection_history.php${q.length ? `?${q.join("&")}` : ""}`);
      const json = await res.json();
      if (reqRef.current !== reqId) return;
      if (Array.isArray(json.history)) setRows(json.history);
      if (json.stats) setStats(json.stats);
      if (json.history?.[0]) setAssetName(json.history[0].asset_name);
    } catch (e) {
      console.error(e);
      setError("โหลดประวัติไม่สำเร็จ");
    }
    setLoading(false);
  }, [assetId, resultFilter, dateFrom, dateTo]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <Spinner size={28} />
        <span className="text-[var(--cmms-text-secondary)]">กำลังโหลดประวัติตรวจเช็ค...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="Error" description={error} />}

      {/* Hero */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>ประวัติการตรวจเช็ค{assetName ? ` — ${assetName}` : ""}</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <History size={14} strokeWidth={1.75} aria-hidden="true" /> ดูรอบที่เสร็จสิ้น = MR/WO อัตโนมัติ
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>ตรวจสอบรอบที่ผ่านมา ผลการตรวจ และงานซ่อมที่ถูกสร้างจากผลตรวจไม่ผ่าน</p>
        </div>
        {assetId && (
          <a href={`/asset_registry/view?id=${assetId}`} className="inline-flex items-center gap-2 rounded-[var(--cmms-radius)] border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-white/20">
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" /> กลับหน้าบันทึกเครื่องจักร
          </a>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card><CardContent className="space-y-1 p-4"><p className="text-sm text-[var(--cmms-text-secondary)]">รอบตรวจทั้งหมด</p><p className="text-2xl font-bold tabular-nums">{Number(stats.total || 0)}</p></CardContent></Card>
          <Card><CardContent className="space-y-1 p-4"><p className="text-sm text-[var(--cmms-text-secondary)]">ผ่าน</p><p className="text-2xl font-bold tabular-nums" style={{ color: "var(--cmms-success)" }}>{Number(stats.passed || 0)}</p></CardContent></Card>
          <Card><CardContent className="space-y-1 p-4"><p className="text-sm text-[var(--cmms-text-secondary)]">ไม่ผ่าน</p><p className="text-2xl font-bold tabular-nums" style={{ color: "var(--cmms-danger)" }}>{Number(stats.failed || 0)}</p></CardContent></Card>
          <Card><CardContent className="space-y-1 p-4"><p className="text-sm text-[var(--cmms-text-secondary)]">วิกฤต</p><p className="text-2xl font-bold tabular-nums" style={{ color: "var(--cmms-danger)" }}>{Number(stats.critical_failed || 0)}</p></CardContent></Card>
        </div>
      )}

      {/* ตัวกรอง */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="w-[200px] space-y-1.5">
            <Label>ผลตรวจ</Label>
            <Select value={resultFilter || "__all__"} onValueChange={(v) => setResultFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="ผลทั้งหมด" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">ผลทั้งหมด</SelectItem>
                <SelectItem value="pass">ผ่าน</SelectItem>
                <SelectItem value="pass_with_warning">ผ่าน (มีข้อสังเกต)</SelectItem>
                <SelectItem value="fail">ไม่ผ่าน</SelectItem>
                <SelectItem value="critical_fail">วิกฤต</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-[200px] space-y-1.5">
            <Label>จากวันที่</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="w-[200px] space-y-1.5">
            <Label>ถึงวันที่</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={fetchHistory}>กรอง</Button>
        </CardContent>
      </Card>

      {/* รายการประวัติ */}
      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <History size={32} strokeWidth={1.5} aria-hidden="true" className="text-[var(--cmms-secondary)]" />
            <p className="font-semibold">ยังไม่มีประวัติการตรวจตรงตามเงื่อนไข</p>
            <p className="text-sm text-[var(--cmms-text-secondary)]">เมื่อทำรายการตรวจเสร็จสิ้น ประวัติจะแสดงที่นี่พร้อมผลลัพธ์</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((h) => (
            <div key={h.schedule_id} className="rounded-[10px] border p-4" style={{ borderColor: "var(--cmms-border)", backgroundColor: h.result === "fail" || h.result === "critical_fail" ? "var(--cmms-danger-light)" : "var(--cmms-bg-card)" }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-[260px] flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ClipboardCheck size={15} strokeWidth={1.75} aria-hidden="true" className="text-[var(--cmms-primary)]" />
                    <span className="font-bold">{h.template_title || h.template_code}</span>
                    <span className="cmms-andon-chip" style={RESULT_STYLE[h.result] || RESULT_STYLE.pass}>{RESULT_LABELS[h.result] || h.result}</span>
                    {h.asset_code && <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>{h.asset_name} ({h.asset_code})</span>}
                  </div>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">
                    ตรวจเมื่อ {h.completed_at ? String(h.completed_at).slice(0, 16) : "-"}
                    {h.inspector_name ? ` • ${h.inspector_name}` : ""}
                    {h.due_date ? ` • ครบกำหนด ${h.due_date}` : ""}
                    {Number(h.failed_items_count || 0) > 0 ? ` • ไม่ผ่าน ${h.failed_items_count} ข้อ` : ""}
                  </p>
                  {h.failed_items_summary && (
                    <p className="text-sm" style={{ color: "var(--cmms-danger)" }}><TriangleIcon /> {h.failed_items_summary}</p>
                  )}
                  {(h.request_code || h.work_order_code) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {h.request_code && (
                        <span className="cmms-andon-chip" style={{ background: "var(--cmms-info-light)", color: "var(--cmms-info)" }}>
                          <FileText size={12} strokeWidth={1.75} aria-hidden="true" /> {h.request_code}
                        </span>
                      )}
                      {h.work_order_code && (
                        <a href={`/repair?wo=${encodeURIComponent(h.work_order_code)}`} className="cmms-andon-chip no-underline" style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}>
                          <Wrench size={12} strokeWidth={1.75} aria-hidden="true" /> {h.work_order_code}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TriangleIcon() {
  return <span className="mr-1 inline-block text-xs">▲</span>;
}