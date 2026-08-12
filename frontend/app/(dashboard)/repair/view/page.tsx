"use client";

import { useState, useEffect } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Icon } from "@astryxdesign/core/Icon";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Grid } from "@astryxdesign/core/Grid";
import { 
  CheckCircleIcon,
  PrinterIcon,
  ArrowLeftIcon,
  CameraIcon,
  UserIcon,
  WrenchScrewdriverIcon,
  ClockIcon,
  DocumentCheckIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";

interface WorkOrderDetail {
  id: number;
  workOrderNo: string;
  assetName: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignedName: string;
  receiverName: string;
  beforeImg: string;
  afterImg: string;
  receiverSignature: string;
  completedAt: string;
  rootCause: string;
  solution: string;
  costParts: number;
  costLabor: number;
  downtimeMinutes: number;
}

export default function RepairViewDetailsPage() {
  const [woId, setWoId] = useState<string>("1");
  const [loading, setLoading] = useState(true);
  const [wo, setWo] = useState<WorkOrderDetail>({
    id: 0,
    workOrderNo: "-",
    assetName: "-",
    title: "-",
    description: "-",
    status: "",
    priority: "",
    assignedName: "-",
    receiverName: "-",
    beforeImg: "",
    afterImg: "",
    receiverSignature: "",
    completedAt: "-",
    rootCause: "-",
    solution: "-",
    costParts: 0,
    costLabor: 0,
    downtimeMinutes: 0
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id") || "1";
    setWoId(idParam);

    fetch(`/api/v1/repair.php?id=${idParam}`)
      .then(res => res.json())
      .then(row => {
        if (row && row.id) {
          setWo({
            id: row.id,
            workOrderNo: row.work_order_no || `EN-${row.id}`,
            assetName: row.asset_name || "-",
            title: row.title || "-",
            description: row.description || row.failure_report || "-",
            status: row.status || "",
            priority: row.priority || "",
            assignedName: row.assigned_name || "-",
            receiverName: row.receiver_name || "-",
            beforeImg: row.before_image_path || "",
            afterImg: row.after_image_path || "",
            receiverSignature: row.receiver_signature_path || "",
            completedAt: row.completed_at || row.updated_at || "-",
            rootCause: row.root_cause || "-",
            solution: row.solution || row.resolution || "-",
            costParts: Number(row.cost_parts || 0),
            costLabor: Number(row.cost_labor || 0),
            downtimeMinutes: Number(row.downtime_minutes || 0)
          });
        }
      })
      .catch(e => console.error("Fetch WO error", e))
      .finally(() => setLoading(false));
  }, []);

  const handlePrint = () => {
    window.print();
  };

  return (
    <VStack gap={6}>
      {/* Header (Hidden on Print) */}
      <div className="no-print">
        <HStack hAlign="between" vAlign="center">
          <VStack gap={1}>
            <HStack gap={3} vAlign="center">
              <Heading level={2}>รายละเอียดใบส่งมอบงานปิดซ่อม</Heading>
              <Badge label={wo.workOrderNo} variant="info" />
              <Badge label="ซ่อมเสร็จสิ้น" variant="success" />
            </HStack>
            <Text type="body" color="secondary">
              เอกสารบันทึกรายละเอียดการซ่อม รูปเปรียบเทียบก่อน-หลังซ่อม และลายเซ็นผู้รับมอบงาน F-EN-03
            </Text>
          </VStack>

          <HStack gap={2}>
            <Button
              label="กลับ"
              variant="secondary"
              icon={<Icon icon={ArrowLeftIcon} size="sm" />}
              onClick={() => (window.location.href = "/repair/tracking")}
            />
            <Button
              label="🖨️ พิมพ์เอกสารปิดซ่อม"
              variant="primary"
              icon={<Icon icon={PrinterIcon} size="sm" />}
              onClick={handlePrint}
            />
          </HStack>
        </HStack>
      </div>

      {/* Main Closure Document Sheet */}
      <Card padding={6} style={{ background: '#FFFFFF', color: '#1E293B' }}>
        <VStack gap={6}>
          {/* Document Header Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0F172A', paddingBottom: 16 }}>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#475569', letterSpacing: 1 }}>
                บริษัท ท็อปพาน เฟล็กซิเบิ้ล แพคเกจจิ้ง (ประเทศไทย) จำกัด
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0F172A', marginTop: 2 }}>
                ใบส่งมอบและปิดงานซ่อมบำรุง (F-EN-03)
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#3B82F6' }}>{wo.workOrderNo}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: 2 }}>วันที่ปิดงาน: {wo.completedAt}</div>
            </div>
          </div>

          {/* Machine & Problem Summary Grid */}
          <Grid columns={2} gap={4}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 10, border: '1px solid #E2E8F0' }}>
              <VStack gap={2}>
                <Text type="supporting" color="secondary">เครื่องจักร / อุปกรณ์:</Text>
                <Text type="body" weight="bold">{wo.assetName}</Text>
                <Text type="supporting" color="secondary" style={{ marginTop: 6 }}>หัวข้ออาการเสีย:</Text>
                <Text type="body" weight="semibold">{wo.title}</Text>
              </VStack>
            </div>

            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 10, border: '1px solid #E2E8F0' }}>
              <VStack gap={2}>
                <Text type="supporting" color="secondary">ผู้รับผิดชอบงานซ่อม:</Text>
                <Text type="body" weight="bold" color="primary">{wo.assignedName}</Text>
                <Text type="supporting" color="secondary" style={{ marginTop: 6 }}>ผู้รับมอบงานซ่อมเสร็จ:</Text>
                <Text type="body" weight="bold" style={{ color: 'var(--cmms-success)' }}>{wo.receiverName}</Text>
              </VStack>
            </div>
          </Grid>

          {/* 📸 BEFORE & AFTER REPAIR PHOTOS COMPARISON SECTION */}
          <VStack gap={3}>
            <HStack gap={2} vAlign="center">
              <Icon icon={CameraIcon} size="md" color="primary" />
              <Heading level={4}>📸 รูปถ่ายเปรียบเทียบก่อนซ่อมและหลังซ่อมเสร็จ</Heading>
            </HStack>

            <Grid columns={2} gap={6}>
              {/* Before Repair Photo Card */}
              <div style={{ border: '2px dashed #EF4444', borderRadius: 12, padding: 16, background: '#FEF2F2' }}>
                <VStack gap={3}>
                  <HStack hAlign="between" vAlign="center">
                    <Badge label="🔴 รูปถ่ายก่อนซ่อม / จุดชำรุด" variant="error" />
                    <Text type="body" size="sm" color="secondary">ภาพถ่าย ณ วันแจ้งซ่อม</Text>
                  </HStack>

                  <div style={{
                    width: '100%',
                    height: 240,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: '#CBD5E1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}>
                    {wo.beforeImg ? (
                      <img src={wo.beforeImg} alt="รูปถ่ายก่อนซ่อม" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <VStack gap={1} hAlign="center">
                        <Icon icon={CameraIcon} size="lg" color="secondary" />
                        <Text type="body" size="sm" color="secondary">ไม่มีรูปภาพถ่ายก่อนซ่อม</Text>
                      </VStack>
                    )}
                  </div>
                  <Text type="body" size="sm" color="secondary">
                    * แสดงจุดชำรุดเดิมก่อนทำการถอดเปลี่ยนอะไหล่และซ่อมแซม
                  </Text>
                </VStack>
              </div>

              {/* After Repair Photo Card */}
              <div style={{ border: '2px solid #10B981', borderRadius: 12, padding: 16, background: '#ECFDF5' }}>
                <VStack gap={3}>
                  <HStack hAlign="between" vAlign="center">
                    <Badge label="🟢 รูปถ่ายหลังซ่อมเสร็จ" variant="success" />
                    <Text type="body" size="sm" color="secondary">ภาพถ่ายหลังซ่อมเสร็จสมบูรณ์</Text>
                  </HStack>

                  <div style={{
                    width: '100%',
                    height: 240,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: '#CBD5E1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}>
                    {wo.afterImg ? (
                      <img src={wo.afterImg} alt="รูปถ่ายหลังซ่อม" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <VStack gap={1} hAlign="center">
                        <Icon icon={CameraIcon} size="lg" color="secondary" />
                        <Text type="body" size="sm" color="secondary">ไม่มีรูปภาพถ่ายหลังซ่อม</Text>
                      </VStack>
                    )}
                  </div>
                  <Text type="body" size="sm" style={{ color: 'var(--cmms-success)', fontWeight: 600 }}>
                    ✓ เครื่องจักรได้รับการซ่อมแซม ทดสอบเดินเครื่อง และพร้อมใช้งาน 100%
                  </Text>
                </VStack>
              </div>
            </Grid>
          </VStack>

          {/* Repair Solution & Cost Summary */}
          <div style={{ background: '#F1F5F9', padding: 20, borderRadius: 12, border: '1px solid #CBD5E1' }}>
            <VStack gap={3}>
              <Heading level={4}>🔧 รายละเอียดการซ่อมและสาเหตุของปัญหา</Heading>
              <Grid columns={2} gap={4}>
                <VStack gap={1}>
                  <Text type="body" size="sm" weight="bold">สาเหตุของปัญหา:</Text>
                  <Text type="body" size="sm">{wo.rootCause}</Text>
                </VStack>

                <VStack gap={1}>
                  <Text type="body" size="sm" weight="bold">วิธีการแก้ไข:</Text>
                  <Text type="body" size="sm">{wo.solution}</Text>
                </VStack>
              </Grid>

              <HStack gap={6} style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid #94A3B8' }}>
                <Text type="body" size="sm">เวลาซ่อม: <strong>{wo.downtimeMinutes} นาที</strong></Text>
                <Text type="body" size="sm">ค่าอะไหล่: <strong>฿{wo.costParts.toLocaleString()}</strong></Text>
                <Text type="body" size="sm">ค่าแรง: <strong>฿{wo.costLabor.toLocaleString()}</strong></Text>
                <Text type="body" size="sm" weight="bold" color="primary">รวมค่าใช้จ่าย: ฿{(wo.costParts + wo.costLabor).toLocaleString()}</Text>
              </HStack>
            </VStack>
          </div>

          {/* ✍️ SIGNATURES & WORK ACCEPTANCE SECTION */}
          <VStack gap={3}>
            <HStack gap={2} vAlign="center">
              <Icon icon={UserIcon} size="md" color="success" />
              <Heading level={4}>✍️ การลงนามและตรวจรับมอบงานหลังซ่อมเสร็จ</Heading>
            </HStack>

            <Grid columns={2} gap={6}>
              {/* Technician Signature */}
              <div style={{ border: '1px solid #CBD5E1', borderRadius: 12, padding: 16, textAlign: 'center', background: '#FFFFFF' }}>
                <VStack gap={2} hAlign="center">
                  <Text type="body" size="sm" color="secondary">ลายเซ็นช่างผู้ซ่อม</Text>
                  <div style={{
                    width: 220,
                    height: 90,
                    border: '1px dashed #CBD5E1',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#F8FAFC'
                  }}>
                    <Text type="body" size="sm" color="secondary">ยังไม่มีข้อมูลลายเซ็นในระบบ</Text>
                  </div>
                  <Text type="body" weight="bold">{wo.assignedName}</Text>
                  <Text type="body" size="sm" color="secondary">แผนกซ่อมบำรุง</Text>
                </VStack>
              </div>

              {/* Receiver / Production Supervisor Signature */}
              <div style={{ border: '2px solid #10B981', borderRadius: 12, padding: 16, textAlign: 'center', background: '#ECFDF5' }}>
                <VStack gap={2} hAlign="center">
                  <Badge label="✓ ตรวจรับมอบงานเสร็จสมบูรณ์" variant="success" />
                  <Text type="body" size="sm" color="secondary">ลายเซ็นผู้รับมอบงาน</Text>
                  <div style={{
                    width: 220,
                    height: 90,
                    border: '1px dashed #10B981',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#FFFFFF'
                  }}>
                    {wo.receiverSignature ? (
                      <img src={wo.receiverSignature} alt="ลายเซ็นผู้รับมอบงาน" style={{ maxHeight: 75 }} />
                    ) : (
                      <Text type="body" size="sm" color="secondary">ยังไม่มีลายเซ็นผู้รับมอบงาน</Text>
                    )}
                  </div>
                  <Text type="body" weight="bold">{wo.receiverName}</Text>
                  <Text type="body" size="sm" color="secondary">วันที่ตรวจรับ: {wo.completedAt}</Text>
                </VStack>
              </div>
            </Grid>
          </VStack>
        </VStack>
      </Card>

      {/* Print Stylesheet */}
      <style jsx global>{`
        @media print {
          .no-print, header, aside, nav, #sidebar {
            display: none !important;
          }
          body, main {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>
    </VStack>
  );
}
