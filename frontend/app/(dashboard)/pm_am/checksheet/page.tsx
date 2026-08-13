"use client";

import { useState, useEffect, useRef } from "react";
import { useToast } from "@/components/ToastProvider";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { useRouter } from "next/navigation";
import {
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

interface CheckItem {
  id: string;
  task: string;
  type: "check" | "value";
  status: "pass" | "fail" | null;
  value: string;
  note: string;
}

// Default checklist ตามความถี่ของแผน PM (กรณีแผนยังไม่มี checklist ใน DB)
function defaultChecklist(frequencyType: string): CheckItem[] {
  const base: CheckItem[] = [
    { id: "c1", task: "ตรวจสอบสภาพโดยรวมของเครื่องจักร (ไม่มีรอยรั่ว เสียงผิดปกติ)", type: "check", status: null, value: "", note: "" },
    { id: "c2", task: "ตรวจสอบระดับน้ำมัน / สารหล่อลื่นให้อยู่ในเกณฑ์ที่กำหนด", type: "check", status: null, value: "", note: "" },
    { id: "c3", task: "ตรวจสอบสายพาน สายไฟ และจุดเชื่อมต่อ", type: "check", status: null, value: "", note: "" },
  ];
  if (frequencyType === "daily" || frequencyType === "weekly") {
    return [
      ...base,
      { id: "c4", task: "ทำความสะอาดและตรวจสอบบริเวณทำงาน", type: "check", status: null, value: "", note: "" },
    ];
  }
  return [
    ...base,
    { id: "c4", task: "ตรวจสอบความแม่นยำของชิ้นส่วนกลไก", type: "check", status: null, value: "", note: "" },
    { id: "c5", task: "บันทึกค่าอุณหภูมิมอเตอร์ (องศาเซลเซียส)", type: "value", status: null, value: "", note: "" },
    { id: "c6", task: "ตรวจสอบระบบความปลอดภัยและป้ายเตือน", type: "check", status: null, value: "", note: "" },
  ];
}

export default function PMChecksheetPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<{ value: string; label: string; raw: any }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [assetName, setAssetName] = useState("");
  const [checklist, setChecklist] = useState<CheckItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const { showToast } = useToast();
  // QR scan prefill: ?asset_code= / ?plan_id=
  const qrPrefillRef = useRef<{ assetCode?: string; planId?: string } | null>(null);

  // ผู้ทำรายการ = ผู้ใช้ที่ login จริง (จาก session)
  useEffect(() => {
    fetch("/api/v1/menu_permissions.php", { headers: { "ngrok-skip-browser-warning": "1" } })
      .then((res) => res.json())
      .then((json) => {
        if (json?.user?.id) setCurrentUserId(Number(json.user.id));
      })
      .catch(() => { /* offline */ });
  }, []);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const assetCode = p.get("asset_code")?.trim().toUpperCase();
      const planId = p.get("plan_id")?.trim();
      if (assetCode || planId) qrPrefillRef.current = { assetCode, planId };
    } catch { /* ignore */ }
  }, []);

  const fetchPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/pm_am.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const open = json.filter((p: any) => p.status === "pending" || p.status === "in_progress");

        // ถ้ามาจาก QR: filter เฉพาะเครื่องที่สแกน หรือเลือกแผนตรงตาม plan_id
        let list = open;
        const prefill = qrPrefillRef.current;
        if (prefill?.planId) {
          list = open.filter((p: any) => String(p.id) === prefill.planId);
        } else if (prefill?.assetCode) {
          try {
            const assetRes = await fetch("/api/v1/index.php?resource=assets", { headers: { "ngrok-skip-browser-warning": "1" } });
            const assetJson = await assetRes.json();
            const asset = (assetJson.data || []).find((a: any) => a.code === prefill.assetCode);
            if (asset) {
              list = open.filter((p: any) => Number(p.asset_id) === Number(asset.id));
              if (list.length > 0) {
                // เลือกแผนแรกของเครื่องนั้นอัตโนมัติ (ไม่รอ state plans)
                setSelectedPlanId(String(list[0].id));
                applyPlan(list[0]);
              }
            }
          } catch { /* ignore */ }
        }

        setPlans(
          list.map((p: any) => ({
            value: String(p.id),
            label: `${p.title || `แผน PM #${p.id}`}${p.due_date ? ` (ครบกำหนด ${p.due_date})` : ""}`,
            raw: p,
          }))
        );
        if (list.length === 0 && prefill?.assetCode) {
          setError(`เครื่อง ${prefill.assetCode} ไม่มีแผน PM ที่รอดำเนินการ (pending / in_progress)`);
        }
      }
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดแผน PM ได้ กรุณาลองใหม่อีกครั้ง");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const applyPlan = async (plan: any) => {
    setSelectedPlan(plan);
    try {
      // หาชื่อเครื่องจักรจาก assets
      const assetRes = await fetch("/api/v1/index.php?resource=assets", { headers: { "ngrok-skip-browser-warning": "1" } });
      const assetJson = await assetRes.json();
      const asset = (assetJson.data || []).find((a: any) => a.id === plan.asset_id);
      setAssetName(asset ? `${asset.name}${asset.code ? ` (${asset.code})` : ""}` : "ไม่ระบุ");

      // ใช้ checklist จาก DB (JSON) หรือสร้าง default
      let items: CheckItem[] = [];
      if (plan.checklist) {
        try {
          const parsed = typeof plan.checklist === "string" ? JSON.parse(plan.checklist) : plan.checklist;
          if (Array.isArray(parsed)) {
            items = parsed.map((t: any, i: number) => ({
              id: t.id || `c${i + 1}`,
              task: typeof t === "string" ? t : t.task,
              type: t.type === "value" ? "value" : "check",
              status: null,
              value: "",
              note: "",
            }));
          }
        } catch (e) { /* fall through */ }
      }
      if (items.length === 0) items = defaultChecklist(plan.frequency_type);
      setChecklist(items);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectPlan = async (value: string) => {
    setSelectedPlanId(value);
    const plan = plans.find((p) => p.value === value)?.raw;
    if (!plan) return;
    await applyPlan(plan);
  };

  const handleCheckAll = () => {
    setChecklist((prev) =>
      prev.map((item) => (item.type === "check" ? { ...item, status: "pass" as const } : item))
    );
  };

  const handleStatus = (id: string, status: "pass" | "fail") => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
  };

  const handleValue = (id: string, value: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, value, status: value ? "pass" as const : null } : item))
    );
  };

  const handleNote = (id: string, note: string) => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, note } : item)));
  };

  const allFilled =
    checklist.length > 0 &&
    checklist.every((item) => (item.type === "value" ? item.value.trim() !== "" : item.status !== null));

  const handleSubmit = async () => {
    if (!selectedPlan) return;
    setSubmitting(true);
    setError(null);
    try {
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      const failCount = checklist.filter((i) => i.status === "fail").length;
      const res = await fetch(`/api/v1/pm_am.php?id=${selectedPlan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          completed_at: now,
          last_done_date: now.slice(0, 10),
          completed_by: currentUserId || null,
          checklist: JSON.stringify(
            checklist.map((i) => ({ task: i.task, type: i.type, status: i.status, value: i.value, note: i.note }))
          ),
          notes: failCount > 0 ? `พบรายการไม่ผ่าน ${failCount} รายการ` : "ผ่านทุกรายการ",
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("success", `บันทึกผลการทำ PM ${selectedPlan.title} เรียบร้อยแล้ว`);
        // รีเซ็ตฟอร์ม
        setSelectedPlanId("");
        setSelectedPlan(null);
        setChecklist([]);
        setAssetName("");
        fetchPlans();
      } else {
        setError(json.error || "ไม่สามารถบันทึกผลได้");
      }
    } catch (e) {
      console.error(e);
      setError("เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดแผน PM...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="Error" description={error} isDismissable={false} />}

      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Heading level={2} style={{ color: "#fff" }}>ทำรายการ PM (Checksheet)</Heading>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            เลือกแผน PM แล้วบันทึกผลการตรวจสอบรายการ
          </Text>
        </VStack>
        {plans.length > 0 && (
          <button
            type="button"
            disabled={!selectedPlan}
            onClick={handleCheckAll}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-lg shadow-emerald-900/30 hover:brightness-110 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircleIcon className="w-4 h-4" />
            ผ่านทั้งหมด (ทุกรายการ)
          </button>
        )}
      </div>

      {/* เลือกแผน */}
      <Card padding={4}>
        <Field inputID="pm-plan" label="เลือกแผน PM ที่ต้องการทำเช็คชีท *" isRequired>
          <div style={{ width: "100%", maxWidth: 560 }}>
            <Selector
              label="เลือกแผน PM"
              isLabelHidden
              placeholder={plans.length === 0 ? "ไม่มีแผน PM ที่รอดำเนินการ" : "เลือกแผน PM..."}
              value={selectedPlanId}
              onChange={handleSelectPlan}
              options={plans}
              isDisabled={plans.length === 0}
            />
          </div>
        </Field>
        {plans.length === 0 && (
          <Text type="body" size="sm" color="secondary">ไม่พบแผน PM ที่รอดำเนินการ (pending / in_progress)</Text>
        )}
      </Card>

      {selectedPlan && (
        <div style={{ maxWidth: 860 }}>
          <Card padding={0} style={{ overflow: "hidden" }}>
            {/* หัวแผน */}
            <div style={{ padding: "16px 24px", backgroundColor: "var(--color-muted)", borderBottom: "1px solid var(--color-border)" }}>
              <HStack gap={6} hAlign="between" wrap="wrap">
                <VStack gap={1}>
                  <HStack gap={2} vAlign="center">
                    <Badge label={selectedPlan.frequency_type?.toUpperCase()} variant="info" />
                    <Badge label={selectedPlan.status === "in_progress" ? "กำลังดำเนินการ" : "รอดำเนินการ"} variant="warning" />
                  </HStack>
                  <Text type="body" weight="bold">{selectedPlan.title}</Text>
                  <Text type="body" size="sm" color="secondary">เครื่องจักร: {assetName} {selectedPlan.due_date ? `• ครบกำหนด: ${selectedPlan.due_date}` : ""}</Text>
                </VStack>
                <VStack gap={1} hAlign="end">
                  <Text type="body" size="sm" color="secondary" weight="semibold">ความก้าวหน้า</Text>
                  <Text type="body" weight="bold">{checklist.filter((i) => (i.type === "value" ? i.value.trim() !== "" : i.status !== null)).length} / {checklist.length} ข้อ</Text>
                </VStack>
              </HStack>
            </div>

            {/* รายการตรวจ */}
            <VStack gap={0}>
              {checklist.map((item, index) => {
                const isNg = item.status === "fail";
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: 20,
                      borderBottom: index < checklist.length - 1 ? "1px solid var(--color-border)" : "none",
                      backgroundColor: isNg ? "var(--color-error-wash)" : item.status === "pass" ? "var(--color-success-wash)" : "transparent",
                    }}
                  >
                    <VStack gap={3}>
                      <HStack hAlign="between" vAlign="start" gap={3}>
                        <HStack gap={3} vAlign="start">
                          <div style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: "var(--color-muted)", color: "var(--color-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", flexShrink: 0 }}>
                            {index + 1}
                          </div>
                          <VStack gap={1}>
                            <Text type="body" weight="semibold">{item.task}</Text>
                            {item.type === "value" && (
                              <div style={{ marginTop: 6, width: 200 }}>
                                <TextInput
                                  label="ค่า"
                                  isLabelHidden
                                  placeholder="ระบุค่าตัวเลข..."
                                  value={item.value}
                                  onChange={(v) => handleValue(item.id, v)}
                                />
                              </div>
                            )}
                          </VStack>
                        </HStack>

                        {item.type === "check" && (
                          <HStack gap={2}>
                            <button
                              onClick={() => handleStatus(item.id, "pass")}
                              style={{
                                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10,
                                background: item.status === "pass" ? "linear-gradient(135deg,#059669,#10B981)" : "var(--color-surface)",
                                color: item.status === "pass" ? "#fff" : "var(--color-secondary)",
                                border: `1px solid ${item.status === "pass" ? "transparent" : "var(--color-border)"}`,
                                fontWeight: 600, cursor: "pointer", boxShadow: item.status === "pass" ? "0 4px 12px rgba(5,150,105,0.3)" : "none",
                              }}
                            >
                              <CheckCircleIcon className="w-4 h-4" /> ผ่าน
                            </button>
                            <button
                              onClick={() => handleStatus(item.id, "fail")}
                              style={{
                                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10,
                                background: item.status === "fail" ? "linear-gradient(135deg,#DC2626,#EF4444)" : "var(--color-surface)",
                                color: item.status === "fail" ? "#fff" : "var(--color-secondary)",
                                border: `1px solid ${item.status === "fail" ? "transparent" : "var(--color-border)"}`,
                                fontWeight: 600, cursor: "pointer", boxShadow: item.status === "fail" ? "0 4px 12px rgba(220,38,38,0.3)" : "none",
                              }}
                            >
                              <XCircleIcon className="w-4 h-4" /> ไม่ผ่าน
                            </button>
                          </HStack>
                        )}
                      </HStack>

                      {isNg && (
                        <div style={{ marginLeft: 40, padding: 14, backgroundColor: "var(--color-surface)", borderRadius: 8, border: "1px dashed var(--color-error)" }}>
                          <VStack gap={3}>
                            <HStack gap={2} vAlign="center">
                              <ExclamationTriangleIcon className="w-4 h-4" style={{ color: "var(--color-error)" }} />
                              <Text type="body" weight="semibold" style={{ color: "var(--color-error)" }}>พบความผิดปกติ (NG) — ระบุรายละเอียด</Text>
                            </HStack>
                            <FormLayout>
                              <Field inputID="ng-note" label="สาเหตุที่พบ / หมายเหตุ *">
                                <TextArea
                                  label="สาเหตุที่พบ / หมายเหตุ"
                                  placeholder="อธิบายอาการผิดปกติที่พบ..."
                                  value={item.note}
                                  onChange={(v) => handleNote(item.id, v)}
                                />
                              </Field>
                            </FormLayout>
                          </VStack>
                        </div>
                      )}
                    </VStack>
                  </div>
                );
              })}
            </VStack>

            {/* footer */}
            <div style={{ padding: 20, backgroundColor: "var(--color-muted)", borderTop: "1px solid var(--color-border)" }}>
              <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
                <Text type="body" color="secondary">ตรวจสอบให้ครบทุกข้อก่อนบันทึก</Text>
                <button
                  type="button"
                  disabled={submitting || !allFilled}
                  onClick={handleSubmit}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#0057A8] to-[#1E88E5] shadow-lg shadow-blue-900/30 hover:shadow-xl hover:brightness-110 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ClipboardDocumentCheckIcon className="w-4 h-4" />
                  {submitting ? "กำลังส่งข้อมูล..." : "บันทึกผลการทำ PM"}
                </button>
              </HStack>
            </div>
          </Card>
        </div>
      )}

    </VStack>
  );
}
