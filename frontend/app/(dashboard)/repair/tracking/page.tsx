"use client";

import { useState, useEffect } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Icon } from "@astryxdesign/core/Icon";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { TextArea } from "@astryxdesign/core/TextArea";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { useRouter } from "next/navigation";

import { 
  StarIcon,
  CheckBadgeIcon,
  ClockIcon,
  WrenchIcon,
  WrenchScrewdriverIcon,
  ChatBubbleBottomCenterTextIcon
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";

type TrackWO = Record<string, unknown> & {
  id: string;
  woNumber: string;
  machine: string;
  symptoms: string;
  status: "pending_assign" | "pending_accept" | "in_progress" | "pending_eval" | "completed";
  requestDate: string;
  technician?: string;
  etaDate?: string;
};

const INITIAL_DATA: TrackWO[] = [
  { id: "tr-1", woNumber: "EN-2607-001", machine: "A-PT-01 (Flexo Printing)", symptoms: "มอเตอร์มีเสียงดังขณะเดินเครื่อง", status: "pending_eval", requestDate: "2026-07-28 09:30", technician: "Somchai T." },
  { id: "tr-2", woNumber: "EN-2607-002", machine: "B-SL-01 (Slitting Machine)", symptoms: "ใบมีดตัดไม่ขาด ขอบชิ้นงานไม่เรียบ", status: "pending_assign", requestDate: "2026-07-29 10:15" },
  { id: "tr-3", woNumber: "EN-2607-003", machine: "U-AC-04 (Chiller Unit)", symptoms: "อุณหภูมิห้องคลังสูงเกินกำหนด 25°C", status: "in_progress", requestDate: "2026-07-28 15:20", technician: "Niti P.", etaDate: "2026-07-30" },
  { id: "tr-4", woNumber: "EN-2607-004", machine: "C-PK-01 (Packing Line)", symptoms: "สายพานขาด ลำเลียงชิ้นงานไม่ได้", status: "completed", requestDate: "2026-07-25 11:00", technician: "Somchai T." },
];

export default function RepairTrackingPage() {
  const router = useRouter();
  const [data, setData] = useState<TrackWO[]>(INITIAL_DATA);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    fetch("/api/v1/index.php?resource=work-orders")
      .then(res => res.json())
      .then(json => {
        if (json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
          const mapped: TrackWO[] = json.data.map((row: any, index: number) => ({
            id: `db-wo-${row.id || index}`,
            woNumber: row.work_order_no || row.wo_number || `EN-2607-${String(row.id || index).padStart(3, '0')}`,
            machine: row.asset_name || row.asset || `Asset #${row.asset_id || 1}`,
            symptoms: row.title || row.description || "งานซ่อมบำรุงรักษา",
            status: row.status === 'completed' || row.status === 'Completed' ? 'completed' : row.status === 'in_progress' || row.status === 'In Progress' ? 'in_progress' : 'pending_assign',
            requestDate: row.created_at || row.date || new Date().toISOString().slice(0, 10),
            technician: row.assigned_name || row.assignee || "ช่างประจำวัน"
          }));
          setData(mapped);
          setError(false);
        } else {
          setError(true);
        }
      })
      .catch(e => {
        console.error("Fetch MySQL repair log error:", e);
        setError(true);
      });
  }, []);
  
  // Evaluation Dialog
  const [evalModalOpen, setEvalModalOpen] = useState(false);
  const [selectedWo, setSelectedWo] = useState<TrackWO | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [toastOpen, setToastOpen] = useState(false);

  const handleEvaluate = (wo: TrackWO) => {
    setSelectedWo(wo);
    setRating(5);
    setComment("");
    setEvalModalOpen(true);
  };

  const submitEvaluation = () => {
    if (!selectedWo) return;
    setData(prev => prev.map(w => w.id === selectedWo.id ? { ...w, status: "completed" } : w));
    setEvalModalOpen(false);
    setToastOpen(true);
  };

  const getStatusDisplay = (status: string) => {
    switch(status) {
      case 'pending_assign': return <Badge label="รอมอบหมายงาน" variant="neutral" />;
      case 'pending_accept': return <Badge label="รอช่างรับงาน" variant="warning" />;
      case 'in_progress': return <Badge label="กำลังดำเนินการซ่อม" variant="info" />;
      case 'pending_eval': return <Badge label="รอการประเมินจากผู้แจ้ง" variant="error" />;
      case 'completed': return <Badge label="เสร็จสมบูรณ์" variant="success" />;
      default: return <Badge label={status} variant="neutral" />;
    }
  };

  const columns: TableColumn<TrackWO>[] = [
    {
      key: "woNumber",
      header: "เลขที่ใบงาน",
      width: proportional(1.5),
      renderCell: (item: TrackWO) => <strong>{item.woNumber}</strong>,
    },
    {
      key: "machine",
      header: "เครื่องจักร / อุปกรณ์",
      width: proportional(2.5),
      renderCell: (item: TrackWO) => <Text type="body">{item.machine}</Text>,
    },
    {
      key: "symptoms",
      header: "อาการเสีย / รายละเอียด",
      width: proportional(3),
      renderCell: (item: TrackWO) => <Text type="body">{item.symptoms}</Text>,
    },
    {
      key: "status",
      header: "สถานะงานซ่อม",
      width: proportional(2),
      renderCell: (item: TrackWO) => getStatusDisplay(item.status),
    },
    {
      key: "technician",
      header: "ช่างผู้รับผิดชอบ",
      width: proportional(1.5),
      renderCell: (item: TrackWO) => <Text type="body">{item.technician || "-"}</Text>,
    },
    {
      key: "requestDate",
      header: "วันที่แจ้ง",
      width: proportional(1.5),
      renderCell: (item: TrackWO) => <Text type="body" color="secondary">{item.requestDate}</Text>,
    },
    {
      key: "actions",
      header: "การจัดการ",
      width: proportional(1.5),
      renderCell: (item: TrackWO) => (
        <HStack gap={2} hAlign="end">
          {item.status === 'pending_eval' ? (
            <Button 
              size="sm" 
              variant="primary" 
              icon={<Icon icon={StarIcon} size="sm" />}
              onClick={() => handleEvaluate(item)}
              label="ประเมินผล"
            />
          ) : (
            <Button 
              size="sm" 
              variant="secondary" 
              label="ดูรายละเอียด"
              onClick={() => router.push(`/repair/view?id=${item.id}`)}
            />
          )}
        </HStack>
      ),
    }
  ];

  return (
    <VStack gap={6}>
      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <Heading level={2}>ติดตามงานซ่อม (Repair Tracking)</Heading>
          <Text type="body" color="secondary">ตรวจสอบสถานะงานซ่อมที่คุณได้แจ้งไว้ และประเมินผลความพึงพอใจการซ่อมของช่าง</Text>
        </VStack>
      </HStack>
      
      {error ? (
        <Banner status="error" title="เกิดข้อผิดพลาด" description="ไม่สามารถโหลดข้อมูลงานซ่อมได้" />
      ) : data.length === 0 ? (
        <EmptyState title="ไม่พบข้อมูล" description="ไม่มีรายการงานซ่อมที่คุณได้แจ้งไว้" icon={<Icon icon={WrenchScrewdriverIcon} size="lg" />} />
      ) : (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <Table<TrackWO>
            data={data}
            columns={columns}
            idKey="id"
            density="balanced"
            dividers="rows"
            hasHover
          />
        </Card>
      )}

      {/* Evaluation Modal */}
      {evalModalOpen && (
        <Dialog 
          isOpen={evalModalOpen} 
          onOpenChange={setEvalModalOpen}
        >
          <DialogHeader title="ประเมินผลความพึงพอใจงานซ่อม" onOpenChange={setEvalModalOpen} />
          <div style={{ padding: 24 }}>
            <VStack gap={4}>
              <Card padding={4} style={{ backgroundColor: 'var(--cmms-bg-muted)' }}>
                <VStack gap={2}>
                  <HStack hAlign="between">
                    <Text type="body" color="secondary" size="sm">ใบงาน:</Text>
                    <Text type="body" weight="bold">{selectedWo?.woNumber}</Text>
                  </HStack>
                  <HStack hAlign="between">
                    <Text type="body" color="secondary" size="sm">เครื่องจักร:</Text>
                    <Text type="body" weight="bold">{selectedWo?.machine}</Text>
                  </HStack>
                  <HStack hAlign="between">
                    <Text type="body" color="secondary" size="sm">ช่างซ่อม:</Text>
                    <Text type="body" color="primary">{selectedWo?.technician}</Text>
                  </HStack>
                </VStack>
              </Card>

              <VStack gap={2}>
                <Text type="body" weight="semibold">ให้คะแนนความพึงพอใจ:</Text>
                <HStack gap={2}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                      onClick={() => setRating(star)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                    >
                      <Icon 
                        icon={star <= rating ? StarSolidIcon : StarIcon} 
                        size="md"
                        style={{ color: star <= rating ? 'var(--cmms-warning)' : 'var(--cmms-text-muted)' }}
                      />
                    </button>
                  ))}
                </HStack>
              </VStack>

              <VStack gap={1}>
                <Text type="body" weight="semibold">ข้อเสนอแนะเพิ่มเติม:</Text>
                <TextArea
                  label="ความคิดเห็น"
                  isLabelHidden
                  placeholder="แสดงความคิดเห็นต่อการซ่อมบำรุง..."
                  value={comment}
                  onChange={setComment}
                  rows={3}
                />
              </VStack>

              <HStack hAlign="end" gap={2} style={{ marginTop: 12 }}>
                <Button 
                  label="ยกเลิก" 
                  variant="secondary" 
                  onClick={() => setEvalModalOpen(false)}
                />
                <Button 
                  label="บันทึกการประเมิน" 
                  variant="primary" 
                  onClick={submitEvaluation}
                />
              </HStack>
            </VStack>
          </div>
        </Dialog>
      )}
    </VStack>
  );
}
