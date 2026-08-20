"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";

/**
 * หน้า QR Sheet — ปริ้นติกเกอร์ QR ของเครื่องจักรทั้งหมด
 * สแกนแล้วเปิดฟอร์มแจ้งซ่อมพร้อมเลือกเครื่องนั้นอัตโนมัติ
 * URL: /qr-sheet
 */
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
          .filter((a) => /^A-[A-Z]{2}-\d{2}$/.test(a.code))
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

      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={4}
        style={{ borderBottom: "3px solid var(--cmms-primary)", paddingBottom: 12, marginBottom: 20 }}>
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow">QR SHEET · CMMS-TOPPAN</Text>
          <Heading level={2} style={{ margin: 0 }}>QR Sheet — เครื่องจักร (ปริ้นติกเกอร์)</Heading>
          <Text type="supporting" color="secondary" size="sm">
            สแกน QR แล้วเลือก: แจ้งซ่อมด่วน หรือ ทำเช็คชีท PM พร้อมเครื่องอัตโนมัติ
            {" · "}{machines.length} เครื่อง{machines.length > 0 && (generating ? " · กำลังสร้าง QR..." : "")}
          </Text>
        </VStack>
        <div className="no-print">
          <Button label="ปริ้นติกเกอร์" variant="primary" size="lg" isDisabled={generating} onClick={() => window.print()} />
        </div>
      </HStack>

      {error && (
        <Card padding={4} className="qr-sheet-note" style={{ background: "var(--cmms-danger-light)", borderLeftColor: "var(--cmms-danger)", marginBottom: 16 }}>
          <Text type="body" className="text-red-700">{error}</Text>
        </Card>
      )}

      <Card padding={4} className="qr-sheet-note" style={{ background: "var(--cmms-bg-muted)", marginBottom: 16 }}>
        <Text type="body" size="sm" style={{ color: "var(--cmms-text-secondary)" }}>
          <b>วิธีติดตั้ง:</b> ปริ้นหน้านี้เป็นกระดาษ A4 แล้วตัดเป็นสติกเกอร์แปะที่ตัวเครื่อง (หรือข้างกล่องสายไฟ)
          — พนักงานสแกน QR ด้วย LINE/กล้อง จะได้หน้าเลือก: <b>แจ้งซ่อมด่วน</b> หรือ <b>ทำเช็คชีท PM</b> พร้อมเครื่องถูกต้องทันที
        </Text>
      </Card>

      <div className="qr-sheet-grid">
        {machines.map((m) => (
          <Card key={m.code} className="qr-sheet-card" padding={3}>
            <VStack gap={2} hAlign="center">
              {qrMap[m.code] ? (
                <img src={qrMap[m.code]} alt={`QR ${m.code}`} />
              ) : (
                <VStack gap={2} hAlign="center" style={{ height: 120, justifyContent: "center" }}>
                  {generating ? <Spinner /> : <Text type="body" size="sm" color="secondary">ไม่พบ QR</Text>}
                </VStack>
              )}
              <Text type="body" weight="bold" style={{ color: "var(--cmms-primary)", fontSize: 18 }}>{m.code}</Text>
              <Text type="body" size="sm" color="secondary">{m.name}</Text>
              <Text type="body" size="sm" className="tip" style={{ color: "#999" }}>สแกน → แจ้งซ่อมด่วน</Text>
            </VStack>
          </Card>
        ))}
      </div>
    </div>
  );
}
