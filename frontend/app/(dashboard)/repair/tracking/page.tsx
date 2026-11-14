"use client";

import { useState, useEffect } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { normalizeRepairStatus, isRepairOverdue } from "@/lib/repair-status";
import { useToast } from "@/components/ToastProvider";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Star, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type UiTableFeatures } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";

type TrackWO = Record<string, unknown> & {
  id: string;
  rawId: number;
  woNumber: string;
  machine: string;
  symptoms: string;
  status: "pending_assign" | "pending_accept" | "in_progress" | "pending_parts" | "pending_eval" | "completed";
  overdue: boolean;
  requestDate: string;
  technician?: string;
  etaDate?: string;
  ratingScore?: number | null;
  ratingComment?: string | null;
};

export default function RepairTrackingPage() {
  const hero = usePageHero("repair/tracking");
  const router = useRouter();
  const [data, setData] = useState<TrackWO[]>([]);
  const [error, setError] = useState<boolean>(false);

    useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/v1/repair.php");
        const json = await res.json().catch(() => null);
        const rows = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : null);
        if (res.ok && Array.isArray(rows)) {
          const mapped: TrackWO[] = rows.map((row: any, index: number) => {
            const ratingScore = row.rating_score != null && row.rating_score !== "" ? Number(row.rating_score) : null;
            const k = normalizeRepairStatus(row.status);
            let status: TrackWO["status"] = "pending_assign";
            if (k === "completed" || k === "closed") {
              status = ratingScore ? "completed" : "pending_eval";
            } else if (k === "waiting_parts") {
              status = "pending_parts";
            } else if (k === "in_progress") {
              status = "in_progress";
            } else {
              status = "pending_assign";
            }
            return {
              id: `db-wo-${row.id || index}`,
              rawId: Number(row.id || index),
              woNumber: row.work_order_no || row.wo_number || `EN-${String(row.id || index).padStart(3, '0')}`,
              machine: row.asset_name || "-",
              symptoms: row.title || row.description || "-",
              status,
              // ใช้กำหนดส่งตัวเดียวกับหน้า /repair และ KPI: sla_due_at ก่อน → estimated_completion_date
              overdue: isRepairOverdue(row.sla_due_at || row.estimated_completion_date, row.status),
              requestDate: row.created_at || "-",
              technician: row.assigned_name || "-",
              ratingScore,
              ratingComment: row.rating_comment != null ? String(row.rating_comment) : null,
            };
          });
          setData(mapped);
          setError(false);
        } else {
          setError(true);
        }
      } catch (e) {
        console.error("Fetch MySQL repair log error:", e);
        setError(true);
      }
    })();
  }, []);

  // Evaluation Dialog
  const [evalModalOpen, setEvalModalOpen] = useState(false);
  const [selectedWo, setSelectedWo] = useState<TrackWO | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const { showToast } = useToast();

    const handleEvaluate = (wo: TrackWO) => {
    setSelectedWo(wo);
    setRating(wo.ratingScore && wo.ratingScore >= 1 && wo.ratingScore <= 5 ? wo.ratingScore : 5);
    setComment(wo.ratingComment || "");
    setEvalModalOpen(true);
  };

  const submitEvaluation = async () => {
    if (!selectedWo) return;
    try {
      const res = await fetch("/api/v1/repair.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "rate",
          repair_id: selectedWo.rawId,
          rating_score: rating,
          rating_comment: comment,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error || "บันทึกการประเมินไม่สำเร็จ");
      }
      setData(prev => prev.map(w => w.id === selectedWo.id ? { ...w, status: "completed", ratingScore: rating, ratingComment: comment } : w));
      setEvalModalOpen(false);
      showToast("success", "บันทึกการประเมินงานเรียบร้อยแล้ว");
    } catch (e: any) {
      console.error("Submit evaluation error:", e);
      showToast("error", e?.message || "บันทึกการประเมินไม่สำเร็จ");
    }
  };

  const getStatusDisplay = (wo: TrackWO) => {
    // เกินกำหนด (กำหนดเสร็จผ่านไปแล้ว ยังไม่จบ) → ไฟแดง สำคัญสุดเสมอ
    if (wo.overdue) {
      return <span className="cmms-status down"><span className="cmms-status-dot" />เกินกำหนด</span>;
    }
    switch(wo.status) {
      case 'pending_assign': return <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>รอมอบหมายงาน</span>;
      case 'pending_accept': return <span className="cmms-status warn"><span className="cmms-status-dot" />รอช่างรับงาน</span>;
      case 'in_progress': return <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>กำลังดำเนินการซ่อม</span>;
      case 'pending_parts': return <span className="cmms-status warn"><span className="cmms-status-dot" />รออะไหล่</span>;
      case 'pending_eval': return <span className="cmms-status down"><span className="cmms-status-dot" />รอการประเมินจากผู้แจ้ง</span>;
      case 'completed': return <span className="cmms-status ok"><span className="cmms-status-dot" />เสร็จสมบูรณ์</span>;
      default: return <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>{wo.status}</span>;
    }
  };

  const columns: ColumnDef<UiTableFeatures, TrackWO>[] = [
    {
      accessorKey: "woNumber",
      header: t("tbl.work_order_no"),
      meta: { cardTitle: true },
      cell: ({ row }: { row: { original: TrackWO } }) => (
        <strong>{row.original.woNumber}</strong>
      ),
    },
    { accessorKey: "machine", header: t("tbl.asset_full") },
    { accessorKey: "symptoms", header: t("tbl.issue_desc") },
    {
      accessorKey: "status",
      header: t("tbl.repair_status"),
      cell: ({ row }: { row: { original: TrackWO } }) => getStatusDisplay(row.original),
    },
    {
      accessorKey: "technician",
      header: t("tbl.tech_assignee"),
      cell: ({ row }: { row: { original: TrackWO } }) => row.original.technician || "-",
    },
    {
      accessorKey: "requestDate",
      header: t("tbl.request_date"),
      cell: ({ row }: { row: { original: TrackWO } }) => (
        <span className="text-[var(--cmms-text-secondary)]">{row.original.requestDate}</span>
      ),
    },
    {
      id: "actions",
      header: t("tbl.actions"),
      enableSorting: false,
            cell: ({ row }: { row: { original: TrackWO } }) => {
        const item = row.original;
        if (item.status === 'pending_eval' && !item.ratingScore) {
          return (
            <Button size="sm" onClick={() => handleEvaluate(item)} className="gap-1.5">
              <Star size={14} strokeWidth={2} aria-hidden="true" />
              ประเมินผล
            </Button>
          );
        }
        return (
          <div className="flex items-center gap-2">
            {item.ratingScore ? (
              <span className="inline-flex items-center gap-1 text-sm text-[var(--cmms-warning)]" title="ประเมินแล้ว">
                <Star size={14} strokeWidth={1.75} fill="currentColor" aria-hidden="true" />
                {item.ratingScore}
              </span>
            ) : null}
            <Button size="sm" variant="secondary" onClick={() => router.push(`/repair/view?id=${item.rawId}`)}>
              ดูรายละเอียด
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="cmms-eyebrow">{hero.eyebrow}</p>
        <PageHeader title={hero.title} description={hero.desc} />
      </div>

      {error ? (
        <Alert variant="danger" title="เกิดข้อผิดพลาด" description="ไม่สามารถโหลดข้อมูลงานซ่อมได้" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg cmms-icon-tile">
                <Wrench size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              รายการงานซ่อมที่แจ้งไว้
              <span className="cmms-count-pill">{data.length} รายการ</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              exportFileName="repair-tracking"
              variant="cards"
              columns={columns}
              data={data}
              getRowId={(row) => row.id}
              emptyTitle="ไม่พบข้อมูล"
              emptyDescription="ไม่มีรายการงานซ่อมที่คุณได้แจ้งไว้"
            />
          </CardContent>
        </Card>
      )}

      {/* Evaluation Modal */}
      <Dialog
        open={evalModalOpen}
        onClose={() => setEvalModalOpen(false)}
        title="ประเมินผลความพึงพอใจงานซ่อม"
        footer={
          <>
            <Button variant="outline" onClick={() => setEvalModalOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={submitEvaluation}>บันทึกการประเมิน</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2 rounded-[var(--cmms-radius)] bg-[var(--cmms-bg-muted)] p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--cmms-text-secondary)]">ใบงาน:</span>
              <span className="font-bold">{selectedWo?.woNumber}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--cmms-text-secondary)]">เครื่องจักร:</span>
              <span className="font-bold">{selectedWo?.machine}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--cmms-text-secondary)]">ช่างซ่อม:</span>
              <span className="font-semibold text-[var(--cmms-primary)]">{selectedWo?.technician}</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">ให้คะแนนความพึงพอใจ:</p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                  aria-pressed={star <= rating}
                  onClick={() => setRating(star)}
                  className="rounded p-1 transition-colors hover:bg-[var(--cmms-bg-muted)]"
                >
                  <Star
                    size={20}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className={star <= rating ? "text-[var(--cmms-warning)]" : "text-[var(--cmms-text-muted)]"}
                    fill={star <= rating ? "currentColor" : "none"}
                  />
                </button>
              ))}
            </div>
          </div>

          <Textarea
            label="ข้อเสนอแนะเพิ่มเติม"
            placeholder="แสดงความคิดเห็นต่อการซ่อมบำรุง..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
          />
        </div>
      </Dialog>
    </div>
  );
}
