"use client";

import { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/components/PageShell";
import { HStack, Grid } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import {
  CheckCircle2,
  XCircle,
  Clock,
  FileCheck,
  RefreshCw,
} from "lucide-react";

interface ApprovalItem extends Record<string, unknown> {
  id: string;
  requestType: string;
  documentNo: string;
  requester: string;
  detail: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
  token: string;
}

const typeLabels: Record<string, string> = {
  repair: "ปิดงานซ่อมบำรุง",
  requisition: "เบิกอะไหล่ข้ามคลัง",
  loto: "ใบอนุญาตทำงานเสี่ยง",
  work_permit: "ใบอนุญาตทำงาน",
  pm: "แผนบำรุงรักษา",
  spare_issue: "ใบเบิกอะไหล่",
};

const statusBadge: Record<ApprovalItem["status"], { label: string; variant: "success" | "danger" | "warning" }> = {
  approved: { label: "อนุมัติแล้ว", variant: "success" },
  rejected: { label: "ไม่อนุมัติ", variant: "danger" },
  pending: { label: "รออนุมัติ", variant: "warning" },
};

export default function ApprovalCenterPage() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [summary, setSummary] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/approval.php");
      const json = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        setItems(
          json.data.map((row: any) => ({
            id: `app-${row.id}`,
            requestType: row.request_type || "unknown",
            documentNo: row.document_no || "-",
            requester: row.requester_name || "-",
            detail: row.title || "-",
            createdAt: row.created_at ? String(row.created_at).slice(0, 16) : "-",
            status: row.status === "pending" || row.status === "approved" || row.status === "rejected" ? row.status : "pending",
            token: row.approval_token || "",
          }))
        );
        setSummary(json.summary || { pending: 0, approved: 0, rejected: 0 });
      } else {
        setError(json.message || "ไม่สามารถโหลดข้อมูลคำขออนุมัติได้");
      }
    } catch (e) {
      console.error("Fetch approvals error", e);
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const handleAction = async (item: ApprovalItem, action: "approve" | "reject") => {
    setProcessingId(item.id);
    setActionMsg(null);
    try {
      const res = await fetch("/api/v1/approval.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: item.token, action }),
      });
      const json = await res.json();
      if (json.status === "success") {
        setActionMsg({
          text: action === "approve"
            ? `อนุมัติรายการ ${item.documentNo} เรียบร้อยแล้ว`
            : `ปฏิเสธรายการ ${item.documentNo} เรียบร้อยแล้ว`,
          isError: false,
        });
        fetchApprovals();
      } else {
        setActionMsg({ text: json.message || "ดำเนินการไม่สำเร็จ", isError: true });
      }
    } catch (e) {
      console.error("Approval action error", e);
      setActionMsg({ text: "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ", isError: true });
    } finally {
      setProcessingId(null);
    }
  };

  const columns: SimpleColumn<ApprovalItem>[] = [
    { key: "documentNo", header: "เลขที่เอกสาร" },
    {
      key: "requestType",
      header: "ประเภทรายการ",
      renderCell: (item) => (
        <span className="text-sm text-foreground">{typeLabels[item.requestType] || item.requestType}</span>
      ),
    },
    { key: "requester", header: "ผู้ยื่นคำขอ" },
    { key: "detail", header: "รายละเอียดคำขอ" },
    { key: "createdAt", header: "วันที่ยื่น" },
    {
      key: "status",
      header: "สถานะ",
      renderCell: (item) => (
        <Badge variant={statusBadge[item.status].variant}>{statusBadge[item.status].label}</Badge>
      ),
    },
    {
      key: "actions",
      header: "การอนุมัติ",
      renderCell: (item) =>
        item.status === "pending" ? (
          <HStack gap={2} wrap="wrap">
            <Button
              size="sm"
              disabled={processingId !== null && processingId !== item.id}
              onClick={() => handleAction(item, "approve")}
            >
              <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden="true" />
              {processingId === item.id ? "กำลัง..." : "อนุมัติ"}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={processingId !== null}
              onClick={() => handleAction(item, "reject")}
            >
              <XCircle size={14} strokeWidth={1.75} aria-hidden="true" />
              ปฏิเสธ
            </Button>
          </HStack>
        ) : (
          <span className="text-sm text-muted-foreground">ดำเนินการแล้ว</span>
        ),
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">APPROVAL CENTER · CMMS-TOPPAN</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "อนุมัติ" },
      ]}
      title="ศูนย์อนุมัติเอกสารและคำขอ"
      description="อนุมัติปิดงานซ่อม การเบิกอะไหล่ และใบอนุญาตทำงานเสี่ยงสำหรับหัวหน้างานและผู้จัดการ"
      actions={
        <Button variant="secondary" onClick={fetchApprovals}>
          <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
          รีเฟรช
        </Button>
      }
    >
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      {actionMsg && (
        <Alert
          variant={actionMsg.isError ? "danger" : "success"}
          description={`${actionMsg.isError ? "❌ " : "✅ "}${actionMsg.text}`}
          className="font-semibold"
        />
      )}

      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]">
              <Clock className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">รายการรอการอนุมัติ</p>
              <p className="cmms-kpi-value tabular-nums">
                {summary.pending} <span className="text-sm font-normal">รายการ</span>
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-success-light)] text-[var(--cmms-success-dark)]">
              <CheckCircle2 className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">อนุมัติแล้วทั้งหมด</p>
              <p className="cmms-kpi-value tabular-nums">
                {summary.approved} <span className="text-sm font-normal">รายการ</span>
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-danger-light)] text-[var(--cmms-danger-dark)]">
              <XCircle className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">ปฏิเสธ / ส่งกลับแก้ไข</p>
              <p className="cmms-kpi-value tabular-nums">
                {summary.rejected} <span className="text-sm font-normal">รายการ</span>
              </p>
            </div>
          </div>
        </Card>
      </Grid>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-12">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="ยังไม่มีคำขออนุมัติ"
            description="เมื่อมีเอกสารที่ต้องอนุมัติ (เช่น ปิดงานซ่อม ใบเบิกอะไหล่ LOTO) จะแสดงที่นี่"
            icon={<FileCheck className="h-8 w-8" strokeWidth={1.75} aria-hidden="true" />}
          />
        ) : (
          <SimpleDataTable<ApprovalItem>
            columns={columns}
            data={items}
            idKey="id"
            pageSize={10}
            emptyTitle="ยังไม่มีคำขออนุมัติ"
            emptyDescription="เมื่อมีเอกสารที่ต้องอนุมัติจะแสดงที่นี่"
          />
        )}
      </Card>
    </PageShell>
  );
}
