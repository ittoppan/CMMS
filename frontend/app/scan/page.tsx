"use client";

import { useCallback, useEffect, useState } from "react";
import LiffBridge from "../../components/LiffBridge";
import LiffLangToggle from "../../components/LiffLangToggle";
import { QrScanner } from "../../components/field/QrScanner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ToastProvider";
import { Wrench, ClipboardList, ScanLine, Boxes, AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useLiffLang } from "@/lib/i18n-liff";

type ResolvedType = "asset" | "work_order" | "pm" | "spare" | "unknown";

type ScanResponse = {
  success: boolean;
  type: ResolvedType;
  restricted?: boolean;
  data: any;
  meta?: { raw?: string; can_cost?: boolean };
};

type Status = "idle" | "loading" | "done" | "error";

export default function ScanLandingPage() {
  useLiffLang();
  const { showToast } = useToast();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [lastRaw, setLastRaw] = useState("");
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { document.title = "สแกน QR เครื่องจักร · CMMS-TOPPAN"; }, 350);
    return () => clearTimeout(t);
  }, []);

  const resolve = useCallback(async (raw: string, source: "camera" | "manual" | "link") => {
    const code = raw.trim();
    if (!code) return;
    setLastRaw(code);
    setStatus("loading");
    setError(null);
    setResult(null);
    try {
      const url = `/api/v1/scan.php?code=${encodeURIComponent(code)}&source=${source}&context=scan`;
      const res = await fetch(url, { credentials: "include" });
      const json = (await res.json()) as ScanResponse;
      if (!res.ok || !json?.success) {
        throw new Error((json as unknown as { error?: string })?.error || "สแกนไม่สำเร็จ");
      }
      setResult(json);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "สแกนไม่สำเร็จ กรุณาลองใหม่");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const p = params.get("q") || params.get("asset_code");
      if (p) void resolve(p, "link");
    } catch {
      /* ignore */
    }
  }, [resolve]);

  const handleManualLookup = () => {
    const code = manual.trim();
    if (!code) return;
    setManual("");
    void resolve(code, "manual");
  };

  const reportUnknown = async () => {
    if (!lastRaw) return;
    setReporting(true);
    try {
      const res = await fetch("/api/v1/scan.php?action=report_unknown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: lastRaw, note: "" }),
      });
      if (!res.ok) throw new Error("ส่งไม่สำเร็จ");
      showToast("success", "แจ้งรหัสให้ผู้ดูแลระบบแล้ว");
      setStatus("idle");
      setResult(null);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "ส่งไม่สำเร็จ");
    } finally {
      setReporting(false);
    }
  };

  const asset = result?.type === "asset" ? result.data?.asset : null;
  const activeWos: any[] = result?.type === "asset" ? (result.data?.active_work_orders ?? []) : [];
  const pmDue: any[] = result?.type === "asset" ? (result.data?.pm_due ?? []) : [];
  const workOrder = result?.type === "work_order" ? result.data?.work_order : null;
  const pm = result?.type === "pm" ? result.data?.pm : null;
  const spare = result?.type === "spare" ? result.data?.spare : null;

  return (
    <main className="min-h-screen" style={{ position: "relative" }}>
      <div style={{ position: "fixed", top: 12, right: 12, zIndex: 60 }}>
        <LiffLangToggle />
      </div>
      <LiffBridge />

      {scannerOpen && (
        <QrScanner
          onClose={() => setScannerOpen(false)}
          onResult={(text) => {
            setScannerOpen(false);
            void resolve(text, "camera");
          }}
          hint="วาง QR ให้อยู่ในกรอบ — สแกนได้ทั้ง QR และบาร์โค้ด"
        />
      )}

      <div
        style={{
          minHeight: "100dvh",
          background: "var(--cmms-text-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <Card style={{ width: "100%", maxWidth: 480, boxShadow: "0 24px 60px rgba(0,0,0,0.4)" }}>
          <CardContent className="p-6">
            <p className="cmms-eyebrow mb-3 text-center">FIELD SCAN · CMMS-TOPPAN</p>

            {status === "idle" && (
              <div className="flex flex-col items-center gap-4 py-2">
                <Badge variant="info">QR / BARCODE</Badge>
                <p className="m-0 text-center font-bold" style={{ color: "var(--cmms-text-primary)" }}>
                  สแกนเครื่องจักรเพื่อดูสถานะและแจ้งซ่อม
                </p>
                <Button
                  onClick={() => setScannerOpen(true)}
                  className="w-full"
                  style={{ height: 56, fontSize: 17, background: "var(--cmms-primary)" }}
                >
                  <ScanLine className="mr-2 h-6 w-6" aria-hidden="true" />
                  เปิดกล้องสแกน
                </Button>

                <div className="w-full">
                  <label htmlFor="scan-manual" className="mb-1 block text-sm text-[var(--cmms-text-secondary)]">
                    หรือกรอกรหัสเครื่องจักร
                  </label>
                  <form className="flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); handleManualLookup(); }}>
                    <input
                      id="scan-manual"
                      value={manual}
                      onChange={(e) => setManual(e.target.value)}
                      placeholder="เช่น MCH-001"
                      className="h-12 flex-1 min-w-0 rounded-lg border px-4 text-base outline-none"
                      style={{ borderColor: "var(--cmms-border)", color: "var(--cmms-text-primary)", background: "var(--cmms-bg)" }}
                    />
                    <Button type="submit" className="h-12">ดูข้อมูล</Button>
                  </form>
                </div>

                <p className="text-sm text-[var(--cmms-text-secondary)]">
                  ต้องการแจ้งซ่อมโดยไม่รู้รหัส? <Link href="/repair/request">เปิดฟอร์มแจ้งซ่อม</Link>
                </p>
              </div>
            )}

            {status === "loading" && (
              <div className="flex flex-col items-center gap-4 py-10">
                <Spinner />
                <p className="text-[var(--cmms-text-secondary)]">กำลังตรวจสอบรหัส {lastRaw}…</p>
              </div>
            )}

            {status === "error" && (
              <div className="flex flex-col items-center gap-4">
                <Badge variant="danger">SCAN ERROR</Badge>
                <p className="text-center text-red-600">{error}</p>
                <Button variant="outline" className="w-full" onClick={() => setScannerOpen(true)}>
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> สแกนใหม่
                </Button>
                <Link href="/repair/request" className="text-sm">แจ้งซ่อมโดยไม่ใช้รหัส</Link>
              </div>
            )}

            {status === "done" && result?.restricted && (
              <div className="flex flex-col items-center gap-4">
                <Badge variant="warning">จำกัดสิทธิ์</Badge>
                <p className="text-center text-[var(--cmms-text-secondary)]">
                  รหัสนี้ชี้ไปยังรายการที่คุณไม่มีสิทธิ์เข้าถึง
                </p>
                <Button variant="outline" className="w-full" onClick={() => { setStatus("idle"); setResult(null); }}>
                  สแกนรายการอื่น
                </Button>
              </div>
            )}

            {status === "done" && result?.type === "unknown" && (
              <div className="flex flex-col items-center gap-4">
                <AlertTriangle className="h-10 w-10 text-amber-500" aria-hidden="true" />
                <p className="text-center font-bold">ไม่พบรหัสนี้ในระบบ</p>
                <p className="text-center text-sm text-[var(--cmms-text-secondary)]">
                  รหัสที่สแกน: <strong>{lastRaw}</strong>
                </p>
                <Button className="w-full" disabled={reporting} onClick={() => void reportUnknown()}>
                  {reporting ? "กำลังส่ง…" : "แจ้งผู้ดูแลระบบ"}
                </Button>
                <Link href="/repair/request" className="text-sm">แจ้งซ่อมโดยไม่ใช้รหัส</Link>
              </div>
            )}

            {status === "done" && asset && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col items-center gap-2">
                  <span className="cmms-status ok"><span className="cmms-status-dot" />สแกนสำเร็จ</span>
                  <h2 className="m-0 tracking-wide">{asset.code}</h2>
                  <p className="m-0 text-center text-[var(--cmms-text-secondary)]">{asset.name}</p>
                  <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-[var(--cmms-text-secondary)]">
                    {asset.department && <span>{asset.department}</span>}
                    {asset.criticality && (
                      <span className="font-bold" style={{ color: asset.criticality === "A" ? "var(--cmms-danger)" : asset.criticality === "B" ? "var(--cmms-warning)" : "var(--cmms-success)" }}>
                        Criticality: {asset.criticality}
                      </span>
                    )}
                    {asset.status && <Badge variant="neutral">{asset.status}</Badge>}
                  </div>
                </div>

                {activeWos.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="font-bold" style={{ color: "var(--cmms-warning)" }}>งานที่เปิดอยู่ ({activeWos.length})</p>
                    {activeWos.map((w) => (
                      <Link key={w.id} href={`/field/work/${w.id}`} className="no-underline">
                        <Card className="w-full" style={{ border: "1px solid var(--cmms-border)" }}>
                          <CardContent className="flex items-center justify-between gap-3 p-3">
                            <div className="min-w-0">
                              <p className="m-0 truncate font-semibold text-sm">{w.work_order_no}</p>
                              <p className="m-0 truncate text-sm text-[var(--cmms-text-secondary)]">{w.title}</p>
                            </div>
                            <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}

                <Button
                  className="w-full"
                  style={{ height: 52, background: "var(--cmms-danger)" }}
                  onClick={() => (window.location.href = `/repair/request?asset_code=${encodeURIComponent(asset.code)}`)}
                >
                  <Wrench className="mr-2 h-5 w-5" aria-hidden="true" />
                  แจ้งซ่อมเครื่องนี้
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  style={{ height: 52, background: "var(--cmms-primary)" }}
                  onClick={() => (window.location.href = `/pm_am/checksheet?asset_code=${encodeURIComponent(asset.code)}`)}
                >
                  <ClipboardList className="mr-2 h-5 w-5" aria-hidden="true" />
                  ทำเช็คชีท PM
                </Button>

                {pmDue.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="font-bold text-[var(--cmms-warning)]">PM ที่ถึงกำหนด ({pmDue.length})</p>
                    {pmDue.map((p) => (
                      <Card key={p.id} className="w-full" style={{ border: "1px solid var(--cmms-warning)" }}>
                        <CardContent className="flex items-center justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <p className="m-0 truncate text-sm font-semibold">{p.title || `PM #${p.id}`}</p>
                            <p className="m-0 text-sm text-[var(--cmms-text-secondary)]">กำหนด {p.due_date || "-"}</p>
                          </div>
                          <Button size="sm" onClick={() => (window.location.href = `/pm_am/checksheet?plan_id=${p.id}&asset_code=${encodeURIComponent(asset.code)}`)}>
                            ทำเช็คชีท
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                <div className="flex justify-between text-sm">
                  <button type="button" className="text-[var(--cmms-text-secondary)] underline" onClick={() => { setStatus("idle"); setResult(null); }}>
                    สแกนใหม่
                  </button>
                  <Link href={`/asset_registry/view?code=${encodeURIComponent(asset.code)}`}>ดูข้อมูลเครื่องเต็ม</Link>
                </div>
              </div>
            )}

            {status === "done" && workOrder && (
              <div className="flex flex-col items-center gap-3">
                <Badge variant="info">WORK ORDER</Badge>
                <h2 className="m-0">{workOrder.work_order_no}</h2>
                <p className="m-0 text-center text-[var(--cmms-text-secondary)]">{workOrder.title}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Badge variant="neutral">{workOrder.status}</Badge>
                  {workOrder.priority && <Badge variant="warning">{workOrder.priority}</Badge>}
                  {workOrder.asset_code && <Badge variant="primary">{workOrder.asset_code}</Badge>}
                </div>
                <Button className="w-full" style={{ height: 52 }} onClick={() => (window.location.href = `/field/work/${workOrder.id}`)}>
                  เปิดโหมดทำงาน <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                </Button>
                <button type="button" className="text-sm text-[var(--cmms-text-secondary)] underline" onClick={() => { setStatus("idle"); setResult(null); }}>
                  สแกนใหม่
                </button>
              </div>
            )}

            {status === "done" && pm && (
              <div className="flex flex-col items-center gap-3">
                <Badge variant="primary">PM / INSPECTION</Badge>
                <h2 className="m-0 text-center">{pm.title || `PM #${pm.id}`}</h2>
                <p className="m-0 text-[var(--cmms-text-secondary)]">{pm.asset_code} · กำหนด {pm.due_date || "-"}</p>
                <Button className="w-full" style={{ height: 52 }} onClick={() => (window.location.href = `/pm_am/checksheet?plan_id=${pm.id}&asset_code=${encodeURIComponent(pm.asset_code || "")}`)}>
                  เปิดแบบฟอร์ม PM
                </Button>
                <button type="button" className="text-sm text-[var(--cmms-text-secondary)] underline" onClick={() => { setStatus("idle"); setResult(null); }}>
                  สแกนใหม่
                </button>
              </div>
            )}

            {status === "done" && spare && (
              <div className="flex flex-col items-center gap-3">
                <Badge variant="neutral">SPARE PART</Badge>
                <Boxes className="h-9 w-9 text-[var(--cmms-primary)]" aria-hidden="true" />
                <h2 className="m-0 text-center">{spare.name}</h2>
                <p className="m-0 text-[var(--cmms-text-secondary)]">{spare.code} · {spare.unit || "-"}</p>
                <Card className="w-full" style={{ background: "var(--cmms-bg-muted)" }}>
                  <CardContent className="p-3 text-center">
                    <p className="m-0 text-sm text-[var(--cmms-text-secondary)]">สต็อกที่ระบบรู้ล่าสุด (CMMS cache)</p>
                    <p className="m-0 text-2xl font-bold">{spare.last_known_stock ?? "-"}</p>
                    <p className="m-0 text-xs text-[var(--cmms-text-secondary)]">Sage 300 เป็นแหล่งข้อมูลจริง — ตัวเลขนี้ไม่ใช่การตัดสต็อก</p>
                  </CardContent>
                </Card>
                <Link href={`/spare_parts?q=${encodeURIComponent(spare.code)}`} className="text-sm">ดูรายละเอียดในคลัง</Link>
                <button type="button" className="text-sm text-[var(--cmms-text-secondary)] underline" onClick={() => { setStatus("idle"); setResult(null); }}>
                  สแกนใหม่
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
