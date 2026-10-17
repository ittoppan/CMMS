"use client";

// repair/print — ใบบันทึกงานซ่อม (MAINTENANCE RECORD) สำหรับติดพิมพ์ (port จาก repair/print.php)
// data: GET /api/v1/repair.php?id=N + GET /api/v1/repair.php?parts=1&id=N

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

type RepairRow = Record<string, any>;

const fmtDate = (v: any) => (v ? String(v).split(" ")[0] : "-");
const or = (v: any, dash = "-") => (v === null || v === undefined || String(v).trim() === "" ? dash : String(v));

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 break-words">{value}</div>
    </div>
  );
}

export default function RepairPrintPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id || params?.["id"] || 0);
  const [row, setRow] = useState<RepairRow | null>(null);
  const [parts, setParts] = useState<RepairRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) { setError("ไม่พบเลขที่เอกสาร"); setLoading(false); return; }
    Promise.all([
      fetch(`/api/v1/repair.php?id=${id}`),
      fetch(`/api/v1/repair.php?parts=1&id=${id}`),
    ])
      .then(async ([a, b]) => {
        const r = await a.json();
        if (!Array.isArray(r) && r && !r.error) setRow(r);
        else if (!r && a.status === 404) setError("ไม่พบรายการงานซ่อม");
        const p = await b.json();
        setParts(Array.isArray(p) ? p : []);
      })
      .catch(() => setError("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="p-10 text-center text-sm text-muted-foreground">กำลังโหลดเอกสาร...</div>;
  }
  if (error || !row) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Alert variant="danger">{error || "ไม่พบรายการงานซ่อม"}</Alert>
        <Button variant="secondary" className="mt-3" onClick={() => window.history.back()}>
          <ArrowLeft className="w-4 h-4" /> ย้อนกลับ
        </Button>
      </div>
    );
  }

  const REQUEST_URL = () => {
    window.print();
  };

  return (
    <div className="mx-auto max-w-4xl p-6 print:p-0">
      <p className="cmms-eyebrow no-print">repair / พิมพ์ใบบันทึกงานซ่อม</p>
      <div className="no-print mb-4 flex items-center justify-between">
        <Button variant="secondary" onClick={() => window.history.back()}>
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> ย้อนกลับ
        </Button>
        <Button onClick={REQUEST_URL}>
          <Printer className="w-4 h-4" aria-hidden="true" /> พิมพ์เอกสาร (Print)
        </Button>
      </div>

      <Card className="bg-white">
        <CardHeader className="border-b-2 border-black pb-4">
          <CardTitle className="flex items-center justify-between gap-4 print:justify-between">
            <span className="text-lg font-black">TOPPAN</span>
            <span className="text-center">
              <span className="block text-base font-bold">ใบบันทึกงานซ่อม</span>
              <span className="block text-xs text-slate-600">MAINTENANCE RECORD</span>
            </span>
            <span className="text-right text-xs font-bold">F-EN-03 REV.05<br />#{row.id}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="เลขที่ใบงาน (WO)" value={or(row.work_order_no, `#${row.id}`)} />
            <Field label="สถานะ" value={or(row.status)} />
            <Field label="ประเภทงานซ่อม" value={or(row.repair_code, or(row.failure_code))} />
            <Field label="วันที่แจ้ง" value={fmtDate(row.created_at)} />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold uppercase text-slate-600 border-b border-slate-300 pb-1">เครื่องจักร</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="รหัสเครื่อง" value={or(row.asset_code)} />
              <Field label="ชื่อเครื่อง" value={or(row.asset_name)} />
              <Field label="แผนก" value={or(row.department_id)} />
              <Field label="ล็อตการผลิต" value={or(row.product_lot_no)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold uppercase text-slate-600 border-b border-slate-300 pb-1">รายละเอียด</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="ชื่องาน" value={or(row.title)} />
              <Field label="ผู้ซ่อม (ช่าง)" value={or(row.assigned_name)} />
              <Field label="อาการแจ้งเริ่มต้น (Failure)" value={or(row.failure_report || row.description)} />
              <Field label="Downtime เริ่ม — สิ้นสุด" value={`${fmtDate(row.downtime_start)} — ${fmtDate(row.downtime_end)}`} />
              <div className="sm:col-span-2"><Field label="การวิเคราะห์ (Diagnosis)" value={or(row.diagnosis)} /></div>
              <div className="sm:col-span-2"><Field label="สาเหตุรายหลัก (Root Cause)" value={or(row.root_cause || row.solution)} /></div>
              <div className="sm:col-span-2"><Field label="การดำเนินการแก้ไข (Resolution)" value={or(row.resolution)} /></div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold uppercase text-slate-600 border-b border-slate-300 pb-1">อะไหล่ที่ใช้</div>
            {parts.length > 0 ? (
              <table className="w-full text-sm border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-left">
                    <th className="border border-slate-300 px-2 py-1.5 w-1/3">รหัส</th>
                    <th className="border border-slate-300 px-2 py-1.5">ชื่ออะไหล่</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-center w-24">จำนวน</th>
                    <th className="border border-slate-300 px-2 py-1.5 w-28">ราคา/หน่วย</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p, i) => (
                    <tr key={i}>
                      <td className="border border-slate-300 px-2 py-1 font-mono">{or(p.code)}</td>
                      <td className="border border-slate-300 px-2 py-1">{or(p.name)}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center font-mono">{or(p.quantity_used)}</td>
                      <td className="border border-slate-300 px-2 py-1 font-mono">{or(p.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-500">— ไม่มีการเบิกใช้อะไหล่ —</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-6 pt-8">
            {["ผู้แจ้งงาน", "ช่างผู้ซ่อม", "ผู้ตรวจสอบ"].map((lbl) => (
              <div key={lbl} className="text-center">
                <div className="border-b border-black pb-8" />
                <div className="mt-1 text-xs font-semibold">{lbl}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
