"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Switch } from "@astryxdesign/core/Switch";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import SuccessDialog from "@/components/SuccessDialog";

type ISODate = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

export default function PMCreatePage() {
  const router = useRouter();
  
  const [assets, setAssets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [teamMembers, setTeamMembers] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [isOutsource, setIsOutsource] = useState(false);
  const [outsourceBy, setOutsourceBy] = useState("");
  const [costOutsource, setCostOutsource] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<ISODate | undefined>(undefined);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch("/api/v1/asset_registry.php")
      .then(res => res.json())
      .then(json => {
        if (Array.isArray(json)) {
          setAssets(json);
        }
      })
      .catch(e => console.error("Failed to load assets", e));

    // ผู้รับผิดชอบ = ผู้ใช้งานที่ active (ช่าง/ผู้ดูแล) — ข้อมูลจริงจาก users
    fetch("/api/v1/index.php?resource=users")
      .then(res => res.json())
      .then(json => {
        const list = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
        setUsers(list.filter((u: any) => u.is_active !== 0 && u.is_active !== "0"));
      })
      .catch(e => console.error("Failed to load users", e));
  }, []);

  const handleSubmit = async () => {
    if (!title || !assetId) {
      setError("กรุณาระบุชื่อแผนงาน และเลือกเครื่องจักร");
      return;
    }
    if (!assignedTo) {
      setError("กรุณาเลือกผู้รับผิดชอบ (ช่างที่จะไปทำ PM หน้างาน)");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/pm_am.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          asset_id: assetId,
          assigned_to: assignedTo ? Number(assignedTo) : null,
          team_ids: teamMembers,
          frequency_type: frequency,
          frequency_interval: 1,
          due_date: dueDate || null,
          status: "pending",
          is_outsource: isOutsource ? 1 : 0,
          outsource_by: isOutsource && outsourceBy.trim() ? outsourceBy.trim() : null,
          cost_outsource: isOutsource ? (Number(costOutsource) || 0) : 0
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการบันทึกแผน PM");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title="สร้างแผน PM สำเร็จ!"
        message={<>แผนซ่อมบำรุง <strong>{title}</strong> ถูกเพิ่มเข้าตารางเรียบร้อยแล้ว</>}
        primaryLabel="กลับไปหน้าตาราง PM"
        onPrimary={() => router.push("/pm_am")}
        onBackdrop={() => router.push("/pm_am")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>PM PLAN · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>สร้างแผนบำรุงรักษาเครื่องจักร</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              PM Plan
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            กำหนดแผนบำรุงรักษาเชิงป้องกัน (Preventive Maintenance) สำหรับเครื่องจักร
          </Text>
        </VStack>
      </div>

      <Card padding={6}>
        <VStack gap={5} style={{ maxWidth: 640 }}>
          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--cmms-danger-light)', color: 'var(--cmms-danger)', fontSize: '0.85rem', fontWeight: 600 }}>
              {error}
            </div>
          )}

          <TextInput label="ชื่องาน PM *"
            placeholder="เช่น ตรวจเช็คสายพานมอเตอร์ประจำเดือน"
            value={title}
            onChange={setTitle}  />

          <Selector
            label="เครื่องจักรเป้าหมาย *"
            placeholder="เลือกเครื่องจักร..."
            value={assetId}
            onChange={setAssetId}
            options={assets.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          />

          <Selector
            label="ผู้รับผิดชอบ (ช่าง) *"
            placeholder="เลือกช่างที่รับผิดชอบงาน PM นี้..."
            value={assignedTo}
            onChange={setAssignedTo}
            options={users.map(u => ({ value: String(u.id), label: `${u.full_name || u.username || `#${u.id}`}${u.employee_code ? ` (${u.employee_code})` : ""}` }))}
          />

          <VStack gap={1}>
            <Text type="body" weight="bold">ทีมผู้ปฏิบัติงาน (เลือกเพิ่มได้หลายคน)</Text>
            <Text type="body" size="sm" color="secondary">ช่างที่เลือกจะเห็นงาน PM นี้ใน "งานของฉัน" — ไม่บังคับ</Text>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6, maxHeight: 180, overflowY: "auto", border: "1px solid var(--cmms-border)", borderRadius: 10, padding: 8 }}>
              {users
                .filter(u => String(u.id) !== assignedTo)
                .map(u => {
                  const tid = Number(u.id);
                  const checked = teamMembers.includes(tid);
                  return (
                    <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, cursor: "pointer", background: checked ? "var(--cmms-primary-wash)" : "transparent" }}>
                      <input type="checkbox" checked={checked} onChange={() => setTeamMembers(prev => checked ? prev.filter(x => x !== tid) : [...prev, tid])} />
                      <Text type="body" size="sm" weight={checked ? "semibold" : undefined}>{u.full_name || u.username || `#${u.id}`}</Text>
                    </label>
                  );
                })}
            </div>
          </VStack>
          
          <Selector
            label="รอบความถี่ *"
            placeholder="เลือกรอบความถี่"
            value={frequency}
            onChange={setFrequency}
            options={[
              { value: "daily", label: "รายวัน" },
              { value: "weekly", label: "รายสัปดาห์" },
              { value: "monthly", label: "รายเดือน" },
              { value: "quarterly", label: "ทุก 3 เดือน" },
              { value: "yearly", label: "รายปี" },
            ]}
          />

          <HStack gap={3} vAlign="center" wrap="wrap">
            <Switch
              label="งานภายนอก (Outsource)"
              value={isOutsource}
              onChange={setIsOutsource}
            />
            <Text type="body" size="sm" color="secondary">เปิดเมื่อจ้างบริษัท/ผู้รับเหมาภายนอกมาทำ PM (เช่น ผู้ผลิตเครื่องจักร)</Text>
          </HStack>

          {isOutsource && (
            <VStack gap={3} style={{ padding: 16, borderRadius: 10, border: "1px solid var(--cmms-border)", background: "var(--cmms-bg-wash)" }}>
              <TextInput
                label="ชื่อบริษัท/ผู้รับเหมา *"
                placeholder="เช่น บริษัท ไฮโดรเทสต์ จำกัด"
                value={outsourceBy}
                onChange={setOutsourceBy}
              />
              <VStack gap={1}>
                <Text type="body" size="sm" weight="semibold">ค่าใช้จ่าย (บาท)</Text>
                <input
                  type="number"
                  min={0}
                  placeholder="เช่น 25000"
                  value={costOutsource}
                  onChange={(e) => setCostOutsource(e.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--cmms-border)", fontSize: 14, width: "100%", boxSizing: "border-box", background: "var(--cmms-bg-card)" }}
                />
              </VStack>
            </VStack>
          )}
          
          <TextArea
            label="รายละเอียดวิธีตรวจเช็ค"
            placeholder="อธิบายขั้นตอนการตรวจเช็คที่ต้องทำ..."
            value={description}
            onChange={setDescription}
          />

          <DateInput
            label="กำหนดการทำครั้งแรก"
            value={dueDate}
            onChange={setDueDate}
          />

          <HStack gap={3} hAlign="end">
            <button
              type="button"
              onClick={() => router.push("/pm_am")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-[var(--cmms-text-secondary)] bg-[var(--cmms-bg-muted)] hover:bg-[var(--cmms-bg-wash)] border border-[var(--cmms-border)] transition-all duration-300"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "กำลังบันทึก..." : "บันทึกแผนงาน"}
            </button>
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}
