"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ToastProvider";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Icon } from "@astryxdesign/core/Icon";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Grid } from "@astryxdesign/core/Grid";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";

import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import CountUp from "react-countup";
import { 
  ShieldCheckIcon,
  PlusIcon,
  CheckCircleIcon,
  LockClosedIcon,
  ExclamationTriangleIcon,
  DocumentCheckIcon
} from "@heroicons/react/24/outline";

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
  const { showToast } = useToast();

  useEffect(() => {
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
        }
      })
      .catch(e => console.error("Fetch work permits error:", e));
  }, []);

  const columns: TableColumn<PermitItem>[] = [
    { key: "id", header: "เลขที่ใบอนุญาต", width: proportional(1.5) },
    { 
      key: "permitType", 
      header: "ประเภทงานเสี่ยง", 
      width: proportional(2),
      renderCell: (item) => (
        <Badge 
          label={permitTypeLabels[item.permitType] || item.permitType} 
          variant={'error'} 
        />
      )
    },
    { key: "workOrder", header: "อ้างอิง WO/PM", width: proportional(1.5) },
    { key: "location", header: "สถานที่ปฏิบัติงาน", width: proportional(2) },
    { key: "applicant", header: "ผู้ขออนุญาต", width: proportional(1.5) },
    { 
      key: "lotoStatus", 
      header: "สถานะ LOTO", 
      width: proportional(1.5),
      renderCell: (item) => (
        item.lotoStatus === 'Locked Out' ? (
          <Badge label="🔒 ล็อกตัดพลังงานแล้ว" variant="error" />
        ) : (
          <Badge label="ไม่ใช้ LOTO" variant="neutral" />
        )
      )
    },
    { 
      key: "status", 
      header: "สถานะการอนุมัติ", 
      width: proportional(1.5),
      renderCell: (item) => (
        item.status === 'approved' ? (
          <Badge label="อนุมัติแล้ว" variant="success" />
        ) : item.status === 'pending_safety' ? (
          <Badge label="รอ จป. อนุมัติ" variant="warning" />
        ) : (
          <Badge label="ปิดงานแล้ว" variant="neutral" />
        )
      )
    }
  ];

  return (
    <VStack gap={6}>
      <Card elevation="low" padding={6} className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>ใบอนุญาตทำงานเสี่ยง & ระบบ LOTO (Work Permit & Lockout/Tagout)</Heading>
            <Badge label="ความปลอดภัยและอาชีวอนามัย" variant="error" icon={<Icon icon={ShieldCheckIcon} size="sm" />} />
          </HStack>
          <Text type="body" color="secondary">ควบคุมความปลอดภัยสำหรับงานซ่อมบำรุงในพื้นที่เสี่ยงอันตรายสูง</Text>
        </VStack>
        <Button label="ออกใบอนุญาตทำงานเสี่ยงใหม่" variant="primary" icon={<Icon icon={PlusIcon} size="sm" />} onClick={() => setModalOpen(true)} />
      </Card>

      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
         <Card elevation="low" padding={4} className="border-rose-500 bg-rose-50 dark:bg-rose-900/10">
           <VStack gap={1}>
             <Text type="supporting" className="text-rose-600">กำลังล็อกตัดพลังงาน</Text>
             <Heading level={2} className="text-rose-600"><CountUp end={2} /> <Text type="body" size="sm">จุด</Text></Heading>
           </VStack>
         </Card>

         <Card elevation="low" padding={4}>
           <VStack gap={1}>
             <Text type="supporting" className="text-warning-600">รอการอนุมัติจาก จป. วิชาชีพ</Text>
             <Heading level={2} className="text-warning-600"><CountUp end={1} /> <Text type="body" size="sm">ฉบับ</Text></Heading>
           </VStack>
         </Card>

         <Card elevation="low" padding={4}>
           <VStack gap={1}>
             <Text type="supporting" className="text-emerald-600">อุบัติเหตุเป็นศูนย์ (Zero Accident)</Text>
             <Heading level={2} className="text-emerald-600"><CountUp end={428} /> <Text type="body" size="sm">วันต่อเนื่อง</Text></Heading>
           </VStack>
         </Card>
      </Grid>

      <Card elevation="low" padding={6}>
        <Table<PermitItem> 
          data={permits} 
          columns={columns} 
          idKey="id" 
          density="balanced" 
          dividers="rows" 
        />
      </Card>

      {/* Modal ออกใบอนุญาต */}
      <Dialog isOpen={modalOpen} onOpenChange={(open) => setModalOpen(open)}>
        <DialogHeader title="ออกใบอนุญาตทำงานเสี่ยง" onOpenChange={(open) => setModalOpen(open)} />
        <div style={{ padding: '16px 0' }}>
           <FormLayout>
             <VStack gap={4}>
                <Field inputID="f-id" label="ประเภทงานเสี่ยง *" isRequired>
                  <Selector label="ประเภทงานเสี่ยง" isLabelHidden 
                    options={[
                      { value: "Electrical LOTO", label: "งานไฟฟ้า LOTO (ตัดระบบไฟฟ้าและพลังงาน)" },
                      { value: "Hot Work", label: "งานเชื่อมและเกิดความร้อน/ประกายไฟ" },
                      { value: "Confined Space", label: "งานในที่อับอากาศ" },
                      { value: "High Altitude", label: "งานในที่สูงเกิน 2 เมตร" },
                    ]}
                    value="Electrical LOTO"
                    onChange={() => {}}
                  />
                </Field>
                <Grid columns={2} gap={4}>
                  <Field inputID="f-id" label="อ้างอิงเลขใบสั่งงาน *" isRequired>
                    <TextInput label="เลขใบสั่งงาน" isLabelHidden placeholder="เช่น WO-2026-089" value="WO-2026-089" />
                  </Field>
                  <Field inputID="f-id" label="สถานที่ปฏิบัติงาน *" isRequired>
                    <TextInput label="สถานที่" isLabelHidden placeholder="ระบุตำแหน่ง..." value="ตู้ไฟหลัก (สถานีไฟฟ้าย่อย B)" />
                  </Field>
                </Grid>
                
                <VStack gap={2} style={{ padding: 16, backgroundColor: 'var(--color-muted)', borderRadius: 8 }}>
                   <Text type="body" weight="semibold">ขั้นตอนความปลอดภัย LOTO Mandatory Check</Text>
                   <HStack gap={2} vAlign="center"><CheckboxInput label="ปลดเมนสวิตช์ไฟฟ้าและใส่กุญแจ Safety Lockout" value={true} onChange={() => {}} /></HStack>
                   <HStack gap={2} vAlign="center"><CheckboxInput label="ติดป้ายเตือนอันตราย (Danger Tagout) ระบุชื่อช่าง" value={true} onChange={() => {}} /></HStack>
                   <HStack gap={2} vAlign="center"><CheckboxInput label="วัดแรงดันไฟฟ้าด้วย Multimeter เพื่อยืนยัน Zero Energy State" value={true} onChange={() => {}} /></HStack>
                </VStack>
             </VStack>
           </FormLayout>
        </div>
        <HStack hAlign="end" gap={3} style={{ paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
          <Button label="ยกเลิก" variant="secondary" onClick={() => setModalOpen(false)} />
          <Button 
            label={submitting ? "กำลังส่งขออนุมัติ..." : "ส่งขออนุมัติ จป. วิชาชีพ"} 
            variant="primary" 
            isDisabled={submitting} 
            onClick={() => {
              setSubmitting(true);
              setTimeout(() => { setSubmitting(false); setModalOpen(false); showToast("success", "ส่งขออนุมัติใบอนุญาตทำงานเรียบร้อยแล้ว"); }, 1200);
            }} 
            icon={<Icon icon={DocumentCheckIcon} size="sm" />}
          />
        </HStack>
      </Dialog>

    </VStack>
  );
}
