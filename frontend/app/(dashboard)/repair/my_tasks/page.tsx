"use client";

import { useState, useEffect, useRef } from "react";
import { usePageHero, t, statusText, priorityText } from "@/lib/i18n";
import { repairStatusLabel, repairStatusAndon, isRepairOverdue } from "@/lib/repair-status";
import AndonLamp from "@/components/AndonLamp";
import { snapshotSave, snapshotLoad } from "@/lib/offline-store";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { DialogHeader } from "@astryxdesign/core/Dialog";
import AnimatedDialog from "@/components/AnimatedDialog";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Switch } from "@astryxdesign/core/Switch";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
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
  ClockIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

// แสดงเวลา "อัปเดตล่าสุด" แบบไทย (เช่น 18 ส.ค. 69, 11:05 น.)
function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString("th-TH", {
      day: "numeric",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ts).toLocaleString();
  }
}

interface TaskItem extends Record<string, unknown> {
  rawId: number;
  id: string;
  kind: "repair" | "pm";
  woNumber: string;
  machine: string;
  title: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "new" | "in_progress" | "pending_parts" | "completed";
  overdue: boolean;
  assignedTo?: number | null;
  assignedToName?: string;
  teamIds?: number[];
  team?: { user_id: number; status?: string }[];
  assignedDate: string;
  estimatedCompletion: string;
  assetCode?: string;
  outsourceBy?: string;
  beforeImg?: string;
  afterImg?: string;
  receiverName?: string;
  receiverSignature?: string;
  failureCode?: string;
  repairCode?: string;
  costParts?: number;
  costLabor?: number;
  costOutsource?: number;
  downtimeMinutes?: number;
}

export default function MyTasksPage() {
  const hero = usePageHero("repair/my_tasks");
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"new" | "in_progress" | "completed">("new");
  const [outsourceFilter, setOutsourceFilter] = useState<"all" | "in" | "out">("all");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [snapshotTime, setSnapshotTime] = useState<number | null>(null);
  const [retryMsg, setRetryMsg] = useState("");
  // เพิ่งกลับมามีเน็ต — ยังไม่ refresh ข้อมูล (คง banner ไว้ให้กด "โหลดข้อมูลใหม่")
  const [onlineBack, setOnlineBack] = useState(false);
  const offlineRef = useRef(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [etaModalOpen, setEtaModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  // Close Work Order Form State
  const [failureCode, setFailureCode] = useState("");
  const [repairCode, setRepairCode] = useState("");
  // รหัส F/R จริงจากตาราง failure_codes / repair_codes (API ?reference=codes)
  const [failureCodes, setFailureCodes] = useState<{ id: number; code: string; name: string }[]>([]);
  const [repairCodes, setRepairCodes] = useState<{ id: number; code: string; name: string }[]>([]);
  const [rootCause, setRootCause] = useState("");
  const [solution, setSolution] = useState("");
  const [afterImg, setAfterImg] = useState("");
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [receiverSignature, setReceiverSignature] = useState("");
  const [closing, setClosing] = useState(false);
  // ผลตรวจการปนเปื้อน — บังคับเลือกก่อนปิดใบงาน (โรงงานอาหาร — กันลืมตรวจ)
  const [contaminateChecking, setContaminateChecking] = useState("");
  // ค่าใช้จ่าย/เวลาหยุดเครื่อง/ผู้รับเหมา — กรอกตอนปิดใบงาน (ไปแสดงใน F-EN-03)
  const [costParts, setCostParts] = useState("");
  const [costLabor, setCostLabor] = useState("");
  const [costOutsource, setCostOutsource] = useState("");
  const [downtimeMinutes, setDowntimeMinutes] = useState("");
  const [outsourceBy, setOutsourceBy] = useState("");

  // Canvas Ref for Signature Pad
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    // โหมด offline: แสดง banner + อ่านเวลา "อัปเดตล่าสุด" จาก snapshot
    // (ข้อมูลอาจมาจาก SW cache หรือ snapshot — เวลาใช้ savedAt จาก snapshot เสมอ)
    const updateOffline = async () => {
      const isOff = !navigator.onLine;
      if (isOff) {
        offlineRef.current = true;
        setOffline(true);
        setOnlineBack(false);
        setRetryMsg("");
        const snap = await snapshotLoad<{ rows: any[]; pm: any; savedAt?: number }>("my_tasks");
        if (snap?.savedAt) setSnapshotTime(snap.savedAt);
      } else if (offlineRef.current) {
        // เพิ่งกลับมามีเน็ต — ยังไม่ refresh ข้อมูล คง banner ไว้ให้กด "โหลดข้อมูลใหม่"
        setOnlineBack(true);
        setRetryMsg("");
      }
    };
    updateOffline();
    window.addEventListener("online", updateOffline);
    window.addEventListener("offline", updateOffline);
    return () => {
      window.removeEventListener("online", updateOffline);
      window.removeEventListener("offline", updateOffline);
    };
  }, []);

  useEffect(() => {
    // 1) เอาผู้ใช้ปัจจุบัน (session) เพื่อกรองเฉพาะงานที่มอบหมายให้ตัวเอง
    fetch("/api/v1/menu_permissions.php", { headers: { "ngrok-skip-browser-warning": "1" } })
      .then(res => res.json())
      .then(json => {
        if (json?.user?.id) setCurrentUserId(Number(json.user.id));
      })
      .catch(() => { /* offline — กรองไม่ได้ ปล่อยผ่าน */ });

    // 1.5) โหลดรหัส F/R จริงจากตาราง failure_codes / repair_codes (dropdown ปิดใบงาน)
    fetch("/api/v1/repair.php?reference=codes", { headers: { "ngrok-skip-browser-warning": "1" } })
      .then(r => r.json())
      .then(j => {
        if (Array.isArray(j?.failure_codes)) setFailureCodes(j.failure_codes);
        if (Array.isArray(j?.repair_codes)) setRepairCodes(j.repair_codes);
      })
      .catch(() => {});

    // 2) โหลดงานซ่อม + แผน PM (งานของฉัน = งานซ่อม + PM ที่ได้รับมอบหมาย)
    //    สำเร็จ → เก็บ snapshot ลง IndexedDB (offline ใช้ชุดนี้ ไม่พึ่ง SW cache)
    //    พัง (offline ไม่มี cache) → อ่าน snapshot ล่าสุด
    const applyRows = (rows: any[], pmJson: any) => {
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
              if (s === "in_progress") return "in_progress";
              if (s === "waiting_parts" || s === "pending_parts") return "pending_parts";
              return "new";
            })(),
            overdue: isRepairOverdue(r.estimated_completion_date, r.status),
            assignedTo: r.assigned_to || null,
            assignedToName: r.assigned_name || "-",
            teamIds: Array.isArray(r.team_ids) ? r.team_ids.map((t: any) => Number(t)) : [],
            team: Array.isArray(r.team) ? r.team.map((m: any) => ({ user_id: Number(m.user_id), status: String(m.status || "pending") })) : [],
            assignedDate: r.created_at || "-",
            estimatedCompletion: r.estimated_completion_date || "-",
            beforeImg: r.before_image_path || "",
            afterImg: r.after_image_path || "",
            receiverName: r.receiver_name || "-",
            receiverSignature: r.receiver_signature_path || "",
            outsourceBy: r.outsource_by || "",
            failureCode: r.failure_code || "",
            repairCode: r.repair_code || "",
            costParts: r.cost_parts ? Number(r.cost_parts) : 0,
            costLabor: r.cost_labor ? Number(r.cost_labor) : 0,
            costOutsource: r.cost_outsource ? Number(r.cost_outsource) : 0,
            downtimeMinutes: r.downtime_minutes ? Number(r.downtime_minutes) : 0,
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
          overdue: isRepairOverdue(p.due_date, p.status),
          assignedTo: p.assigned_to || null,
          assignedToName: p.assigned_to_name || "-",
          teamIds: Array.isArray(p.team_ids) ? p.team_ids.map((t: any) => Number(t)) : [],
          team: Array.isArray(p.team) ? p.team.map((m: any) => ({ user_id: Number(m.user_id), status: String(m.status || "pending") })) : [],
          assignedDate: p.due_date || "-",
          estimatedCompletion: p.due_date || "-",
          assetCode: p.asset_code || "",
          outsourceBy: p.outsource_by || "",
        });
      });

      if (mapped.length > 0) {
        setTasks(mapped);
        setError(false);
      } else {
        setError(true);
      }
      return mapped;
    };

    // พยายามโหลดจาก network ก่อน — สำเร็จ: เก็บ snapshot
    fetch("/api/v1/repair.php")
      .then((r) => r.json())
      .then((rows) =>
        fetch("/api/v1/index.php?resource=pm-plans")
          .then((r) => r.json())
          .then((pmJson) => {
            applyRows(Array.isArray(rows) ? rows : [], pmJson);
            snapshotSave("my_tasks", { rows: Array.isArray(rows) ? rows : [], pm: pmJson, savedAt: Date.now() });
          })
      )
      .catch(async (e) => {
        console.error("Fetch tasks error — ลองอ่าน snapshot", e);
        // offline: อ่าน snapshot ล่าสุดจาก IndexedDB (ไม่พึ่ง SW cache)
        const snap = await snapshotLoad<{ rows: any[]; pm: any; savedAt?: number }>("my_tasks");
        if (snap && Array.isArray(snap.rows) && snap.rows.length > 0) {
          applyRows(snap.rows, snap.pm);
          setOffline(true);
          if (snap.savedAt) setSnapshotTime(snap.savedAt);
        } else {
          setError(true);
        }
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
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    fetch(`/api/v1/repair.php?id=${task.rawId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "in_progress", actual_start_at: now, acknowledged_at: now })
    }).then(() => {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: "in_progress", overdue: isRepairOverdue(t.estimatedCompletion, "in_progress") } : t));
    });
  };

  // ช่างกด "รับงาน" — อัปเดตสถานะต่อคน (ใครรับแล้ว/ยังไม่รับ) — งานซ่อม + PM ใช้ endpoint เดียวกัน
  const handleAcceptTask = (task: TaskItem) => {
    const endpoint = task.kind === "repair" ? "/api/v1/repair.php" : "/api/v1/pm_am.php";
    fetch(`${endpoint}?id=${task.rawId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee_accept: true }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success && currentUserId !== null) {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === task.id
                ? { ...t, team: [...(t.team || []).filter((m) => m.user_id !== currentUserId), { user_id: currentUserId, status: "accepted" }] }
                : t
            )
          );
        }
      })
      .catch(() => { /* offline */ });
  };

  // ตั้งสถานะ "รออะไหล่" — งานยังค้าง ไฟเหลือง จนกว่าจะมีอะไหล่
  const handleWaitParts = (task: TaskItem) => {
    fetch(`/api/v1/repair.php?id=${task.rawId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "waiting_parts" })
    }).then(() => {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: "pending_parts" } : t));
    });
  };

  // อะไหล่มาถึงแล้ว — กลับมาซ่อมต่อ
  const handleResumeTask = (task: TaskItem) => {
    fetch(`/api/v1/repair.php?id=${task.rawId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "in_progress" })
    }).then(() => {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: "in_progress", overdue: isRepairOverdue(t.estimatedCompletion, "in_progress") } : t));
    });
  };

  const openCloseModal = (task: TaskItem) => {
    setSelectedTask(task);
    // prefill ค่าเดิมถ้าเคยบันทึกไว้ (เปิดอีกครั้ง = แก้ไขย้อนหลังได้)
    setFailureCode(task.failureCode || "");
    setRepairCode(task.repairCode || "");
    setCostParts(task.costParts ? String(task.costParts) : "");
    setCostLabor(task.costLabor ? String(task.costLabor) : "");
    setCostOutsource(task.costOutsource ? String(task.costOutsource) : "");
    setDowntimeMinutes(task.downtimeMinutes ? String(task.downtimeMinutes) : "");
    setOutsourceBy(task.outsourceBy || "");
    setContaminateChecking("");
    setCloseModalOpen(true);
  };

  const handleConfirmClose = async () => {
    if (!selectedTask) return;
    // ต้องกรอกของจริง — ไม่มีค่าเริ่มต้นปลอม
    if (!rootCause.trim() || !solution.trim()) {
      alert("กรุณากรอกสาเหตุของปัญหา และวิธีการแก้ไข ก่อนปิดใบงาน");
      return;
    }
    // บังคับผลตรวจการปนเปื้อนก่อนปิดงาน (สำคัญกับโรงงานอาหาร)
    if (!["clean", "contaminated", "not_applicable"].includes(contaminateChecking)) {
      alert("กรุณาระบุผลตรวจการปนเปื้อน (ไม่พบการปนเปื้อน / พบการปนเปื้อน / ไม่เกี่ยวข้องกับงานนี้) ก่อนปิดใบงานซ่อม");
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
          contaminate_checking: contaminateChecking,
          failure_code_id: failureCodes.find(c => c.code === failureCode)?.id || null,
          repair_code_id: repairCodes.find(c => c.code === repairCode)?.id || null,
          cost_parts: costParts ? Number(costParts) : null,
          cost_labor: costLabor ? Number(costLabor) : null,
          cost_outsource: costOutsource ? Number(costOutsource) : null,
          downtime_minutes: downtimeMinutes ? Number(downtimeMinutes) : null,
          outsource_by: outsourceBy.trim() ? outsourceBy.trim() : null,
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
    const matchTab = activeTab === "new"
      ? t.status === "new"
      : activeTab === "in_progress"
        ? t.status === "in_progress" || t.status === "pending_parts"
        : t.status === "completed";
    const matchOutsource = outsourceFilter === "all" || (outsourceFilter === "out" ? !!t.outsourceBy : !t.outsourceBy);
    return matchTab && matchOutsource;
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
      header: t("tbl.work_order_no"),
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
    { key: "machine", header: t("tbl.asset"), width: proportional(2) },
    {
      key: "title",
      header: t("tbl.subject"),
      width: proportional(2.5),
      renderCell: (task) => (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text type="body" size="sm">{task.title}</Text>
          {task.outsourceBy && (
            <span className="cmms-andon-chip" style={{ background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}>
              ภายนอก{task.outsourceBy ? ` · ${task.outsourceBy}` : ""}
            </span>
          )}
        </HStack>
      ),
    },
    {
      key: "status",
      header: t("tbl.status"),
      width: proportional(1.4),
      renderCell: (task) => {
        const k =
          task.kind === "pm"
            ? task.status === "completed" ? "completed" : task.status === "in_progress" ? "in_progress" : "open"
            : task.status === "new" ? "open" : task.status === "pending_parts" ? "waiting_parts" : task.status;
        return (
          <HStack gap={1.5} vAlign="center">
            <AndonLamp status={repairStatusAndon(k, task.overdue)} size="sm" />
            <Text type="body" size="sm" weight="semibold" style={{ color: task.overdue ? "var(--cmms-danger)" : undefined }}>
              {task.overdue ? "เกินกำหนด" : repairStatusLabel(k)}
            </Text>
          </HStack>
        );
      },
    },
    {
      key: "assignedToName",
      header: t("tbl.assignee"),
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
        <Text type="body" size="sm" style={{ color: task.overdue ? "var(--cmms-danger)" : undefined }}>
          {task.estimatedCompletion ? String(task.estimatedCompletion).slice(0, 10) : "-"}
        </Text>
      ),
    },
    {
      key: "beforeImg",
      header: t("tbl.before_after"),
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
      header: t("tbl.processing"),
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
            {task.status === "new" && currentUserId !== null && (task.assignedTo === currentUserId || (task.teamIds || []).includes(currentUserId)) && !task.team?.some((m) => m.user_id === currentUserId && m.status === "accepted") && (
              <button
                type="button"
                onClick={() => handleAcceptTask(task)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition-all duration-300"
              >
                <CheckCircleIcon className="w-3.5 h-3.5" />
                รับงาน
              </button>
            )}

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
              <>
                <button
                  type="button"
                  onClick={() => handleWaitParts(task)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 transition-all duration-300"
                >
                  <ClockIcon className="w-3.5 h-3.5" />
                  รออะไหล่
                </button>
                <button
                  type="button"
                  onClick={() => openCloseModal(task)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cmms-btn-primary"
                >
                  <CheckIcon className="w-3.5 h-3.5" />
                  ปิดใบงานซ่อม
                </button>
              </>
            )}

            {task.status === "pending_parts" && (
              <>
                <button
                  type="button"
                  onClick={() => handleResumeTask(task)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 transition-all duration-300"
                >
                  <ArrowPathIcon className="w-3.5 h-3.5" />
                  กลับมาซ่อมต่อ
                </button>
                <button
                  type="button"
                  onClick={() => openCloseModal(task)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cmms-btn-primary"
                >
                  <CheckIcon className="w-3.5 h-3.5" />
                  ปิดใบงานซ่อม
                </button>
              </>
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
            {hero.eyebrow}
          </Text>
          <Heading level={2} style={{ color: "#fff" }}>{hero.title}</Heading>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {hero.desc}
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
        <HStack gap={1} vAlign="center" style={{ background: "var(--cmms-bg-card)", border: "1px solid var(--cmms-border)", borderRadius: 10, padding: 3 }}>
          {([
            { v: "all", label: "ทั้งหมด" },
            { v: "in", label: "งานใน" },
            { v: "out", label: "งานภายนอก" },
          ] as const).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setOutsourceFilter(opt.v)}
              style={{
                padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
                background: outsourceFilter === opt.v ? "var(--cmms-bg-wash)" : "transparent",
                color: outsourceFilter === opt.v ? "var(--cmms-primary-hover)" : "var(--cmms-text-secondary)",
                boxShadow: outsourceFilter === opt.v ? "0 1px 3px rgba(15,23,42,0.12)" : "none",
              }}
            >
              {opt.label}
            </button>
          ))}
        </HStack>
      </div>

      {/* Offline banner — ข้อมูลมาจาก snapshot (IndexedDB) */}
      {offline && (
        <Banner
          status={onlineBack ? "success" : "warning"}
          title={
            onlineBack
              ? "เชื่อมต่อกลับมาแล้ว — ข้อมูลยังไม่ทันสมัย"
              : `โหมดออฟไลน์ — ข้อมูล ณ ${snapshotTime ? formatTime(snapshotTime) : "ครั้งล่าสุด"}`
          }
          description={
            retryMsg ||
            (onlineBack
              ? "กด \"โหลดข้อมูลใหม่\" เพื่อดึงข้อมูลล่าสุดจากเซิร์ฟเวอร์"
              : "กำลังแสดงข้อมูลจากเครื่องของคุณ งานที่แก้ไขตอนนี้จะถูกบันทึกเมื่อกลับมาออนไลน์เท่านั้น")
          }
          endContent={
            <Button
              label="โหลดข้อมูลใหม่"
              variant={onlineBack ? "primary" : "ghost"}
              size="sm"
              onClick={() => {
                if (!navigator.onLine) {
                  setRetryMsg("ยังไม่มีอินเทอร์เน็ต — ลองอีกครั้งเมื่อเชื่อมต่อได้");
                  return;
                }
                window.location.reload();
              }}
            />
          }
        />
      )}

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
      <AnimatedDialog
        width="min(720px, 94vw)"
        maxHeight="92dvh"
        open={closeModalOpen}
        onClose={() => setCloseModalOpen(false)}
        className="cmms-close-work-modal"
      >
        <div className="cmms-bottom-sheet-handle" aria-hidden="true" />
          <DialogHeader title={`ปิดใบงานซ่อม: ${selectedTask?.woNumber}`} />
          <VStack gap={4} style={{ padding: 24 }} className="cmms-dialog-body">
            <FormLayout>
              <Grid columns={2} gap={4}>
                <Field label="กลุ่มอาการเสีย (รหัส F)" inputID="fCode">
                  <Selector
                    label="รหัสอาการเสีย"
                    isLabelHidden
                    placeholder="เลือกกลุ่มอาการเสีย (รหัส F)"
                    value={failureCode}
                    onChange={setFailureCode}
                    options={failureCodes.map(c => ({ value: c.code, label: `${c.code} - ${c.name}` }))}
                  />
                </Field>

                <Field label="กลุ่มงานซ่อม (รหัส R)" inputID="rCode">
                  <Selector
                    label="รหัสการซ่อม"
                    isLabelHidden
                    placeholder="เลือกกลุ่มงานซ่อม (รหัส R)"
                    value={repairCode}
                    onChange={setRepairCode}
                    options={repairCodes.map(c => ({ value: c.code, label: `${c.code} - ${c.name}` }))}
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

              {/* ผลตรวจการปนเปื้อน — บังคับก่อนปิดงาน (โรงงานอาหาร) */}
              <Field label="ผลตรวจการปนเปื้อน *" inputID="contamCheck" isRequired>
                <Selector
                  label="ผลตรวจการปนเปื้อน"
                  isLabelHidden
                  placeholder="เลือกผลตรวจการปนเปื้อน (บังคับ)"
                  value={contaminateChecking}
                  onChange={setContaminateChecking}
                  options={[
                    { value: "clean", label: "ไม่พบการปนเปื้อน (ผ่าน)" },
                    { value: "contaminated", label: "พบการปนเปื้อน" },
                    { value: "not_applicable", label: "ไม่เกี่ยวข้องกับงานนี้" },
                  ]}
                />
              </Field>

              {/* ค่าใช้จ่าย / เวลาหยุดเครื่อง / ผู้รับเหมา — บันทึกจริง ไปแสดงใน F-EN-03 */}
              <Grid columns={2} gap={4}>
                <Field label="ค่าอะไหล่ (บาท)" inputID="costParts">
                  <TextInput
                    label="ค่าอะไหล่"
                    isLabelHidden
                    placeholder="เช่น 4500"
                    value={costParts}
                    onChange={(v) => setCostParts(v.replace(/\D/g, ""))}
                  />
                </Field>
                <Field label="ค่าแรง (บาท)" inputID="costLabor">
                  <TextInput
                    label="ค่าแรง"
                    isLabelHidden
                    placeholder="เช่น 1200"
                    value={costLabor}
                    onChange={(v) => setCostLabor(v.replace(/\D/g, ""))}
                  />
                </Field>
                <Field label="ค่าจ้างภายนอก (บาท)" inputID="costOutsource">
                  <TextInput
                    label="ค่าจ้างภายนอก"
                    isLabelHidden
                    placeholder="เช่น 15000"
                    value={costOutsource}
                    onChange={(v) => setCostOutsource(v.replace(/\D/g, ""))}
                  />
                </Field>
                <Field label="เวลาหยุดเครื่องจักร (นาที)" inputID="downtimeMin">
                  <TextInput
                    label="เวลาหยุดเครื่อง"
                    isLabelHidden
                    placeholder="เช่น 120"
                    value={downtimeMinutes}
                    onChange={(v) => setDowntimeMinutes(v.replace(/\D/g, ""))}
                  />
                </Field>
                <Field label="ผู้รับเหมาภายนอก (ถ้ามี)" inputID="outsourceBy">
                  <TextInput
                    label="ผู้รับเหมาภายนอก"
                    isLabelHidden
                    placeholder="เช่น บริษัท ไฮโดรเทสต์ จำกัด"
                    value={outsourceBy}
                    onChange={setOutsourceBy}
                  />
                </Field>
              </Grid>

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

          </VStack>
          <div className="cmms-dialog-footer">
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
          </div>
        </AnimatedDialog>
    </VStack>
  );
}
