"use client";

import { useCallback, useEffect, useState } from "react";
import { usePageHero } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { QrScanner } from "@/components/field/QrScanner";
import { ScanLine, Smartphone, ChevronRight, RefreshCw, FileText } from "lucide-react";

interface InstrumentStatus {
  asset_id: number;
  asset_code?: string;
  asset_name?: string;
  measurement_type?: string;
  condition?: string;
  status_label?: string;
  status_color?: string;
  next_calibration_date?: string | null;
  condition_date?: string | null;
  active_plan?: { id: number; next_calibration_date?: string | null } | null;
  recent_runs?: { id: number; status: string; result?: string | null; calibration_date?: string | null }[];
}

export default function CalibrationMobilePage() {
  const hero = usePageHero("calibration");
  const router = useRouter();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [instr, setInstr] = useState<InstrumentStatus | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("asset_code") || params.get("code");
      if (code) void resolve(code);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolve = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    setStatus("loading");
    setError(null);
    setInstr(null);
    try {
      // 1) แก้รหัส → asset (scan API)
      const scanRes = await fetch(`/api/v1/scan.php?code=${encodeURIComponent(code)}&source=mobile&context=calibration`, { credentials: "include" });
      const scan = await scanRes.json();
      if (!scanRes.ok || !scan?.success) throw new Error(scan?.error || "ไม่พบรหัสนี้ในระบบ");

      // 2) ถ้าเป็น asset → ดึงสถานะสอบเทียบของเครื่องมือ
      let assetId: number | null = null;
      if (scan.type === "asset") assetId = scan.data?.asset?.id;
      else if (scan.type === "calibration_instrument" || scan.type?.startsWith("instrument")) assetId = scan.data?.asset?.id ?? scan.data?.instrument?.id;

      if (!assetId) throw new Error("รหัสนี้ไม่ใช่เครื่องมือวัดที่สอบเทียบได้");

      const res = await fetch(`/api/v1/calibration_management.php?resource=instrument&id=${assetId}`, { credentials: "include" });
      const json = await res.json();
      if (!json || json.error) throw new Error(json?.error || "ไม่สามารถโหลดสถานะสอบเทียบได้");
      setInstr(json);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
      setStatus("error");
    }
  }, []);

  const handleManual = () => {
    const code = manual.trim();
    if (!code) return;
    setManual("");
    void resolve(code);
  };

  const statusVariant =
    instr?.status_color === "red" ? "danger"
    : instr?.status_color === "amber" ? "warning"
    : instr?.status_color === "green" ? "success"
    : "neutral";

  const activeRun = instr?.recent_runs?.find((r) => ["scheduled", "in_progress", "pending_review", "pending"].includes(r.status));
  const lastRun = instr?.recent_runs?.[0];

  return (
    <div className="min-h-dvh bg-background pb-10">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-[var(--cmms-primary-hover)]" aria-hidden="true" />
            <span className="text-sm font-semibold">สอบเทียบ · โหมดมือถือ</span>
          </div>
          <Badge variant="info">SCAN</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pt-5">
        <p className="cmms-eyebrow">{hero.eyebrow}</p>
        <h1 className="text-xl font-bold">สอบเทียบเครื่องมือจากหน้างาน</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          สแกน QR/บาร์โค้ดเครื่องมือวัดเพื่อเปิดใบสอบเทียบ — ตรวจสถานะ, เริ่มรอบ, และบันทึกผลแบบง่าย
        </p>

        {status === "idle" && (
          <div className="mt-6 flex flex-col items-center gap-4">
            <Button className="w-full h-14 text-base" onClick={() => setScannerOpen(true)}>
              <ScanLine className="mr-2 h-6 w-6" aria-hidden="true" /> เปิดกล้องสแกน
            </Button>
            <form className="flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); handleManual(); }}>
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="กรอกรหัสเครื่องมือ เช่น MASS-001"
                className="h-12 flex-1 min-w-0 rounded-lg border px-4 text-base outline-none"
              />
              <Button type="submit" className="h-12">ดูข้อมูล</Button>
            </form>
            <p className="text-xs text-muted-foreground">รหัสควรเป็นรหัส asset_registry ของเครื่องมือวัด</p>
          </div>
        )}

        {status === "loading" && (
          <div className="mt-10 flex flex-col items-center gap-3">
            <Spinner />
            <p className="text-sm text-muted-foreground">กำลังดึงสถานะสอบเทียบ…</p>
          </div>
        )}

        {status === "error" && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <Alert variant="danger">{error}</Alert>
            <Button variant="outline" className="w-full" onClick={() => { setStatus("idle"); setInstr(null); }}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> สแกนใหม่
            </Button>
          </div>
        )}

        {status === "done" && instr && (
          <div className="mt-5 flex flex-col gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{instr.asset_code}</p>
                    <h2 className="text-lg font-bold leading-tight">{instr.asset_name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {instr.measurement_type || "ไม่ระบุประเภท"} {instr.condition && <>· สภาพ: {instr.condition}</>}
                    </p>
                  </div>
                  <Badge variant={statusVariant as any}>{instr.status_label || instr.status_color || "ปกติ"}</Badge>
                </div>

                {instr.next_calibration_date && (
                  <p className="mt-3 text-sm">
                    ครบกำหนดถัดไป: <strong>{instr.next_calibration_date}</strong>
                    {instr.active_plan?.next_calibration_date && instr.active_plan.next_calibration_date !== instr.next_calibration_date && (
                      <span className="text-muted-foreground"> (แผน: {instr.active_plan.next_calibration_date})</span>
                    )}
                  </p>
                )}
              </CardContent>
            </Card>

            {activeRun ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">มีรอบกำลังดำเนินการ</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <div>
                    <Badge variant="primary">รอบ #{activeRun.id}</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">สถานะ: {activeRun.status}</p>
                  </div>
                  <Button size="sm" onClick={() => router.push(`/calibration/run/${activeRun.id}`)}>
                    ดำเนินการต่อ <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {lastRun && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">ผลสอบเทียบล่าสุด</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {lastRun.result ? (
                          <Badge variant={lastRun.result === "pass" ? "success" : lastRun.result === "fail" ? "danger" : "warning"}>
                            {lastRun.result}
                          </Badge>
                        ) : (
                          <Badge variant="neutral">{lastRun.status}</Badge>
                        )}
                        <span className="text-sm text-muted-foreground">{lastRun.calibration_date || "รอคำตอบ"}</span>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => router.push(`/calibration/run/${lastRun.id}`)}>
                        <FileText className="mr-1 h-4 w-4" aria-hidden="true" /> เปิดรอบ
                      </Button>
                    </CardContent>
                  </Card>
                )}

                <Button
                  className="w-full"
                  style={{ height: 52 }}
                  disabled={!instr.active_plan}
                  onClick={() => router.push(`/calibration/instruments/${instr.asset_id}`)}
                >
                  {instr.active_plan ? "เริ่มรอบสอบเทียบจากแผน" : "ดูรายละเอียดเครื่องมือ"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {instr.active_plan
                    ? "เลือกแผนที่ต้องการในหน้ารายละเอียดเพื่อเริ่มสอบเทียบ"
                    : "เครื่องมือนี้ยังไม่มีแผน active — ไปที่หน้าเครื่องมือเพื่อสร้างแผนก่อน"}
                </p>
              </>
            )}

            <Button variant="ghost" className="w-full" onClick={() => { setStatus("idle"); setInstr(null); }}>
              <ScanLine className="mr-2 h-4 w-4" aria-hidden="true" /> สแกนเครื่องอื่น
            </Button>
          </div>
        )}
      </main>

      {scannerOpen && (
        <QrScanner
          onClose={() => setScannerOpen(false)}
          onResult={(text) => {
            setScannerOpen(false);
            void resolve(text);
          }}
          hint="วาง QR ให้อยู่ในกรอบ — สแกนได้ทั้ง QR และบาร์โค้ด"
        />
      )}
    </div>
  );
}