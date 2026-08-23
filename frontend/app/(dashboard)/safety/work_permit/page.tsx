"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ToastProvider";
import { PageShell } from "@/components/PageShell";
import { HStack, VStack, Grid } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import CountUp from "react-countup";
import {
  Plus,
  FileCheck,
  Lock,
  TriangleAlert,
} from "lucide-react";

interface PermitItem extends Record<string, unknown> {
  id: string;
  permitType: "Hot Work" | "Confined Space" | "High Altitude" | "Electrical LOTO";
  workOrder: string;
  location: string;
  applicant: string;
  safetyOfficer: string;
  lotoStatus: "Locked Out" | "Unlocked" | "N/A";
  status: "approved" | "pending_safety" | "closed";
  validUntil: string;
}

const permitTypeLabels: Record<string, string> = {
  "Electrical LOTO": "งานไฟฟ้า LOTO",
  "Hot Work": "งานเชื่อม/ความร้อน",
  "Confined Space": "งานในที่อับอากาศ",
  "High Altitude": "งานที่สูง",
  "Working at Height": "งานบนที่สูง",
};

export default function WorkPermitPage() {
  const [permits, setPermits] = useState<PermitItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    permit_type: "electrical",
    repair_ref: "",
    location: "",
    loto_electrical: true,
    loto_pneumatic: false,
    loto_hydraulic: false,
    loto_chemical: false,
    safety_signature: "",
  });
  const [formError, setFormError] = useState("");
  const { showToast } = useToast();

  const loadPermits = () => {
    fetch("/api/v1/index.php?resource=work-permits")
      .then(res => res.json())
      .then(json => {
        if (json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
          const typeMap: Record<string, PermitItem['permitType']> = {
            hot_work: "Hot Work",
            confined_space: "Confined Space",
            high_altitude: "High Altitude",
            electrical_loto: "Electrical LOTO"
          };
          const fetched: PermitItem[] = json.data.map((row: any) => ({
            id: row.permit_no || `WP-${row.id}`,
            permitType: permitTypeLabels[typeMap[row.permit_type]] || permitTypeLabels[typeMap[row.permit_type] || ""] || "งานเสี่ยงอื่นๆ",
            workOrder: row.repair_id ? `WO-${row.repair_id}` : "-",
            location: row.location || "ไม่ระบุ",
            applicant: row.requester_name || "-",
            safetyOfficer: row.safety_officer_name || "-",
            lotoStatus: row.loto_electrical || row.loto_pneumatic || row.loto_hydraulic ? "Locked Out" : "N/A",
            status: row.status === "approved" ? "approved" : row.status === "active" ? "approved" : "pending_safety",
            validUntil: row.valid_until || row.created_at || "-"
          }));
          setPermits(fetched);
        } else {
          setPermits([]);
        }
      })
      .catch(e => console.error("Fetch work permits error:", e));
  };

  useEffect(() => {
    loadPermits();
  }, []);

  const lockedCount = permits.filter(p => p.lotoStatus === "Locked Out").length;
  const pendingCount = permits.filter(p => p.status === "pending_safety").length;

  const columns: SimpleColumn<PermitItem>[] = [
    { key: "id", header: "เลขที่ใบอนุญาต" },
    {
      key: "permitType",
      header: "ประเภทงานเสี่ยง",
      renderCell: (item) => (
        <Badge variant="danger">{permitTypeLabels[item.permitType] || item.permitType}</Badge>
      )
    },
    { key: "workOrder", header: "อ้างอิง WO/PM" },
    { key: "location", header: "สถานที่ปฏิบัติงาน" },
    { key: "applicant", header: "ผู้ขออนุญาต" },
    {
      key: "lotoStatus",
      header: "สถานะ LOTO",
      renderCell: (item) => (
        item.lotoStatus === 'Locked Out' ? (
          <span className="cmms-status ok"><span className="cmms-status-dot" />ล็อกตัดพลังงานแล้ว</span>
        ) : (
          <Badge variant="neutral">ไม่ใช้ LOTO</Badge>
        )
      )
    },
    {
      key: "status",
      header: "สถานะการอนุมัติ",
      renderCell: (item) => (
        item.status === 'approved' ? (
          <span className="cmms-status ok"><span className="cmms-status-dot" />อนุมัติแล้ว</span>
        ) : item.status === 'pending_safety' ? (
          <span className="cmms-status warn"><span className="cmms-status-dot" />รอ จป. อนุมัติ</span>
        ) : (
          <Badge variant="neutral">ปิดงานแล้ว</Badge>
        )
      )
    }
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">SAFETY WORK PERMIT · CMMS-TOPPAN</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "ความปลอดภัย", href: "/safety/work_permit" },
        { label: "ใบอนุญาตทำงานเสี่ยง & ระบบ LOTO" },
      ]}
      title="ใบอนุญาตทำงานเสี่ยง & ระบบ LOTO"
      description="ควบคุมความปลอดภัยสำหรับงานซ่อมบำรุงในพื้นที่เสี่ยงอันตรายสูง (Work Permit & Lockout/Tagout)"
      actions={
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          ออกใบอนุญาตทำงานเสี่ยงใหม่
        </Button>
      }
    >
      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-danger-light)] text-[var(--cmms-danger-dark)]">
              <Lock className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">กำลังล็อกตัดพลังงาน</p>
              <p className="cmms-kpi-value tabular-nums">
                <CountUp end={lockedCount} /> <span className="text-sm font-normal">จุด</span>
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]">
              <TriangleAlert className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">รอการอนุมัติจาก จป. วิชาชีพ</p>
              <p className="cmms-kpi-value tabular-nums">
                <CountUp end={pendingCount} /> <span className="text-sm font-normal">ฉบับ</span>
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-success-light)] text-[var(--cmms-success-dark)]">
              <FileCheck className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">ใบอนุญาตทั้งหมดในระบบ</p>
              <p className="cmms-kpi-value tabular-nums">
                <CountUp end={permits.length} /> <span className="text-sm font-normal">ฉบับ</span>
              </p>
            </div>
          </div>
        </Card>
      </Grid>

      <Card>
        <CardContent>
          <SimpleDataTable<PermitItem>
            columns={columns}
            data={permits}
            idKey="id"
            pageSize={10}
            emptyTitle="ยังไม่มีใบอนุญาตทำงาน"
            emptyDescription="กดปุ่ม “ออกใบอนุญาตทำงานเสี่ยงใหม่” เพื่อสร้างรายการ"
          />
        </CardContent>
      </Card>

      {/* Modal ออกใบอนุญาต */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="ออกใบอนุญาตทำงานเสี่ยง"
        className="max-w-xl"
      >
        <VStack gap={4}>
          <div className="space-y-1.5">
            <Label htmlFor="f-type">
              ประเภทงานเสี่ยง <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.permit_type}
              onValueChange={(v) => setForm({ ...form, permit_type: String(v) })}
            >
              <SelectTrigger aria-label="ประเภทงานเสี่ยง">
                <SelectValue placeholder="เลือกประเภทงานเสี่ยง..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="electrical">งานไฟฟ้า LOTO (ตัดระบบไฟฟ้าและพลังงาน)</SelectItem>
                <SelectItem value="hot_work">งานเชื่อมและเกิดความร้อน/ประกายไฟ</SelectItem>
                <SelectItem value="confined_space">งานในที่อับอากาศ</SelectItem>
                <SelectItem value="high_work">งานในที่สูงเกิน 2 เมตร</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Grid columns={2} gap={4}>
            <div className="space-y-1.5">
              <Label htmlFor="f-ref">อ้างอิงเลขใบสั่งงาน</Label>
              <Input id="f-ref" placeholder="เช่น EN-2612-013 (ไม่บังคับ)" value={form.repair_ref} onChange={(e) => setForm({ ...form, repair_ref: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-loc">
                สถานที่ปฏิบัติงาน <span className="text-destructive">*</span>
              </Label>
              <Input id="f-loc" placeholder="ระบุตำแหน่ง..." value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
          </Grid>

          <VStack gap={2} className="rounded-lg bg-secondary p-4">
            <p className="text-sm font-semibold text-foreground">ขั้นตอนความปลอดภัย LOTO Mandatory Check</p>
            <HStack gap={2} vAlign="center">
              <Checkbox id="loto-electrical" checked={form.loto_electrical} onCheckedChange={(v) => setForm({ ...form, loto_electrical: v === true })} />
              <Label htmlFor="loto-electrical" className="font-normal">ปลดเมนสวิตช์ไฟฟ้าและใส่กุญแจ Safety Lockout</Label>
            </HStack>
            <HStack gap={2} vAlign="center">
              <Checkbox id="loto-pneumatic" checked={form.loto_pneumatic} onCheckedChange={(v) => setForm({ ...form, loto_pneumatic: v === true })} />
              <Label htmlFor="loto-pneumatic" className="font-normal">ติดป้ายเตือนอันตราย (Danger Tagout) ระบุชื่อช่าง</Label>
            </HStack>
            <HStack gap={2} vAlign="center">
              <Checkbox id="loto-hydraulic" checked={form.loto_hydraulic} onCheckedChange={(v) => setForm({ ...form, loto_hydraulic: v === true })} />
              <Label htmlFor="loto-hydraulic" className="font-normal">วัดแรงดันไฟฟ้าด้วย Multimeter เพื่อยืนยัน Zero Energy State</Label>
            </HStack>
          </VStack>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </VStack>
        <HStack hAlign="end" gap={3} className="mt-4 border-t border-border pt-4">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            ยกเลิก
          </Button>
          <Button
            disabled={submitting}
            onClick={async () => {
              if (!form.location.trim()) {
                setFormError("กรุณาระบุสถานที่ปฏิบัติงาน");
                return;
              }
              setFormError("");
              setSubmitting(true);
              try {
                const body = new FormData();
                body.append("permit_type", form.permit_type);
                body.append("location", form.location.trim());
                body.append("repair_ref", form.repair_ref.trim());
                if (form.loto_electrical) body.append("loto_electrical", "1");
                if (form.loto_pneumatic) body.append("loto_pneumatic", "1");
                if (form.loto_hydraulic) body.append("loto_hydraulic", "1");
                if (form.loto_chemical) body.append("loto_chemical", "1");
                body.append("safety_signature", form.safety_signature);
                const res = await fetch("/api/v1/index.php?resource=work-permits", { method: "POST", body });
                const json = await res.json();
                if (json.status === "success") {
                  showToast("success", json.message || "สร้างใบอนุญาตเรียบร้อยแล้ว");
                  setModalOpen(false);
                  setForm({ permit_type: "electrical", repair_ref: "", location: "", loto_electrical: true, loto_pneumatic: false, loto_hydraulic: false, loto_chemical: false, safety_signature: "" });
                  loadPermits();
                } else {
                  setFormError(json.message || "ไม่สามารถสร้างใบอนุญาตได้");
                }
              } catch {
                setFormError("ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <FileCheck size={16} strokeWidth={1.75} aria-hidden="true" />
            {submitting ? "กำลังส่งขออนุมัติ..." : "ส่งขออนุมัติ จป. วิชาชีพ"}
          </Button>
        </HStack>
      </Dialog>
    </PageShell>
  );
}
