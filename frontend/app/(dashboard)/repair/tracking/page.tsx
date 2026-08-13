"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ToastProvider";
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

export default function RepairTrackingPage() {
  const router = useRouter();
  const [data, setData] = useState<TrackWO[]>([]);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    fetch("/api/v1/index.php?resource=work-orders")
      .then(res => res.json())
      .then(json => {
        if (json.status === "success" && Array.isArray(json.data)) {
          const mapped: TrackWO[] = json.data.map((row: any, index: number) => ({
            id: `db-wo-${row.id || index}`,
            woNumber: row.work_order_no || row.wo_number || `EN-${String(row.id || index).padStart(3, '0')}`,
            machine: row.asset_name || "-",
            symptoms: row.title || row.description || "-",
            status: row.status === 'completed' || row.status === 'Completed' || row.status === 'closed' ? 'completed' : row.status === 'in_progress' || row.status === 'In Progress' ? 'in_progress' : row.status === 'open' || row.status === 'Open' ? 'pending_assign' : row.status === 'waiting_parts' || row.status === 'pending_parts' ? 'pending_accept' : 'pending_assign',
            requestDate: row.created_at || "-",
            technician: row.assigned_name || "-"
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
  const { showToast } = useToast();

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
    showToast("success", "บันทึกการประเมินงานเรียบร้อยแล้ว");
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
      {/* Header */}
      <div className="cmms-page-hero">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>
            Repair Tracking · CMMS-TOPPAN
          </Text>
          <Heading level={2} style={{ color: "#fff" }}>ติดตามงานซ่อม (Repair Tracking)</Heading>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            ตรวจสอบสถานะงานซ่อมที่คุณได้แจ้งไว้ และประเมินผลความพึงพอใจการซ่อมของช่าง
          </Text>
        </VStack>
      </div>
      
      {error ? (
        <Banner status="error" title="เกิดข้อผิดพลาด" description="ไม่สามารถโหลดข้อมูลงานซ่อมได้" />
      ) : data.length === 0 ? (
        <EmptyState title="ไม่พบข้อมูล" description="ไม่มีรายการงานซ่อมที่คุณได้แจ้งไว้" icon={<Icon icon={WrenchScrewdriverIcon} size="lg" />} />
      ) : (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <HStack hAlign="between" vAlign="center" style={{ padding: '14px 20px', borderBottom: '1px solid var(--cmms-border)' }}>
            <HStack gap={2} vAlign="center">
              <div className="w-8 h-8 rounded-lg cmms-icon-tile">
                <WrenchScrewdriverIcon className="w-4 h-4" />
              </div>
              <Text type="body" weight="bold">รายการงานซ่อมที่แจ้งไว้</Text>
              <span className="cmms-count-pill">{data.length} รายการ</span>
            </HStack>
          </HStack>
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
            <div style={{ height: 4, borderRadius: 4, background: 'var(--cmms-primary)', marginBottom: 16 }} />
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
