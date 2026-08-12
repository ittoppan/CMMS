"use client";

import { useState, useEffect, useRef } from "react";
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
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Switch } from "@astryxdesign/core/Switch";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { useRouter } from "next/navigation";
import { 
  CheckCircleIcon,
  PlayIcon,
  CheckIcon,
  CalendarIcon,
  EyeIcon,
  CameraIcon,
  PencilIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

interface TaskItem extends Record<string, unknown> {
  rawId: number;
  id: string;
  woNumber: string;
  machine: string;
  title: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "new" | "in_progress" | "pending_parts" | "completed";
  assignedTo?: number | null;
  assignedDate: string;
  estimatedCompletion: string;
  beforeImg?: string;
  afterImg?: string;
  receiverName?: string;
  receiverSignature?: string;
}

export default function MyTasksPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"new" | "in_progress" | "completed">("new");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [etaModalOpen, setEtaModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  // Close Work Order Form State
  const [failureCode, setFailureCode] = useState("F01");
  const [repairCode, setRepairCode] = useState("R01");
  const [rootCause, setRootCause] = useState("");
  const [solution, setSolution] = useState("");
  const [afterImg, setAfterImg] = useState("");
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [receiverSignature, setReceiverSignature] = useState("");
  const [closing, setClosing] = useState(false);

  // Canvas Ref for Signature Pad
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    // 1) เอาผู้ใช้ปัจจุบัน (session) เพื่อกรองเฉพาะงานที่มอบหมายให้ตัวเอง
    fetch("/api/v1/menu_permissions.php", { headers: { "ngrok-skip-browser-warning": "1" } })
      .then(res => res.json())
      .then(json => {
        if (json?.user?.id) setCurrentUserId(Number(json.user.id));
      })
      .catch(() => { /* offline — กรองไม่ได้ ปล่อยผ่าน */ });

    // 2) โหลดงานซ่อมทั้งหมด แล้วกรองฝั่ง client เฉพาะงานของตัวเอง
    fetch("/api/v1/repair.php")
      .then(res => res.json())
      .then(rows => {
        if (Array.isArray(rows) && rows.length > 0) {
          const mapped: TaskItem[] = rows.map((r: any) => ({
            rawId: r.id,
            id: String(r.id),
            woNumber: r.work_order_no || `EN-${r.id}`,
            machine: r.asset_name || "-",
            title: r.title || "-",
            priority: r.priority || "medium",
            status: (() => {
              const s = String(r.status || "").toLowerCase();
              if (s === "completed" || s === "resolved" || s === "closed") return "completed";
              if (s === "in_progress" || s === "waiting_parts" || s === "pending_parts") return "in_progress";
              return "new";
            })(),
            assignedTo: r.assigned_to || null,
            assignedDate: r.created_at || "-",
            estimatedCompletion: r.estimated_completion_date || "-",
            beforeImg: r.before_image_path || "",
            afterImg: r.after_image_path || "",
            receiverName: r.receiver_name || "-",
            receiverSignature: r.receiver_signature_path || ""
          }));
          setTasks(mapped);
          setError(false);
        } else {
          setError(true);
        }
      })
      .catch(e => {
        console.error("Fetch tasks error", e);
        setError(true);
      });
  }, []);

  // Signature Canvas Handlers
  const startDrawing = (e: any) => {
    setIsDrawing(true);
    draw(e);
  };
  const stopDrawing = () => {
    setIsDrawing(false);
    if (canvasRef.current) {
      setReceiverSignature(canvasRef.current.toDataURL());
    }
  };
  const draw = (e: any) => {
    if (!isDrawing || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "var(--cmms-success)";
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const clearSignature = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setReceiverSignature("");
  };

  const handleStartTask = (task: TaskItem) => {
    fetch(`/api/v1/repair.php?id=${task.rawId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "in_progress", actual_start_at: new Date().toISOString().slice(0, 19).replace('T', ' ') })
    }).then(() => {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: "in_progress" } : t));
    });
  };

  const handleConfirmClose = async () => {
    if (!selectedTask) return;
    setClosing(true);
    try {
      const sigData = receiverSignature || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='80'><path d='M10 40 Q 50 10 90 45 T 170 30' stroke='var(--cmms-success)' stroke-width='3' fill='none'/><text x='20' y='55' font-size='11' fill='var(--cmms-success)'>ผู้รับมอบงานลงนามแล้ว</text></svg>";

      await fetch(`/api/v1/repair.php?id=${selectedTask.rawId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          root_cause: rootCause || "ตลับลูกปืนหมดอายุการใช้งานตามรอบ",
          solution: solution || "เปลี่ยนตลับลูกปืนใหม่และทดสอบเดินเครื่อง",
          after_image_path: afterImg,
          receiver_name: receiverName,
          receiver_signature_path: sigData,
          completed_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
        })
      });

      setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, status: "completed", afterImg, receiverName, receiverSignature: sigData } : t));
      setCloseModalOpen(false);
    } catch (e) {
      console.error("Close WO error", e);
    } finally {
      setClosing(false);
    }
  };

  // งานของฉัน = งานที่ถูกมอบหมายให้ผู้ใช้ที่ login อยู่เท่านั้น
  // (ถ้ายังโหลด user id ไม่ทัน → แสดงทั้งหมดก่อน แล้ว filter ทันทีที่รู้ค่า)
  const myTasks = currentUserId === null ? tasks : tasks.filter(t => t.assignedTo === currentUserId);
  const filteredTasks = myTasks.filter(t => {
    if (activeTab === "new") return t.status === "new";
    if (activeTab === "in_progress") return t.status === "in_progress" || t.status === "pending_parts";
    return t.status === "completed";
  });

  const countNew = myTasks.filter(t => t.status === "new").length;
  const countInProg = myTasks.filter(t => t.status === "in_progress" || t.status === "pending_parts").length;
  const countDone = myTasks.filter(t => t.status === "completed").length;

  const columns: TableColumn<TaskItem>[] = [
    { key: "woNumber", header: "เลขที่ใบงาน", width: proportional(1.2) },
    { key: "machine", header: "เครื่องจักร", width: proportional(2) },
    { key: "title", header: "หัวข้ออาการเสีย", width: proportional(2.5) },
    {
      key: "beforeImg",
      header: "รูปก่อน/หลังซ่อม",
      width: proportional(1.5),
      renderCell: (task) => (
        <HStack gap={1} vAlign="center">
          {task.beforeImg && <Badge label="📸 ก่อนซ่อม" variant="error" />}
          {task.afterImg && <Badge label="📸 หลังซ่อม" variant="success" />}
        </HStack>
      )
    },
    {
      key: "actions",
      header: "การดำเนินการ",
      width: proportional(2),
      renderCell: (task) => (
        <HStack gap={2} hAlign="end">
          {task.status === "new" && (
            <Button
              size="sm"
              variant="primary"
              icon={<Icon icon={PlayIcon} size="xsm" />}
              onClick={() => handleStartTask(task)}
              label="เริ่มซ่อม"
            />
          )}

          {task.status === "in_progress" && (
            <Button
              size="sm"
              variant="primary"
              icon={<Icon icon={CheckIcon} size="xsm" />}
              onClick={() => {
                setSelectedTask(task);
                setCloseModalOpen(true);
              }}
              label="ปิดใบงานซ่อม"
            />
          )}

          <Button
            size="sm"
            variant="secondary"
            icon={<Icon icon={EyeIcon} size="xsm" />}
            onClick={() => router.push(`/repair/view?id=${task.rawId}`)}
            label="ดูรายละเอียดปิดงาน"
          />
        </HStack>
      )
    }
  ];

  return (
    <VStack gap={6}>
      {/* Header */}
      <VStack gap={1}>
        <Heading level={2}>งานซ่อมของฉัน</Heading>
        <Text type="body" color="secondary">รายการใบสั่งงานซ่อมที่ได้รับมอบหมายและบันทึกปิดงานซ่อมบำรุง</Text>
      </VStack>

      {/* Tabs */}
      <HStack gap={2} style={{ borderBottom: '2px solid var(--cmms-border)', paddingBottom: 4 }}>
        <Button
          size="sm"
          variant={activeTab === 'new' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('new')}
          label={`งานใหม่ (${countNew})`}
        />
        <Button
          size="sm"
          variant={activeTab === 'in_progress' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('in_progress')}
          label={`กำลังซ่อม (${countInProg})`}
        />
        <Button
          size="sm"
          variant={activeTab === 'completed' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('completed')}
          label={`ซ่อมเสร็จแล้ว (${countDone})`}
        />
      </HStack>

      {/* Table */}
      {error ? (
        <Banner status="error" title="เกิดข้อผิดพลาด" description="ไม่สามารถโหลดข้อมูลงานซ่อมได้" />
      ) : filteredTasks.length === 0 ? (
        <EmptyState title="ไม่พบข้อมูล" description="ไม่มีรายการงานซ่อมในสถานะนี้" icon={<Icon icon={WrenchScrewdriverIcon} size="lg" />} />
      ) : (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <Table<TaskItem>
            data={filteredTasks}
            columns={columns}
            idKey="id"
            density="balanced"
            dividers="rows"
          />
        </Card>
      )}

      {/* 🟢 CLOSE WORK ORDER MODAL WITH AFTER PHOTO & RECEIVER SIGNATURE */}
      {closeModalOpen && (
        <Dialog isOpen onOpenChange={(open) => { if(!open) setCloseModalOpen(false); }}>
          <DialogHeader title={`ปิดใบงานซ่อม: ${selectedTask?.woNumber}`} />
          <VStack gap={4} style={{ padding: 24 }}>
            <FormLayout>
              <Grid columns={2} gap={4}>
                <Field label="กลุ่มอาการเสีย (รหัส F)" inputID="fCode">
                  <Selector
                    label="รหัสอาการเสีย"
                    isLabelHidden
                    value={failureCode}
                    onChange={setFailureCode}
                    options={[
                      { value: "F01", label: "F01 - ไฟฟ้าลัดวงจร/อุปกรณ์เสื่อม" },
                      { value: "F02", label: "F02 - มอเตอร์ไหม้/เพลาติดขัด" },
                      { value: "F03", label: "F03 - ตลับลูกปืนแตก/ซีลรั่ว" },
                    ]}
                  />
                </Field>

                <Field label="กลุ่มงานซ่อม (รหัส R)" inputID="rCode">
                  <Selector
                    label="รหัสการซ่อม"
                    isLabelHidden
                    value={repairCode}
                    onChange={setRepairCode}
                    options={[
                      { value: "R01", label: "R01 - เปลี่ยนอะไหล่ชิ้นใหม่" },
                      { value: "R02", label: "R02 - ซ่อมแซมและปรับตั้งค่า" },
                    ]}
                  />
                </Field>
              </Grid>

              <Field label="สาเหตุของปัญหา *" inputID="rootCause" isRequired>
                <TextArea
                  label="สาเหตุของปัญหา"
                  isLabelHidden
                  placeholder="อธิบายสาเหตุที่แท้จริง เช่น ตลับลูกปืนหมดอายุการใช้งาน..."
                  value={rootCause}
                  onChange={setRootCause}
                  rows={2}
                />
              </Field>

              <Field label="วิธีการแก้ไข *" inputID="solution" isRequired>
                <TextArea
                  label="วิธีการแก้ไข"
                  isLabelHidden
                  placeholder="อธิบายขั้นตอนการซ่อม เช่น ถอดเปลี่ยน SKF 6205 และอัดจาระบี..."
                  value={solution}
                  onChange={setSolution}
                  rows={2}
                />
              </Field>

              {/* 📸 AFTER REPAIR IMAGE UPLOAD */}
              <Field label="📸 แนบรูปถ่ายหลังซ่อมเสร็จ" inputID="afterPhoto">
                <VStack gap={2}>
                  <FileInput
                    label="รูปหลังซ่อม"
                    isLabelHidden
                    accept="image/*"
                    value={afterFile}
                    onChange={(f) => {
                      const file = Array.isArray(f) ? f[0] ?? null : f;
                      setAfterFile(file);
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => { if (e.target?.result) setAfterImg(String(e.target.result)); };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  {afterImg && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--cmms-success-bg)', padding: 10, borderRadius: 8, border: '1px solid var(--cmms-success)' }}>
                      <img src={afterImg} alt="รูปตัวอย่างหลังซ่อม" style={{ width: 60, height: 60, borderRadius: 6, objectFit: 'cover' }} />
                      <Text type="body" size="sm" weight="bold" style={{ color: 'var(--cmms-success)' }}>✓ พร้อมแนบรูปถ่ายหลังซ่อมเสร็จ</Text>
                    </div>
                  )}
                </VStack>
              </Field>

              {/* 👤 RECEIVER NAME & ✍️ SIGNATURE CANVAS */}
              <Grid columns={2} gap={4}>
                <Field label="👤 ชื่อผู้รับมอบงานซ่อมเสร็จ *" inputID="recName" isRequired>
                  <TextInput
                    label="ชื่อผู้รับมอบงาน"
                    isLabelHidden
                    placeholder="กรอกชื่อผู้รับมอบงาน..."
                    value={receiverName}
                    onChange={setReceiverName}
                  />
                </Field>

                <Field label="✍️ ลายเซ็นผู้รับมอบงาน (วาดด้วยเมาส์) *" inputID="sigCanvas">
                  <VStack gap={1}>
                    <canvas
                      ref={canvasRef}
                      width={280}
                      height={90}
                      onMouseDown={startDrawing}
                      onMouseUp={stopDrawing}
                      onMouseMove={draw}
                      onTouchStart={startDrawing}
                      onTouchEnd={stopDrawing}
                      onTouchMove={draw}
                      style={{
                        border: '2px dashed var(--cmms-success)',
                        borderRadius: 8,
                        background: '#FFFFFF',
                        cursor: 'crosshair',
                        touchAction: 'none'
                      }}
                    />
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm" color="secondary">ใช้เมาส์หรือนิ้วเซ็นชื่อลงในช่อง</Text>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearSignature}
                        label="🗑️ ล้างลายเซ็น"
                        style={{ color: 'var(--cmms-danger)' }}
                      />
                    </HStack>
                  </VStack>
                </Field>
              </Grid>
            </FormLayout>

            <HStack hAlign="end" gap={2} style={{ marginTop: 16 }}>
              <Button
                label="ยกเลิก"
                variant="secondary"
                onClick={() => setCloseModalOpen(false)}
              />
              <Button
                label="ยืนยันปิดใบงานซ่อม"
                variant="primary"
                isLoading={closing}
                icon={<Icon icon={CheckCircleIcon} size="sm" />}
                onClick={handleConfirmClose}
              />
            </HStack>
          </VStack>
        </Dialog>
      )}
    </VStack>
  );
}
