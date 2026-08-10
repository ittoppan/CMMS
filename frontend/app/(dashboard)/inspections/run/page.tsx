"use client";

import { useState, useEffect, useRef } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import {
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

interface RunItem {
  item_id: number | null;
  task: string;
  type: "check" | "value";
  standard: string;
  min_value: number | null;
  max_value: number | null;
  unit: string;
  status: "pass" | "fail" | null;
  value: string;
  note: string;
  autoFailed?: boolean;
}

export default function InspectionRunPage() {
  const [schedules, setSchedules] = useState<{ value: string; label: string; raw: any }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState("");
  const [schedule, setSchedule] = useState<any>(null);
  const [items, setItems] = useState<RunItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const [createdRepair, setCreatedRepair] = useState<{ repair_id: number | null; message: string } | null>(null);
  const qrPrefillRef = useRef<{ scheduleId?: string; assetCode?: string } | null>(null);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const scheduleId = p.get("schedule_id")?.trim();
      const assetCode = p.get("asset_code")?.trim().toUpperCase();
      if (scheduleId || assetCode) qrPrefillRef.current = { scheduleId, assetCode };
    } catch { /* ignore */ }
  }, []);

  const fetchSchedules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/inspections.php?schedules=1");
      const json = await res.json();
      if (!Array.isArray(json)) return;
      const open = json.filter((s: any) => s.status !== "completed");

      let list = open;
      const prefill = qrPrefillRef.current;
      if (prefill?.scheduleId) {
        list = open.filter((s: any) => String(s.id) === prefill.scheduleId);
      } else if (prefill?.assetCode) {
        list = open.filter((s: any) => String(s.asset_code || "").toUpperCase() === prefill.assetCode);
      }

      setSchedules(list.map((s: any) => ({
        value: String(s.id),
        label: `${s.template_title || `Template #${s.template_id}`} — ${s.asset_name || `เครื่อง #${s.asset_id}`}${s.due_date ? ` (ครบ ${s.due_date})` : ""}`,
        raw: s,
      })));

      if (list.length === 1) {
        setSelectedId(String(list[0].id));
        await loadSchedule(list[0].id);
      } else if (list.length === 0 && prefill?.assetCode) {
        setError(`เครื่อง ${prefill.assetCode} ไม่มีรอบตรวจที่รอดำเนินการ (pending / in_progress)`);
      }
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดรอบตรวจได้");
    }
    setLoading(false);
  };

  useEffect(() => { fetchSchedules(); }, []);

  const loadSchedule = async (id: number | string) => {
    setError(null);
    setCreatedRepair(null);
    try {
      const res = await fetch(`/api/v1/inspections.php?schedule=${id}`);
      const s = await res.json();
      if (!s.id) { setError(s.error || "ไม่พบรอบตรวจ"); return; }
      setSchedule(s);

      // results เดิม (ถ้ามี) สำหรับแสดง
      const old = new Map((s.results || []).map((r: any) => [r.item_id, r]));
      setItems((s.items || []).map((it: any) => {
        const prev = old.get(it.id);
        const isValue = it.type === "value";
        const val = prev?.value || "";
        let autoFailed = false;
        if (isValue && val !== "") {
          const n = parseFloat(val);
          if (!isNaN(n)) {
            if (it.max_value != null && n > parseFloat(it.max_value)) autoFailed = true;
            if (it.min_value != null && n < parseFloat(it.min_value)) autoFailed = true;
          }
        }
        return {
          item_id: it.id,
          task: it.task,
          type: it.type,
          standard: it.standard || "",
          min_value: it.min_value != null ? parseFloat(it.min_value) : null,
          max_value: it.max_value != null ? parseFloat(it.max_value) : null,
          unit: it.unit || "",
          status: prev?.status || (isValue && autoFailed ? "fail" : isValue ? "pass" : null),
          value: val,
          note: prev?.note || "",
          autoFailed,
        };
      }));
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดรายการตรวจได้");
    }
  };

  const handleSelect = async (value: string) => {
    setSelectedId(value);
    await loadSchedule(value);
  };

  const handleStatus = (idx: number, status: "pass" | "fail") => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, status, note: status === "pass" ? "" : it.note } : it)));
  };

  const handleValue = (idx: number, value: string) => {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const n = parseFloat(value);
      let autoFailed = false;
      if (!isNaN(n)) {
        if (it.max_value != null && n > it.max_value) autoFailed = true;
        if (it.min_value != null && n < it.min_value) autoFailed = true;
      }
      return { ...it, value, autoFailed, status: value.trim() === "" ? null : autoFailed ? "fail" : "pass" };
    }));
  };

  const handleNote = (idx: number, note: string) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, note } : it)));
  };

  const allFilled =
    items.length > 0 &&
    items.every((it) => (it.type === "value" ? it.value.trim() !== "" : it.status !== null)) &&
    items.every((it) => (it.status !== "fail" || it.note.trim() !== ""));

  const handleSubmit = async () => {
    if (!schedule) return;
    if (items.some((it) => it.status === "fail" && it.note.trim() === "")) {
      setError("รายการที่ \"ไม่ผ่าน\" ต้องระบุสาเหตุ/รายละเอียดทุกข้อ");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/inspections.php?action=submit&schedule=${schedule.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((it) => ({ item_id: it.item_id, task: it.task, type: it.type, status: it.status === "fail" ? "fail" : "pass", value: it.value, note: it.note })),
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "บันทึกไม่สำเร็จ"); setSubmitting(false); return; }
      setToast(json.message || "บันทึกผลแล้ว");
      setCreatedRepair({ repair_id: json.repair_id, message: json.message });
      if (json.repair_id) {
        setSchedule((s: any) => ({ ...s, status: "completed", result: json.result, fail_count: json.fail_count }));
        setItems((prev) => prev.map((it) => ({ ...it, status: it.status })));
      }
      fetchSchedules();
      setTimeout(() => setToast(""), 4500);
    } catch (e) {
      console.error(e);
      setError("เกิดข้อผิดพลาดในการบันทึก");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดรอบตรวจ...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="Error" description={error} isDismissable={false} />}

      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <Heading level={2}>ทำรายการตรวจเช็ค</Heading>
          <Text type="body" color="secondary">บันทึกผลตรวจรายข้อ — รายการไม่ผ่านจะแจ้งช่างซ่อมทันที</Text>
        </VStack>
      </HStack>

      <Card padding={4}>
        <Field inputID="run-sel" label="เลือกรอบตรวจ *" isRequired>
          <div style={{ width: "100%", maxWidth: 640 }}>
            <Selector
              label="เลือกรอบตรวจ"
              isLabelHidden
              placeholder={schedules.length === 0 ? "ไม่มีรอบตรวจที่รอดำเนินการ" : "เลือกรอบตรวจ..."}
              value={selectedId}
              onChange={handleSelect}
              options={schedules}
              isDisabled={schedules.length === 0}
            />
          </div>
        </Field>
        {schedules.length === 0 && (
          <Text type="body" size="sm" color="secondary">ไม่พบรอบตรวจที่รอดำเนินการ — ไปที่ "ตรวจเช็ครอบ" เพื่อสร้างรอบ</Text>
        )}
      </Card>

      {schedule && (
        <div style={{ maxWidth: 860 }}>
          <Card padding={0} style={{ overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", backgroundColor: "var(--color-muted)", borderBottom: "1px solid var(--color-border)" }}>
              <HStack gap={6} hAlign="between" wrap="wrap">
                <VStack gap={1}>
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Badge label={schedule.template_code || "CHK"} variant="info" />
                    <Badge label={schedule.status === "completed" ? "เสร็จสิ้น" : schedule.status === "in_progress" ? "กำลังทำ" : "รอดำเนินการ"} variant={schedule.status === "completed" ? "success" : "warning"} />
                    {schedule.result && <Badge label={schedule.result === "pass" ? "ผ่านทุกรายการ" : `ไม่ผ่าน ${schedule.fail_count} รายการ`} variant={schedule.result === "pass" ? "success" : "error"} />}
                  </HStack>
                  <Text type="body" weight="bold">{schedule.template_title}</Text>
                  <Text type="body" size="sm" color="secondary">
                    🏭 {schedule.asset_name}{schedule.asset_code ? ` (${schedule.asset_code})` : ""}
                    {schedule.assignee_name ? ` • 👤 ${schedule.assignee_name}` : ""}
                    {schedule.due_date ? ` • ครบกำหนด: ${schedule.due_date}` : ""}
                  </Text>
                </VStack>
                <VStack gap={1} hAlign="end">
                  <Text type="body" size="sm" color="secondary" weight="semibold">ความก้าวหน้า</Text>
                  <Text type="body" weight="bold">{items.filter((i) => (i.type === "value" ? i.value.trim() !== "" : i.status !== null)).length} / {items.length} ข้อ</Text>
                </VStack>
              </HStack>
            </div>

            <VStack gap={0}>
              {items.map((item, index) => {
                const isNg = item.status === "fail";
                return (
                  <div
                    key={item.item_id ?? index}
                    style={{
                      padding: 20,
                      borderBottom: index < items.length - 1 ? "1px solid var(--color-border)" : "none",
                      backgroundColor: isNg ? "var(--color-error-wash)" : item.status === "pass" ? "var(--color-success-wash)" : "transparent",
                    }}
                  >
                    <VStack gap={3}>
                      <HStack hAlign="between" vAlign="start" gap={3} wrap="wrap">
                        <HStack gap={3} vAlign="start" style={{ flex: 1, minWidth: 240 }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: "var(--color-muted)", color: "var(--color-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", flexShrink: 0 }}>
                            {index + 1}
                          </div>
                          <VStack gap={1} style={{ flex: 1 }}>
                            <Text type="body" weight="semibold">{item.task}</Text>
                            {item.type === "value" && (
                              <VStack gap={1} style={{ maxWidth: 300 }}>
                                <TextInput
                                  label="ค่า"
                                  isLabelHidden
                                  placeholder={item.unit ? `ระบุค่า (${item.unit})...` : "ระบุค่าตัวเลข..."}
                                  value={item.value}
                                  onChange={(v) => handleValue(index, v)}
                                />
                                <Text type="body" size="sm" color="secondary">
                                  เกณฑ์: {item.min_value != null ? item.min_value : "-"} — {item.max_value != null ? item.max_value : "-"} {item.unit || ""}{item.standard ? ` (${item.standard})` : ""}
                                  {item.autoFailed && item.value !== "" ? " • เกินเกณฑ์ → ไม่ผ่านอัตโนมัติ" : ""}
                                </Text>
                              </VStack>
                            )}
                          </VStack>
                        </HStack>

                        {item.type === "check" && (
                          <HStack gap={2}>
                            <button
                              onClick={() => handleStatus(index, "pass")}
                              style={{
                                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6,
                                backgroundColor: item.status === "pass" ? "var(--color-success)" : "var(--color-surface)",
                                color: item.status === "pass" ? "#fff" : "var(--color-secondary)",
                                border: `1px solid ${item.status === "pass" ? "var(--color-success)" : "var(--color-border)"}`,
                                fontWeight: 600, cursor: "pointer",
                              }}
                            >
                              <Icon icon={CheckCircleIcon} size="sm" /> ผ่าน
                            </button>
                            <button
                              onClick={() => handleStatus(index, "fail")}
                              style={{
                                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6,
                                backgroundColor: item.status === "fail" ? "var(--color-error)" : "var(--color-surface)",
                                color: item.status === "fail" ? "#fff" : "var(--color-secondary)",
                                border: `1px solid ${item.status === "fail" ? "var(--color-error)" : "var(--color-border)"}`,
                                fontWeight: 600, cursor: "pointer",
                              }}
                            >
                              <Icon icon={XCircleIcon} size="sm" /> ไม่ผ่าน
                            </button>
                          </HStack>
                        )}
                      </HStack>

                      {isNg && (
                        <div style={{ marginLeft: 40, padding: 14, backgroundColor: "var(--color-surface)", borderRadius: 8, border: "1px dashed var(--color-error)" }}>
                          <VStack gap={3}>
                            <HStack gap={2} vAlign="center">
                              <Icon icon={ExclamationTriangleIcon} color="error" size="sm" />
                              <Text type="body" weight="semibold" style={{ color: "var(--color-error)" }}>พบความผิดปกติ (NG) — ระบุรายละเอียด (จำเป็น)</Text>
                            </HStack>
                            <FormLayout>
                              <Field inputID={`ng-note-${index}`} label="สาเหตุที่พบ / หมายเหตุ *">
                                <TextArea
                                  label="สาเหตุที่พบ / หมายเหตุ"
                                  placeholder="อธิบายอาการผิดปกติที่พบ..."
                                  value={item.note}
                                  onChange={(v) => handleNote(index, v)}
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

            <div style={{ padding: 20, backgroundColor: "var(--color-muted)", borderTop: "1px solid var(--color-border)" }}>
              <VStack gap={3}>
                {createdRepair && createdRepair.repair_id && (
                  <div style={{ padding: 14, borderRadius: 8, backgroundColor: "var(--color-error-wash)", border: "1px solid var(--color-error)" }}>
                    <HStack gap={2} vAlign="center">
                      <Icon icon={WrenchScrewdriverIcon} color="error" size="sm" />
                      <Text type="body" weight="semibold" style={{ color: "var(--color-error)" }}>ระบบสร้างใบแจ้งซ่อมอัตโนมัติแล้ว (มีความเสี่ยงเครื่องหยุด)</Text>
                      <Link href="/repair">
                        <Button label="ดูใบแจ้งซ่อม →" variant="primary" size="sm" />
                      </Link>
                    </HStack>
                  </div>
                )}
                <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
                  <Text type="body" color="secondary">ตรวจให้ครบทุกข้อก่อนบันทึก — ข้อที่ไม่ผ่านต้องมีสาเหตุ</Text>
                  {schedule.status !== "completed" ? (
                    <Button
                      label={submitting ? "กำลังส่งข้อมูล..." : "บันทึกผลการตรวจ"}
                      variant="primary"
                      size="lg"
                      isDisabled={submitting || !allFilled}
                      onClick={handleSubmit}
                      icon={<Icon icon={ClipboardDocumentCheckIcon} size="sm" />}
                    />
                  ) : (
                    <Badge label="บันทึกผลแล้ว" variant="success" />
                  )}
                </HStack>
              </VStack>
            </div>
          </Card>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, padding: "12px 20px", backgroundColor: "var(--cmms-success)", color: "#fff", borderRadius: 8, zIndex: 9999, fontWeight: 600, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          {toast}
        </div>
      )}
    </VStack>
  );
}
