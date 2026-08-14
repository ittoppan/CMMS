"use client";

import { useEffect, useState, useCallback } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  DocumentCheckIcon,
} from "@heroicons/react/24/outline";

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

  const columns: TableColumn<ApprovalItem>[] = [
    { key: "documentNo", header: "เลขที่เอกสาร", width: proportional(1.2) },
    {
      key: "requestType",
      header: "ประเภทรายการ",
      width: proportional(1.4),
      renderCell: (item) => (
        <Text type="body" size="sm">{typeLabels[item.requestType] || item.requestType}</Text>
      ),
    },
    { key: "requester", header: "ผู้ยื่นคำขอ", width: proportional(1.2) },
    { key: "detail", header: "รายละเอียดคำขอ", width: proportional(2.5) },
    { key: "createdAt", header: "วันที่ยื่น", width: proportional(1.2) },
    {
      key: "status",
      header: "สถานะ",
      width: proportional(1),
      renderCell: (item) => (
        <span
          className="cmms-andon-chip"
          style={{
            background: item.status === 'approved' ? 'rgba(16,185,129,0.12)' : item.status === 'rejected' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
            color: item.status === 'approved' ? '#059669' : item.status === 'rejected' ? '#dc2626' : '#d97706',
            fontSize: '0.75rem',
            padding: '4px 10px',
          }}
        >
          {item.status === 'approved' ? 'อนุมัติแล้ว' : item.status === 'rejected' ? 'ไม่อนุมัติ' : 'รออนุมัติ'}
        </span>
      ),
    },
    {
      key: "actions",
      header: "การอนุมัติ",
      width: proportional(1.8),
      renderCell: (item) =>
        item.status === "pending" ? (
          <HStack gap={2} wrap="wrap">
            <button
              type="button"
              disabled={processingId !== null && processingId !== item.id}
              onClick={() => handleAction(item, "approve")}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-md hover:brightness-110 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircleIcon className="w-3.5 h-3.5" />
              {processingId === item.id ? "กำลัง..." : "อนุมัติ"}
            </button>
            <button
              type="button"
              disabled={processingId !== null}
              onClick={() => handleAction(item, "reject")}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-red-500 to-red-600 shadow-md hover:brightness-110 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <XCircleIcon className="w-3.5 h-3.5" />
              ปฏิเสธ
            </button>
          </HStack>
        ) : (
          <Text type="body" size="sm" color="disabled">ดำเนินการแล้ว</Text>
        ),
    },
  ];

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>APPROVAL CENTER · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>ศูนย์อนุมัติเอกสารและคำขอ</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <DocumentCheckIcon className="w-3.5 h-3.5" /> จัดการขั้นตอนการอนุมัติ
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            อนุมัติปิดงานซ่อม การเบิกอะไหล่ และใบอนุญาตทำงานเสี่ยงสำหรับหัวหน้างานและผู้จัดการ
          </Text>
        </VStack>
        <button
          type="button"
          onClick={fetchApprovals}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
        >
          <ClockIcon className="w-4 h-4" />
          รีเฟรช
        </button>
      </div>

      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      {actionMsg && (
        <div style={{
          padding: '12px 20px', borderRadius: 8,
          background: actionMsg.isError ? 'var(--cmms-danger-light, #fef2f2)' : 'var(--cmms-success-light)',
          border: `1px solid ${actionMsg.isError ? 'var(--cmms-danger, #ef4444)' : 'var(--cmms-success)'}`,
          color: actionMsg.isError ? 'var(--cmms-danger, #ef4444)' : 'var(--cmms-success)',
          fontWeight: 600,
        }}>
          {actionMsg.isError ? "❌ " : "✅ "}{actionMsg.text}
        </div>
      )}

      <Grid columns={{ minWidth: 220, max: 3 }} gap={4}>
        <Card padding={4} className="cmms-kpi-card" style={{ borderLeft: '4px solid var(--cmms-warning)' }}>
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shrink-0">
              <ClockIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">รายการรอการอนุมัติ</Text>
              <Heading level={3}>{summary.pending} <span style={{ fontSize: 14 }}>รายการ</span></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4} className="cmms-kpi-card" style={{ borderLeft: '4px solid var(--cmms-success)' }}>
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-700 text-white flex items-center justify-center shadow-md shrink-0">
              <CheckCircleIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">อนุมัติแล้วทั้งหมด</Text>
              <Heading level={3}>{summary.approved} <span style={{ fontSize: 14 }}>รายการ</span></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4} className="cmms-kpi-card" style={{ borderLeft: '4px solid var(--cmms-danger)' }}>
          <HStack gap={3} vAlign="center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-700 text-white flex items-center justify-center shadow-md shrink-0">
              <XCircleIcon className="w-6 h-6" />
            </div>
            <VStack gap={1}>
              <Text type="supporting" color="secondary">ปฏิเสธ / ส่งกลับแก้ไข</Text>
              <Heading level={3}>{summary.rejected} <span style={{ fontSize: 14 }}>รายการ</span></Heading>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="ยังไม่มีคำขออนุมัติ"
            description="เมื่อมีเอกสารที่ต้องอนุมัติ (เช่น ปิดงานซ่อม ใบเบิกอะไหล่ LOTO) จะแสดงที่นี่"
            icon={<DocumentCheckIcon className="w-8 h-8" />}
          />
        ) : (
          <Table<ApprovalItem>
            data={items}
            columns={columns}
            idKey="id"
            density="balanced"
            dividers="rows"
          />
        )}
      </Card>
    </VStack>
  );
}
