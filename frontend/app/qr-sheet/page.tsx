"use client";

import { ModuleGuide } from "@/components/dashboard/module-guide";
import { usePageHero } from "@/lib/i18n";

import { useEffect, useState } from "react";
import { useMemo } from "react";
import QRCode from "qrcode";
import { qrDarkColor } from "@/lib/qr-color";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

type Asset = {
  id: number;
  code: string;
  name: string;
  department: string | null;
  criticality: string | null;
  status: string | null;
  payload: string;
  liff_url?: string;
};

export default function QrSheetPage() {
  const hero = usePageHero("qr-sheet");

  const [machines, setMachines] = useState<Asset[]>([]);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [liffId, setLiffId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("all");

  // ตัวกรองก่อนพิมพ์: เครื่อง/แผนก — ปริ้นเฉพาะรายการที่กรองอยู่
  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const m of machines) if (m.department) set.add(m.department);
    return [...set].sort((a, b) => a.localeCompare(b, "th"));
  }, [machines]);

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    return machines.filter((m) => {
      if (dept !== "all" && (m.department || "") !== dept) return false;
      if (!key) return true;
      return `${m.code} ${m.name}`.toLowerCase().includes(key);
    });
  }, [machines, q, dept]);

  useEffect(() => {
    fetch("/api/v1/scan.php?action=labels", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        const rows = json?.items ?? [];
        const list = (Array.isArray(rows) ? rows : [])
          .filter((a) => /^A-[A-Z]{2}-\d{2}$/.test(a.code))
          .sort((a, b) => a.code.localeCompare(b.code));
        setMachines(list);
        setLiffId(typeof json?.liff_id === "string" ? json.liff_id : "");
      })
      .catch(() => setError("โหลดข้อมูลเครื่องจักรไม่สำเร็จ"));
  }, []);

  useEffect(() => {
    if (machines.length === 0) return;
    setGenerating(true);
    let cancelled = false;
    (async () => {
      const map: Record<string, string> = {};
      const dark = qrDarkColor();
      for (const m of machines) {
        try {
          // ลิงก์ LIFF (?asset_code=…) — กล้องมือถือสแกนแล้วเปิดหน้าแจ้งซ่อมได้จริง
          // ถ้ายังไม่ได้ตั้ง LIFF ID จะ fallback เป็น payload มาตรฐาน CMMS-A-<token>
          const payload = m.liff_url || (m.payload && m.payload.startsWith("CMMS-") ? m.payload : m.code);
          // margin = 4 โมดูล = quiet zone ตามมาตรฐาน QR — ลิงก์ LIFF ยาวขึ้นเป็น QR
          // ระดับ 4 (33×33) ถ้า margin แนบเกินไปกล้องมือถือจะหามุม QR ไม่เจอ
          map[m.code] = await QRCode.toDataURL(payload, {
            width: 300,
            margin: 4,
            color: { dark, light: "#FFFFFF" },
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

  const handlePrint = async () => {
    const firstLog = !printed;
    setPrinted(true);
    window.print();
    if (!firstLog || filtered.length === 0) return;
    try {
      await fetch("/api/v1/scan.php?action=print_log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ asset_ids: filtered.map((m) => m.id), template: "a4-sheet" }),
      });
    } catch {
      /* การบันทึกประวัติพิมพ์ไม่บล็อกการพิมพ์ */
    }
  };

  return (
    <div style={{ fontFamily: "'Sarabun', sans-serif", padding: 24, background: "#fff", color: "#111" }}>
      <style>{`
        .qr-sheet-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .qr-sheet-card { text-align: center; break-inside: avoid; }
        .qr-sheet-card img { width: 100%; max-width: 170px; }
        /* impeccable-disable-next-line side-tab: print-only note accent */
        .qr-sheet-note { border-left: 2px solid var(--color-primary); border-radius: 0 6px 6px 0; opacity: 0.4; }
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
          <h1 style={{ margin: 0, fontSize: "inherit", fontWeight: 700 }}>QR Sheet — เครื่องจักร (ปริ้นติกเกอร์)</h1>
          <p className="text-sm text-[var(--cmms-text-secondary)] supporting">
            สแกน QR แล้วเลือก: แจ้งซ่อมด่วน หรือ ทำเช็คชีท PM พร้อมเครื่องอัตโนมัติ
            {" · "}
            {filtered.length === machines.length ? `${machines.length} เครื่อง` : `${filtered.length} จาก ${machines.length} เครื่อง`}
            {machines.length > 0 && (generating ? " · กำลังสร้าง QR..." : "")}
          </p>
        </div>
        <div className="no-print">
          <Button
            className="w-full"
            disabled={generating}
            onClick={() => void handlePrint()}
          >
            ปริ้นติกเกอร์
          </Button>
        </div>
      </div>

      <ModuleGuide
        className="no-print"
        name="พิมพ์ป้าย QR"
        summary="สร้างป้าย QR ประจำเครื่องจักรเพื่อพิมพ์ติดที่เครื่อง — ผู้ใช้สแกนแล้วแจ้งซ่อมด่วนหรือทำเช็คชีท PM ของเครื่องนั้นได้ทันที"
        steps={[
          "ตรวจรายการเครื่องที่จะพิมพ์ (ป้ายเป็นลิงก์ LIFF ของ LINE OA ประจำเครื่อง)",
          "กด “ปริ้นติกเกอร์” — ระบบบันทึกประวัติการพิมพ์ไว้",
          "ติดป้ายที่เครื่องในตำแหน่งที่สแกนง่าย แล้วทดสอบสแกนหนึ่งครั้งก่อนแจกจ่าย",
        ]}
        source="รายการเครื่องและลิงก์ QR จาก /api/v1/scan.php?action=labels (ประวัติพิมพ์ที่ action=print_log)"
        note="ป้ายที่พิมพ์ก่อนแก้รหัสเครื่องจะชี้ไปรหัสเดิม — พิมพ์ใหม่เมื่อข้อมูลเครื่องเปลี่ยน"
        related={[
          { href: "/asset_registry", label: "ทะเบียนเครื่องจักร" },
          { href: "/pm_am/checksheet", label: "เช็คชีท PM" },
        ]}
      />

      {error && (
        <Card className="w-full qr-sheet-note" style={{ background: "var(--cmms-danger-light)", borderLeftColor: "var(--cmms-danger)", marginBottom: 16 }}>
          <CardContent className="p-4">
            <p className="text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {liffId === "" && machines.length > 0 && (
        <Card className="w-full qr-sheet-note" style={{ background: "var(--cmms-warning-light)", borderLeftColor: "var(--cmms-warning)", marginBottom: 16 }}>
          <CardContent className="p-4">
            <p className="text-sm">
              <b>ยังไม่ได้ตั้ง LIFF ID</b> — QR จะถูกพิมพ์เป็นเพย์โหลดภายใน (CMMS-A-…) ซึ่งกล้องมือถือเปิดไม่ได้
              ให้ตั้งค่า <b>LIFF App ID</b> ในการตั้งค่า LINE ก่อนพิมพ์ แล้วโหลดหน้านี้ใหม่
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="w-full qr-sheet-note" style={{ background: "var(--cmms-bg-muted)", marginBottom: 16 }}>
        <CardContent className="p-4">
          <p className="text-sm text-[var(--cmms-text-secondary)]">
            <b>วิธีติดตั้ง:</b> ปริ้นหน้านี้เป็นกระดาษ A4 แล้วตัดเป็นสติกเกอร์แปะที่ตัวเครื่อง (หรือข้างกล่องสายไฟ)
            — QR เป็นลิงก์ LIFF ของ LINE OA: พนักงานสแกนด้วยกล้องมือถือหรือกล้องใน LINE
            จะเปิดหน้า <b>แจ้งซ่อม · PM · ประวัติ</b> ของเครื่องนั้นทันที
          </p>
        </CardContent>
      </Card>

      <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหารหัส/ชื่อเครื่อง"
          aria-label="ค้นหาเครื่องก่อนพิมพ์"
          style={{ border: "1px solid var(--cmms-border)", borderRadius: 6, padding: "8px 10px", fontSize: 14, minWidth: 220 }}
        />
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          aria-label="กรองตามแผนก"
          style={{ border: "1px solid var(--cmms-border)", borderRadius: 6, padding: "8px 10px", fontSize: 14 }}
        >
          <option value="all">ทุกแผนก</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        {(q !== "" || dept !== "all") && (
          <Button variant="outline" onClick={() => { setQ(""); setDept("all"); }}>ล้างตัวกรอง</Button>
        )}
        <span className="text-sm text-[var(--cmms-text-secondary)]">จะพิมพ์ {filtered.length} ป้าย</span>
      </div>

      <div className="qr-sheet-grid">
        {filtered.length === 0 && (
          <p className="text-sm" style={{ gridColumn: "1 / -1", color: "var(--cmms-text-secondary)" }}>
            ไม่พบเครื่องตามตัวกรอง — ล้างคำค้นหาหรือเปลี่ยนแผนกก่อนพิมพ์
          </p>
        )}
        {filtered.map((m) => (
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
              <p className="text-xs text-[var(--cmms-text-secondary)] tip">สแกน → เปิด LINE แจ้งซ่อม</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}