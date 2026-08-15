"use client";

import { useState, useEffect, useRef } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
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
  kind: "repair" | "pm";
  woNumber: string;
  machine: string;
  title: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "new" | "in_progress" | "pending_parts" | "completed";
  assignedTo?: number | null;
  assignedToName?: string;
  teamIds?: number[];
  assignedDate: string;
  estimatedCompletion: string;
  assetCode?: string;
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

    // 2) โหลดงานซ่อม + แผน PM (งานของฉัน = งานซ่อม + PM ที่ได้รับมอบหมาย)
    Promise.all([
      fetch("/api/v1/repair.php").then(r => r.json()),
      fetch("/api/v1/index.php?resource=pm-plans").then(r => r.json()),
    ])
      .then(([rows, pmJson]) => {
        const mapped: TaskItem[] = [];

        // 2.1) งานซ่อม
        if (Array.isArray(rows) && rows.length > 0) {
          rows.forEach((r: any) => {
            mapped.push({
              rawId: r.id,
              id: `wo-${r.id}`,
              kind: "repair",
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
              assignedToName: r.assigned_name || "-",
              teamIds: Array.isArray(r.team_ids) ? r.team_ids.map((t: any) => Number(t)) : [],
              assignedDate: r.created_at || "-",
              estimatedCompletion: r.estimated_completion_date || "-",
              beforeImg: r.before_image_path || "",
              afterImg: r.after_image_path || "",
              receiverName: r.receiver_name || "-",
              receiverSignature: r.receiver_signature_path || ""
            });
          });
        }

        // 2.2) แผน PM (จากตาราง pm_am จริง — แสดงเฉพาะที่ยังไม่เสร็จเป็นหลัก)
        const pmList = Array.isArray(pmJson) ? pmJson : (Array.isArray(pmJson?.data) ? pmJson.data : []);
        pmList.forEach((p: any) => {
          const pStatus = String(p.status || "pending").toLowerCase();
          const isDone = pStatus === "completed" || pStatus === "skipped";
          mapped.push({
            rawId: p.id,
            id: `pm-${p.id}`,
            kind: "pm",
            woNumber: `PM-${String(p.id).padStart(3, "0")}`,
            machine: p.asset_name || "-",
            title: p.title || "-",
            priority: (pStatus === "overdue" || (p.due_date && String(p.due_date) < new Date().toISOString().slice(0, 10))) ? "high" : "medium",
            status: isDone ? "completed" : pStatus === "in_progress" ? "in_progress" : "new",
            assignedTo: p.assigned_to || null,
            assignedToName: p.assigned_to_name || "-",
            teamIds: Array.isArray(p.team_ids) ? p.team_ids.map((t: any) => Number(t)) : [],
            assignedDate: p.due_date || "-",
            estimatedCompletion: p.due_date || "-",
            assetCode: p.asset_code || "",
          });
        });

        if (mapped.length > 0) {
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
    // ต้องกรอกของจริง — ไม่มีค่าเริ่มต้นปลอม
    if (!rootCause.trim() || !solution.trim()) {
      alert("กรุณากรอกสาเหตุของปัญหา และวิธีการแก้ไข ก่อนปิดใบงาน");
      return;
    }
    if (!receiverName.trim() || !receiverSignature) {
      alert("กรุณากรอกชื่อผู้รับมอบงาน และวาดลายเซ็นผู้รับมอบงาน");
      return;
    }
    setClosing(true);
    try {
      await fetch(`/api/v1/repair.php?id=${selectedTask.rawId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          root_cause: rootCause,
          solution: solution,
          after_image_path: afterImg,
          receiver_name: receiverName,
          receiver_signature_path: receiverSignature,
          completed_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
        })
      });

      setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, status: "completed", afterImg, receiverName, receiverSignature } : t));
      setCloseModalOpen(false);
    } catch (e) {
      console.error("Close WO error", e);
    } finally {
      setClosing(false);
    }
  };

  // งานของฉัน = งานที่ถูกมอบหมายให้ผู้ใช้ที่ login อยู่เท่านั้น
  // (ถ้ายังโหลด user id ไม่ทัน → แสดงทั้งหมดก่อน แล้ว filter ทันทีที่รู้ค่า)
  // งานของฉัน = งานที่เราเป็นหัวหน้าชุด หรือเป็นสมาชิกในทีม (รับผิดชอบหลายคนต่อ 1 งาน)
  const myTasks = currentUserId === null
    ? tasks
    : tasks.filter(t => t.assignedTo === currentUserId || (t.teamIds || []).includes(currentUserId));
  const filteredTasks = myTasks.filter(t => {
    if (activeTab === "new") return t.status === "new";
    if (activeTab === "in_progress") return t.status === "in_progress" || t.status === "pending_parts";
    return t.status === "completed";
  });

  const countNew = myTasks.filter(t => t.status === "new").length;
  const countInProg = myTasks.filter(t => t.status === "in_progress" || t.status === "pending_parts").length;
  const countDone = myTasks.filter(t => t.status === "completed").length;

  // PM task → ไปหน้าเช็คชีตโดยตรง (prefill แผน + เครื่องจาก QR)
  const goPM = (task: TaskItem) => {
    const params = new URLSearchParams({ plan_id: String(task.rawId) });
    if (task.assetCode) params.set("asset_code", task.assetCode);
    router.push(`/pm_am/checksheet?${params.toString()}`);
  };

  const columns: TableColumn<TaskItem>[] = [
    {
      key: "woNumber",
      header: "เลขที่ใบงาน",
      width: proportional(1.4),
      renderCell: (task) => (
        <HStack gap={2} vAlign="center">
          {task.kind === "pm" ? (
            <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>PM</span>
          ) : (
            <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>ซ่อม</span>
          )}
          <Text type="body" weight="bold">{task.woNumber}</Text>
        </HStack>
      ),
    },
    { key: "machine", header: "เครื่องจักร", width: proportional(2) },
    { key: "title", header: "หัวข้องาน", width: proportional(2.5) },
    {
      key: "assignedToName",
      header: "ผู้รับผิดชอบ",
      width: proportional(1.4),
      renderCell: (task) => (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text type="body" size="sm">{task.assignedToName || "-"}</Text>
          {currentUserId !== null && task.assignedTo !== currentUserId && (task.teamIds || []).includes(currentUserId) && (
            <span className="cmms-andon-chip" style={{ background: "rgba(30,136,229,0.12)", color: "var(--cmms-primary)", fontSize: "0.65rem", padding: "2px 7px" }}>สมาชิกทีม</span>
          )}
        </HStack>
      ),
    },
    {
      key: "estimatedCompletion",
      header: "กำหนดเสร็จ",
      width: proportional(1.2),
      renderCell: (task) => (
        <Text type="body" size="sm" style={{ color: task.kind === "pm" && task.status === "new" ? "var(--cmms-danger)" : undefined }}>
          {task.estimatedCompletion ? String(task.estimatedCompletion).slice(0, 10) : "-"}
        </Text>
      ),
    },
    {
      key: "beforeImg",
      header: "รูปก่อน/หลังซ่อม",
      width: proportional(1.5),
      renderCell: (task) =>
        task.kind === "pm" ? (
          <Text type="body" size="sm" color="disabled">-</Text>
        ) : (
          <HStack gap={1} vAlign="center">
            {task.beforeImg && <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>ก่อนซ่อม</span>}
            {task.afterImg && <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>หลังซ่อม</span>}
          </HStack>
        ),
    },
    {
      key: "actions",
      header: "การดำเนินการ",
      width: proportional(2),
      renderCell: (task) =>
        task.kind === "pm" ? (
          <HStack gap={2} hAlign="end">
            {task.status === "completed" ? (
              <Text type="body" size="sm" color="disabled">ทำเสร็จแล้ว</Text>
            ) : (
              <button
                type="button"
                onClick={() => goPM(task)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cmms-btn-primary"
              >
                <CheckCircleIcon className="w-3.5 h-3.5" />
                ไปทำ PM
              </button>
            )}
          </HStack>
        ) : (
          <HStack gap={2} hAlign="end">
            {task.status === "new" && (
              <button
                type="button"
                onClick={() => handleStartTask(task)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cmms-btn-primary"
              >
                <PlayIcon className="w-3.5 h-3.5" />
                เริ่มซ่อม
              </button>
            )}

            {task.status === "in_progress" && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTask(task);
                  setCloseModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cmms-btn-primary"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                ปิดใบงานซ่อม
              </button>
            )}

            <button
              type="button"
              onClick={() => router.push(`/repair/view?id=${task.rawId}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
            >
              <EyeIcon className="w-3.5 h-3.5" />
              ดูรายละเอียดปิดงาน
            </button>
          </HStack>
        ),
    },
  ];

  return (
    <VStack gap={6}>
      {/* Header */}
      <div className="cmms-page-hero">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>
            My Tasks · CMMS-TOPPAN
          </Text>
          <Heading level={2} style={{ color: "#fff" }}>งานของฉัน (ซ่อม + PM)</Heading>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            งานซ่อมและแผน PM ที่มอบหมายให้คุณ — กด "ไปทำ PM" แล้วสแกน QR ที่เครื่องเพื่อตรวจเช็คได้เลย
          </Text>
        </VStack>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 bg-slate-100 dark:bg-slate-800/50 p-2 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('new')}
          className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 ${activeTab === 'new' ? 'bg-white dark:bg-slate-700 text-[var(--cmms-primary)] shadow-md' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}
        >
          งานใหม่ ({countNew})
        </button>
        <button
          onClick={() => setActiveTab('in_progress')}
          className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 ${activeTab === 'in_progress' ? 'bg-white dark:bg-slate-700 text-[var(--cmms-primary)] shadow-md' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}
        >
          กำลังซ่อม ({countInProg})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 ${activeTab === 'completed' ? 'bg-white dark:bg-slate-700 text-[var(--cmms-primary)] shadow-md' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50'}`}
        >
          ซ่อมเสร็จแล้ว ({countDone})
        </button>
      </div>

      {/* Table */}
      {error ? (
        <Banner status="error" title="เกิดข้อผิดพลาด" description="ไม่สามารถโหลดข้อมูลงานซ่อมได้" />
      ) : filteredTasks.length === 0 ? (
        <EmptyState title="ไม่พบข้อมูล" description="ไม่มีรายการงานซ่อมในสถานะนี้" icon={<WrenchScrewdriverIcon className="w-6 h-6" />} />
      ) : (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <HStack hAlign="between" vAlign="center" style={{ padding: '14px 20px', borderBottom: '1px solid var(--cmms-border)' }}>
            <HStack gap={2} vAlign="center">
              <div className="w-8 h-8 rounded-lg cmms-icon-tile">
                <WrenchScrewdriverIcon className="w-4 h-4" />
              </div>
              <Text type="body" weight="bold">รายการงานในสถานะนี้</Text>
              <span className="cmms-count-pill">{filteredTasks.length} รายการ</span>
            </HStack>
          </HStack>
          <Table<TaskItem>
            data={filteredTasks}
            columns={columns}
            idKey="id"
            density="balanced"
            dividers="rows"
          />
        </Card>
      )}

      {/* CLOSE WORK ORDER MODAL WITH AFTER PHOTO & RECEIVER SIGNATURE */}
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

              {/* AFTER REPAIR IMAGE UPLOAD */}
              <Field label="แนบรูปถ่ายหลังซ่อมเสร็จ" inputID="afterPhoto">
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
                      <Text type="body" size="sm" weight="bold" style={{ color: 'var(--cmms-success)' }}>พร้อมแนบรูปถ่ายหลังซ่อมเสร็จ</Text>
                    </div>
                  )}
                </VStack>
              </Field>

              {/* RECEIVER NAME & SIGNATURE CANVAS */}
              <Grid columns={2} gap={4}>
                <Field label="ชื่อผู้รับมอบงานซ่อมเสร็จ *" inputID="recName" isRequired>
                  <TextInput
                    label="ชื่อผู้รับมอบงาน"
                    isLabelHidden
                    placeholder="กรอกชื่อผู้รับมอบงาน..."
                    value={receiverName}
                    onChange={setReceiverName}
                  />
                </Field>

                <Field label="ลายเซ็นผู้รับมอบงาน (วาดด้วยเมาส์) *" inputID="sigCanvas">
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
                      <button
                        type="button"
                        onClick={clearSignature}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all duration-300"
                      >
                        ล้างลายเซ็น
                      </button>
                    </HStack>
                  </VStack>
                </Field>
              </Grid>
            </FormLayout>

            <HStack hAlign="end" gap={2} style={{ marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setCloseModalOpen(false)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={closing}
                onClick={handleConfirmClose}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircleIcon className="w-4 h-4" />
                {closing ? "กำลังบันทึก..." : "ยืนยันปิดใบงานซ่อม"}
              </button>
            </HStack>
          </VStack>
        </Dialog>
      )}
    </VStack>
  );
}
