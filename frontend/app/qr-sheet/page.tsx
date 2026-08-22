"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

type Asset = {
  id: number;
  code: string;
  name: string;
  department: string;
  criticality: string;
  status: string;
};

const APP_BASE =
  (typeof window !== "undefined" && window.location.origin) ||
  "https://ommatophorous-robert-fortifyingly.ngrok-free.app";

export default function QrSheetPage() {
  const [machines, setMachines] = useState<Asset[]>([]);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch("/api/v1/asset_registry.php")
      .then((r) => r.json())
      .then((rows: Asset[]) => {
        const list = (Array.isArray(rows) ? rows : [])
          .filter((a) => /^A-[A-Z]{2}-\\d{2}$/.test(a.code))
          .sort((a, b) => a.code.localeCompare(b.code));
        setMachines(list);
      })
      .catch(() => setError("โหลดข้อมูลเครื่องจักรไม่สำเร็จ"));
  }, []);

  useEffect(() => {
    if (machines.length === 0) return;
    setGenerating(true);
    let cancelled = false;
    (async () => {
      const map: Record<string, string> = {};
      for (const m of machines) {
        try {
          const url = `${APP_BASE}/scan?asset_code=${encodeURIComponent(m.code)}`;
          map[m.code] = await QRCode.toDataURL(url, {
            width: 300,
            margin: 1,
            color: { dark: "var(--cmms-primary)", light: "#FFFFFF" },
          });
        } catch {
          /* ข้ามเครื่องที่ generate ไม่ได้ */
        }
      }
      if (!cancelled) setQrMap(map);
      setGenerating(false);
    })();
    return () => { cancelled = true; };
  }, [machines]);

  return (
    <div style={{ fontFamily: "'Inter', 'Noto Sans Thai', -apple-system, 'Segoe UI', sans-serif", padding: 24, background: "#fff" }}>
      <style>{`
        .qr-sheet-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .qr-sheet-card { text-align: center; break-inside: avoid; }
        .qr-sheet-card img { width: 100%; max-width: 170px; }
        .qr-sheet-note { border-left: 4px solid #0068B5; border-radius: 0 6px 6px 0; }
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
          .qr-sheet-grid { grid-template-columns: repeat(4, 1fr); gap: 8px; }
          .qr-sheet-card { border: 1px solid #bbb; border-radius: 4px; }
          .qr-sheet-card .tip { display: none; }
        }
      `}</style>

      <div className="flex items-center justify-between gap-4 wrap">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-[var(--cmms-text-secondary)] cmms-eyebrow">QR SHEET · CMMS-TOPPAN</p>
          <h2 style={{ margin: 0 }}>QR Sheet — เครื่องจักร (ปริ้นติกเกอร์)</h2>
          <p className="text-sm text-[var(--cmms-text-secondary)] supporting">
            สแกน QR แล้วเลือก: แจ้งซ่อมด่วน หรือ ทำเช็คชีท PM พร้อมเครื่องอัตโนมัติ
            {" · "}{machines.length} เครื่อง{machines.length > 0 && (generating ? " · กำลังสร้าง QR..." : "")}
          </p>
        </div>
        <div className="no-print">
          <Button
            className="w-full"
            disabled={generating}
            onClick={() => window.print()}
          >
            ปริ้นติกเกอร์
          </Button>
        </div>
      </div>

      {error && (
        <Card className="w-full qr-sheet-note" style={{ background: "var(--cmms-danger-light)", borderLeftColor: "var(--cmms-danger)", marginBottom: 16 }}>
          <CardContent className="p-4">
            <p className="text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card className="w-full qr-sheet-note" style={{ background: "var(--cmms-bg-muted)", marginBottom: 16 }}>
        <CardContent className="p-4">
          <p className="text-sm text-[var(--cmms-text-secondary)]">
            <b>วิธีติดตั้ง:</b> ปริ้นหน้านี้เป็นกระดาษ A4 แล้วตัดเป็นสติกเกอร์แปะที่ตัวเครื่อง (หรือข้างกล่องสายไฟ)
            — พนักงานสแกน QR ด้วย LINE/กล้อง จะได้หน้าเลือก: <b>แจ้งซ่อมด่วน</b> หรือ <b>ทำเช็คชีท PM</b> พร้อมเครื่องถูกต้องทันที
          </p>
        </CardContent>
      </Card>

      <div className="qr-sheet-grid">
        {machines.map((m) => (
          <Card key={m.code} className="qr-sheet-card">
            <CardContent className="flex flex-col items-center gap-2 p-3">
              {qrMap[m.code] ? (
                <img src={qrMap[m.code]} alt={`QR ${m.code}`} />
              ) : (
                <div className="flex flex-col items-center h-[120px] justify-center">
                  {generating ? <Spinner /> : <p className="text-sm text-[var(--cmms-text-secondary)]">ไม่พบ QR</p>}
                </div>
              )}
              <p className="font-bold text-[var(--cmms-primary)] text-sm">{m.code}</p>
              <p className="text-sm text-[var(--cmms-text-secondary)]">{m.name}</p>
              <p className="text-xs text-[var(--cmms-text-secondary)] tip">สแกน → แจ้งซ่อมด่วน</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}