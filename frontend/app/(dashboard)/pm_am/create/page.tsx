"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select-native";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import SuccessDialog from "@/components/SuccessDialog";

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
  const [dueDate, setDueDate] = useState("");

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
    <div className="space-y-6">
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>PM PLAN · CMMS-TOPPAN</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>สร้างแผนบำรุงรักษาเครื่องจักร</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              PM Plan
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            กำหนดแผนบำรุงรักษาเชิงป้องกัน (Preventive Maintenance) สำหรับเครื่องจักร
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="max-w-[640px] space-y-5 p-6">
          {error && <Alert variant="danger" description={error} />}

          <Input
            label="ชื่องาน PM *"
            placeholder="เช่น ตรวจเช็คสายพานมอเตอร์ประจำเดือน"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="space-y-1.5">
            <label htmlFor="pm-create-asset" className="text-sm font-medium text-[var(--cmms-text-primary)]">เครื่องจักรเป้าหมาย *</label>
            <Select
              id="pm-create-asset"
              aria-label="เครื่องจักรเป้าหมาย"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
            >
              <option value="">เลือกเครื่องจักร...</option>
              {assets.map(a => (
                <option key={a.id} value={String(a.id)}>{`${a.code} - ${a.name}`}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pm-create-assignee" className="text-sm font-medium text-[var(--cmms-text-primary)]">ผู้รับผิดชอบ (ช่าง) *</label>
            <Select
              id="pm-create-assignee"
              aria-label="ผู้รับผิดชอบ"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
            >
              <option value="">เลือกช่างที่รับผิดชอบงาน PM นี้...</option>
              {users.map(u => (
                <option key={u.id} value={String(u.id)}>{`${u.full_name || u.username || `#${u.id}`}${u.employee_code ? ` (${u.employee_code})` : ""}`}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <p className="font-bold">ทีมผู้ปฏิบัติงาน (เลือกเพิ่มได้หลายคน)</p>
            <p className="text-sm text-[var(--cmms-text-secondary)]">ช่างที่เลือกจะเห็นงาน PM นี้ใน &quot;งานของฉัน&quot; — ไม่บังคับ</p>
            <div className="grid max-h-[180px] gap-1.5 overflow-y-auto rounded-[10px] border p-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", borderColor: "var(--cmms-border)" }}>
              {users
                .filter(u => String(u.id) !== assignedTo)
                .map(u => {
                  const tid = Number(u.id);
                  const checked = teamMembers.includes(tid);
                  return (
                    <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: checked ? "var(--cmms-primary-wash)" : "transparent" }}>
                      <input type="checkbox" checked={checked} onChange={() => setTeamMembers(prev => checked ? prev.filter(x => x !== tid) : [...prev, tid])} />
                      <span className={`text-sm ${checked ? "font-semibold" : ""}`}>{u.full_name || u.username || `#${u.id}`}</span>
                    </label>
                  );
                })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pm-create-frequency" className="text-sm font-medium text-[var(--cmms-text-primary)]">รอบความถี่ *</label>
            <Select
              id="pm-create-frequency"
              aria-label="รอบความถี่"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            >
              <option value="daily">รายวัน</option>
              <option value="weekly">รายสัปดาห์</option>
              <option value="monthly">รายเดือน</option>
              <option value="quarterly">ทุก 3 เดือน</option>
              <option value="yearly">รายปี</option>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={isOutsource}
                onChange={(e) => setIsOutsource(e.target.checked)}
                className="h-4 w-4 accent-[var(--cmms-primary)]"
              />
              <span className="text-sm font-semibold">งานภายนอก (Outsource)</span>
            </label>
            <span className="text-sm text-[var(--cmms-text-secondary)]">เปิดเมื่อจ้างบริษัท/ผู้รับเหมาภายนอกมาทำ PM (เช่น ผู้ผลิตเครื่องจักร)</span>
          </div>

          {isOutsource && (
            <div className="space-y-3 rounded-[10px] border p-4" style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg-wash)" }}>
              <Input
                label="ชื่อบริษัท/ผู้รับเหมา *"
                placeholder="เช่น บริษัท ไฮโดรเทสต์ จำกัด"
                value={outsourceBy}
                onChange={(e) => setOutsourceBy(e.target.value)}
              />
              <Input
                label="ค่าใช้จ่าย (บาท)"
                type="number"
                min={0}
                placeholder="เช่น 25000"
                value={costOutsource}
                onChange={(e) => setCostOutsource(e.target.value)}
              />
            </div>
          )}

          <Textarea
            label="รายละเอียดวิธีตรวจเช็ค"
            placeholder="อธิบายขั้นตอนการตรวจเช็คที่ต้องทำ..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <Input
            label="กำหนดการทำครั้งแรก"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => router.push("/pm_am")}>
              ยกเลิก
            </Button>
            <Button disabled={loading} onClick={handleSubmit}>
              {loading ? "กำลังบันทึก..." : "บันทึกแผนงาน"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
