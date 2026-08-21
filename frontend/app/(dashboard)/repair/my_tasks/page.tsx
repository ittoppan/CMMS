"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePageHero, t, statusText, priorityText } from "@/lib/i18n";
import { repairStatusLabel, repairStatusAndon, isRepairOverdue } from "@/lib/repair-status";
import AndonLamp from "@/components/AndonLamp";
import { snapshotSave, snapshotLoad } from "@/lib/offline-store";
import { formatClockTime, formatRelativeTime } from "@/lib/time-utils";
import { serverResponds } from "@/lib/server-check";
import AnimatedDialog from "@/components/AnimatedDialog";
import { DialogHeader } from "@astryxdesign/core/Dialog";
import { type ColumnDef } from "@tanstack/react-table";
import {
  CheckCircle2,
  Play,
  Check,
  Calendar,
  Eye,
  Camera,
  Trash2,
  Wrench,
  Clock,
  RefreshCw,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { DataTable, type UiTableFeatures } from "@/components/ui/table";

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
  const [onlineBack, setOnlineBack] = useState(false);
  const offlineRef = useRef(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);

  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  // Close Work Order Form State
  const [failureCode, setFailureCode] = useState("");
  const [repairCode, setRepairCode] = useState("");
  const [failureCodes, setFailureCodes] = useState<{ id: number; code: string; name: string }[]>([]);
  const [repairCodes, setRepairCodes] = useState<{ id: number; code: string; name: string }[]>([]);
  const [rootCause, setRootCause] = useState("");
  const [solution, setSolution] = useState("");
  const [afterImg, setAfterImg] = useState("");
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [receiverSignature, setReceiverSignature] = useState("");
  const [closing, setClosing] = useState(false);
  const [contaminateChecking, setContaminateChecking] = useState("");
  const [costParts, setCostParts] = useState("");
  const [costLabor, setCostLabor] = useState("");
  const [costOutsource, setCostOutsource] = useState("");
  const [downtimeMinutes, setDowntimeMinutes] = useState("");
  const [outsourceBy, setOutsourceBy] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
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
    fetch("/api/v1/menu_permissions.php")
      .then((res) => res.json())
      .then((json) => {
        if (json?.user?.id) setCurrentUserId(Number(json.user.id));
      })
      .catch(() => {});

    fetch("/api/v1/repair.php?reference=codes")
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j?.failure_codes)) setFailureCodes(j.failure_codes);
        if (Array.isArray(j?.repair_codes)) setRepairCodes(j.repair_codes);
      })
      .catch(() => {});

    const applyRows = (rows: any[], pmJson: any) => {
      const mapped: TaskItem[] = [];

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

      const pmList = Array.isArray(pmJson) ? pmJson : Array.isArray(pmJson?.data) ? pmJson.data : [];
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
          priority: pStatus === "overdue" || (p.due_date && String(p.due_date) < new Date().toISOString().slice(0, 10)) ? "high" : "medium",
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
        console.error("Fetch tasks error", e);
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
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    fetch(`/api/v1/repair.php?id=${task.rawId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "in_progress", actual_start_at: now, acknowledged_at: now }),
    }).then(() => {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: "in_progress", overdue: isRepairOverdue(t.estimatedCompletion, "in_progress") } : t))
      );
    });
  };

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
      .catch(() => {});
  };

  const handleWaitParts = (task: TaskItem) => {
    fetch(`/api/v1/repair.php?id=${task.rawId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "waiting_parts" }),
    }).then(() => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: "pending_parts" } : t)));
    });
  };

  const handleResumeTask = (task: TaskItem) => {
    fetch(`/api/v1/repair.php?id=${task.rawId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "in_progress" }),
    }).then(() => {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: "in_progress", overdue: isRepairOverdue(t.estimatedCompletion, "in_progress") } : t))
      );
    });
  };

  const openCloseModal = (task: TaskItem) => {
    setSelectedTask(task);
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
    if (!rootCause.trim() || !solution.trim()) {
      alert("กรุณากรอกสาเหตุของปัญหา และวิธีการแก้ไข ก่อนปิดใบงาน");
      return;
    }
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
          failure_code_id: failureCodes.find((c) => c.code === failureCode)?.id || null,
          repair_code_id: repairCodes.find((c) => c.code === repairCode)?.id || null,
          cost_parts: costParts ? Number(costParts) : null,
          cost_labor: costLabor ? Number(costLabor) : null,
          cost_outsource: costOutsource ? Number(costOutsource) : null,
          downtime_minutes: downtimeMinutes ? Number(downtimeMinutes) : null,
          outsource_by: outsourceBy.trim() ? outsourceBy.trim() : null,
          completed_at: new Date().toISOString().slice(0, 19).replace("T", " "),
        }),
      });

      setTasks((prev) =>
        prev.map((t) => (t.id === selectedTask.id ? { ...t, status: "completed", afterImg, receiverName, receiverSignature } : t))
      );
      setCloseModalOpen(false);
    } catch (e) {
      console.error("Close WO error", e);
    } finally {
      setClosing(false);
    }
  };

  const myTasks =
    currentUserId === null
      ? tasks
      : tasks.filter((t) => t.assignedTo === currentUserId || (t.teamIds || []).includes(currentUserId));

  const filteredTasks = myTasks.filter((t) => {
    const matchTab =
      activeTab === "new"
        ? t.status === "new"
        : activeTab === "in_progress"
        ? t.status === "in_progress" || t.status === "pending_parts"
        : t.status === "completed";
    const matchOutsource = outsourceFilter === "all" || (outsourceFilter === "out" ? !!t.outsourceBy : !t.outsourceBy);
    return matchTab && matchOutsource;
  });

  const countNew = myTasks.filter((t) => t.status === "new").length;
  const countInProg = myTasks.filter((t) => t.status === "in_progress" || t.status === "pending_parts").length;
  const countDone = myTasks.filter((t) => t.status === "completed").length;

  const goPM = (task: TaskItem) => {
    const params = new URLSearchParams({ plan_id: String(task.rawId) });
    if (task.assetCode) params.set("asset_code", task.assetCode);
    router.push(`/pm_am/checksheet?${params.toString()}`);
  };

  const columns: ColumnDef<UiTableFeatures, TaskItem>[] = [
    {
      accessorKey: "woNumber",
      header: t("tbl.work_order_no"),
      cell: ({ row }: { row: { original: TaskItem } }) => {
        const task = row.original;
        return (
          <div className="flex items-center gap-2">
            <Badge variant="info">{task.kind === "pm" ? "PM" : "ซ่อม"}</Badge>
            <span className="font-semibold text-slate-900 dark:text-slate-100">{task.woNumber}</span>
          </div>
        );
      },
    },
    { accessorKey: "machine", header: t("tbl.asset") },
    {
      accessorKey: "title",
      header: t("tbl.subject"),
      cell: ({ row }: { row: { original: TaskItem } }) => {
        const task = row.original;
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm">{task.title}</span>
            {task.outsourceBy && <Badge variant="warning">ภายนอก · {task.outsourceBy}</Badge>}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: t("tbl.status"),
      cell: ({ row }: { row: { original: TaskItem } }) => {
        const task = row.original;
        const k =
          task.kind === "pm"
            ? task.status === "completed"
              ? "completed"
              : task.status === "in_progress"
              ? "in_progress"
              : "open"
            : task.status === "new"
            ? "open"
            : task.status === "pending_parts"
            ? "waiting_parts"
            : task.status;
        return (
          <div className="flex items-center gap-1.5">
            <AndonLamp status={repairStatusAndon(k, task.overdue)} size="sm" />
            <span className={`text-sm font-semibold ${task.overdue ? "text-red-600 dark:text-red-400" : ""}`}>
              {task.overdue ? "เกินกำหนด" : repairStatusLabel(k)}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "assignedToName",
      header: t("tbl.assignee"),
      cell: ({ row }: { row: { original: TaskItem } }) => {
        const task = row.original;
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span>{task.assignedToName || "-"}</span>
            {currentUserId !== null &&
              task.assignedTo !== currentUserId &&
              (task.teamIds || []).includes(currentUserId) && <Badge variant="info">สมาชิกทีม</Badge>}
          </div>
        );
      },
    },
    {
      accessorKey: "estimatedCompletion",
      header: "กำหนดเสร็จ",
      cell: ({ row }: { row: { original: TaskItem } }) => {
        const task = row.original;
        return (
          <span className={`text-sm ${task.overdue ? "text-red-600 dark:text-red-400 font-semibold" : ""}`}>
            {task.estimatedCompletion ? String(task.estimatedCompletion).slice(0, 10) : "-"}
          </span>
        );
      },
    },
    {
      accessorKey: "beforeImg",
      header: t("tbl.before_after"),
      cell: ({ row }: { row: { original: TaskItem } }) => {
        const task = row.original;
        if (task.kind === "pm") return <span className="text-slate-400">-</span>;
        return (
          <div className="flex items-center gap-1">
            {task.beforeImg && <Badge variant="neutral">ก่อนซ่อม</Badge>}
            {task.afterImg && <Badge variant="neutral">หลังซ่อม</Badge>}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: t("tbl.processing"),
      cell: ({ row }: { row: { original: TaskItem } }) => {
        const task = row.original;
        if (task.kind === "pm") {
          return (
            <div className="flex justify-end">
              {task.status === "completed" ? (
                <span className="text-xs text-slate-400">ทำเสร็จแล้ว</span>
              ) : (
                <Button variant="primary" size="sm" onClick={() => goPM(task)} className="gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>ไปทำ PM</span>
                </Button>
              )}
            </div>
          );
        }
        return (
          <div className="flex items-center justify-end gap-1.5 flex-wrap">
            {task.status === "new" &&
              currentUserId !== null &&
              (task.assignedTo === currentUserId || (task.teamIds || []).includes(currentUserId)) &&
              !task.team?.some((m: any) => m.user_id === currentUserId && m.status === "accepted") && (
                <Button variant="outline" size="sm" onClick={() => handleAcceptTask(task)} className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>รับงาน</span>
                </Button>
              )}

            {task.status === "new" && (
              <Button variant="primary" size="sm" onClick={() => handleStartTask(task)} className="gap-1.5">
                <Play className="w-3.5 h-3.5" />
                <span>เริ่มซ่อม</span>
              </Button>
            )}

            {task.status === "in_progress" && (
              <>
                <Button variant="outline" size="sm" onClick={() => handleWaitParts(task)} className="gap-1.5 text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100">
                  <Clock className="w-3.5 h-3.5" />
                  <span>รออะไหล่</span>
                </Button>
                <Button variant="primary" size="sm" onClick={() => openCloseModal(task)} className="gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  <span>ปิดใบงานซ่อม</span>
                </Button>
              </>
            )}

            {task.status === "pending_parts" && (
              <>
                <Button variant="outline" size="sm" onClick={() => handleResumeTask(task)} className="gap-1.5 text-sky-600 border-sky-300 hover:bg-sky-50">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>กลับมาซ่อมต่อ</span>
                </Button>
                <Button variant="primary" size="sm" onClick={() => openCloseModal(task)} className="gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  <span>ปิดใบงานซ่อม</span>
                </Button>
              </>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/repair/view?id=${task.rawId}`)}
              className="gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>ดูรายละเอียดปิดงาน</span>
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="cmms-eyebrow">{hero.eyebrow}</p>
        <PageHeader
          title={hero.title}
          description={hero.desc}
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-2xl">
        <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
          <button
            onClick={() => setActiveTab("new")}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "new"
                ? "bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            งานใหม่ ({countNew})
          </button>
          <button
            onClick={() => setActiveTab("in_progress")}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "in_progress"
                ? "bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            กำลังซ่อม ({countInProg})
          </button>
          <button
            onClick={() => setActiveTab("completed")}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "completed"
                ? "bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            ซ่อมเสร็จแล้ว ({countDone})
          </button>
        </div>

        <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
          {([
            { v: "all", label: "ทั้งหมด" },
            { v: "in", label: "งานใน" },
            { v: "out", label: "งานภายนอก" },
          ] as const).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setOutsourceFilter(opt.v)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                outsourceFilter === opt.v
                  ? "bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Offline banner */}
      {offline && (
        <Alert
          variant={onlineBack ? "info" : "warning"}
          title={
            onlineBack
              ? "เชื่อมต่อกลับมาแล้ว — ข้อมูลยังไม่ทันสมัย"
              : snapshotTime
              ? `โหมดออฟไลน์ — ข้อมูล ณ ${formatClockTime(snapshotTime)} — ${formatRelativeTime(snapshotTime, now)}`
              : "โหมดออฟไลน์ — ข้อมูล ณ ครั้งล่าสุด"
          }
          action={
            <Button
              variant={onlineBack ? "primary" : "outline"}
              size="sm"
              onClick={async () => {
                if (!navigator.onLine) {
                  setRetryMsg("ยังไม่มีอินเทอร์เน็ต — ลองอีกครั้งเมื่อเชื่อมต่อได้");
                  return;
                }
                setRetryMsg("กำลังตรวจสอบการเชื่อมต่อ…");
                const ok = await serverResponds();
                if (ok) window.location.reload();
                else setRetryMsg("โหลดไม่สำเร็จ — ลองอีกครั้ง");
              }}
            >
              โหลดข้อมูลใหม่
            </Button>
          }
        >
          {retryMsg ||
            (onlineBack
              ? "กด \"โหลดข้อมูลใหม่\" เพื่อดึงข้อมูลล่าสุดจากเซิร์ฟเวอร์"
              : "กำลังแสดงข้อมูลจากเครื่องของคุณ งานที่แก้ไขตอนนี้จะถูกบันทึกเมื่อกลับมาออนไลน์เท่านั้น")}
        </Alert>
      )}

      {/* Table */}
      {error ? (
        <Alert variant="danger" title="เกิดข้อผิดพลาด">
          ไม่สามารถโหลดข้อมูลงานซ่อมได้
        </Alert>
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          title="ไม่พบข้อมูล"
          description="ไม่มีรายการงานซ่อมในสถานะนี้"
          icon={<Wrench className="w-8 h-8 text-slate-400" />}
        />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <span>รายการงานในสถานะนี้</span>
            </CardTitle>
            <Badge variant="info">{filteredTasks.length} รายการ</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable columns={columns} data={filteredTasks} />
          </CardContent>
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
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="กลุ่มอาการเสีย (รหัส F)"
              placeholder="เลือกกลุ่มอาการเสีย (รหัส F)"
              value={failureCode}
              onChange={(e) => setFailureCode(e.target.value)}
            >
              <option value="">เลือกกลุ่มอาการเสีย (รหัส F)</option>
              {failureCodes.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </Select>

            <Select
              label="กลุ่มงานซ่อม (รหัส R)"
              placeholder="เลือกกลุ่มงานซ่อม (รหัส R)"
              value={repairCode}
              onChange={(e) => setRepairCode(e.target.value)}
            >
              <option value="">เลือกกลุ่มงานซ่อม (รหัส R)</option>
              {repairCodes.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </Select>
          </div>

          <Textarea
            label="สาเหตุของปัญหา *"
            placeholder="อธิบายสาเหตุที่แท้จริง เช่น ตลับลูกปืนหมดอายุการใช้งาน..."
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            rows={2}
          />

          <Textarea
            label="วิธีการแก้ไข *"
            placeholder="อธิบายขั้นตอนการซ่อม เช่น ถอดเปลี่ยน SKF 6205 และอัดจาระบี..."
            value={solution}
            onChange={(e) => setSolution(e.target.value)}
            rows={2}
          />

          <Select
            label="ผลตรวจการปนเปื้อน *"
            value={contaminateChecking}
            onChange={(e) => setContaminateChecking(e.target.value)}
          >
            <option value="">เลือกผลตรวจการปนเปื้อน (บังคับ)</option>
            <option value="clean">ไม่พบการปนเปื้อน (ผ่าน)</option>
            <option value="contaminated">พบการปนเปื้อน</option>
            <option value="not_applicable">ไม่เกี่ยวข้องกับงานนี้</option>
          </Select>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              type="number"
              label="ค่าอะไหล่ (บาท)"
              placeholder="เช่น 4500"
              value={costParts}
              onChange={(e) => setCostParts(e.target.value.replace(/\D/g, ""))}
            />
            <Input
              type="number"
              label="ค่าแรง (บาท)"
              placeholder="เช่น 1200"
              value={costLabor}
              onChange={(e) => setCostLabor(e.target.value.replace(/\D/g, ""))}
            />
            <Input
              type="number"
              label="ค่าจ้างภายนอก (บาท)"
              placeholder="เช่น 15000"
              value={costOutsource}
              onChange={(e) => setCostOutsource(e.target.value.replace(/\D/g, ""))}
            />
            <Input
              type="number"
              label="เวลาหยุดเครื่องจักร (นาที)"
              placeholder="เช่น 120"
              value={downtimeMinutes}
              onChange={(e) => setDowntimeMinutes(e.target.value.replace(/\D/g, ""))}
            />
          </div>

          <Input
            label="ผู้รับเหมาภายนอก (ถ้ามี)"
            placeholder="เช่น บริษัท ไฮโดรเทสต์ จำกัด"
            value={outsourceBy}
            onChange={(e) => setOutsourceBy(e.target.value)}
          />

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
              แนบรูปถ่ายหลังซ่อมเสร็จ
            </label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setAfterFile(file);
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    if (ev.target?.result) setAfterImg(String(ev.target.result));
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
            {afterImg && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <img src={afterImg} alt="รูปตัวอย่างหลังซ่อม" className="w-14 h-14 rounded-lg object-cover" />
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  พร้อมแนบรูปถ่ายหลังซ่อมเสร็จ
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <Input
              label="ชื่อผู้รับมอบงานซ่อมเสร็จ *"
              placeholder="กรอกชื่อผู้รับมอบงาน..."
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
            />

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
                ลายเซ็นผู้รับมอบงาน (วาดด้วยเมาส์/นิ้ว) *
              </label>
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
                className="border-2 border-dashed border-emerald-500 rounded-xl bg-white cursor-crosshair touch-none w-full"
              />
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>ใช้เมาส์หรือนิ้วเซ็นชื่อลงในช่อง</span>
                <button
                  type="button"
                  onClick={clearSignature}
                  className="text-red-600 hover:underline font-semibold"
                >
                  ล้างลายเซ็น
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-200 dark:border-slate-800">
          <Button variant="outline" onClick={() => setCloseModalOpen(false)}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            disabled={closing}
            onClick={handleConfirmClose}
            className="gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{closing ? "กำลังบันทึก..." : "ยืนยันปิดใบงานซ่อม"}</span>
          </Button>
        </div>
      </AnimatedDialog>
    </div>
  );
}
