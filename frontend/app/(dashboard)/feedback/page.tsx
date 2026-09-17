"use client";

import { useState, useEffect, useCallback } from "react";
import { VStack, HStack } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PageShell } from "@/components/PageShell";

interface FeedbackItem {
  id: number;
  user_name: string | null;
  module: string | null;
  screen: string | null;
  category: string;
  description: string;
  priority: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  bug: "บั๊ก / ผิดปกติ",
  ux: "ใช้งานยาก",
  slow: "ช้า",
  missing_function: "อยากได้ฟีเจอร์เพิ่ม",
  incorrect_data: "ข้อมูลไม่ถูกต้อง",
  training: "ต้องการคู่มือ/อบรม",
  enhancement: "พัฒนาฟีเจอร์เดิม",
  other: "อื่น ๆ",
};

const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่",
  triaged: "รอพิจารณา",
  in_progress: "กำลังดำเนินการ",
  resolved: "แก้ไขแล้ว",
  rejected: "ไม่ดำเนินการ",
};

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  new: { background: "var(--cmms-info-light, #dbeafe)", color: "var(--cmms-info-dark, #1d4ed8)" },
  triaged: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  in_progress: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  resolved: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  rejected: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
};

export default function FeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [scope, setScope] = useState<"own" | "all">("own");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("medium");
  const [module, setModule] = useState("");
  const [screen, setScreen] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/feedback.php", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json?.success) {
        setItems(Array.isArray(json.data) ? json.data : []);
        setScope(json.scope === "all" ? "all" : "own");
      } else {
        setError(json?.error || "โหลดฟีดแบ็กไม่สำเร็จ");
      }
    } catch {
      setError("ไม่สามารถติดต่อ API ได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const submit = async () => {
    if (description.trim().length < 5) {
      setNotice("กรุณากรอกรายละเอียดอย่างน้อย 5 ตัวอักษร");
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/feedback.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, priority, module, screen, description }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setNotice("ส่งฟีดแบ็กเรียบร้อย — ขอบคุณสำหรับคำแนะนำ!");
        setDescription("");
        setModule("");
        setScreen("");
        await fetchList();
      } else {
        setNotice(json?.error || "ส่งไม่สำเร็จ");
      }
    } catch {
      setNotice("ติดต่อ API ไม่ได้");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: number, status: string) => {
    setNotice(null);
    try {
      const res = await fetch("/api/v1/feedback.php", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      setNotice(json?.success !== undefined ? "อัปเดตสถานะเรียบร้อย" : json?.error || "อัปเดตไม่สำเร็จ");
      await fetchList();
    } catch {
      setNotice("ติดต่อ API ไม่ได้");
    }
  };

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">USER FEEDBACK · PHASE 22</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ส่งความคิดเห็น / แจ้งปัญหา" }]}
      title="Feedback & Issues"
      description={scope === "all" ? "ฟีดแบ็กทั้งหมด — admin ปรับสถานะได้" : "แจ้งปัญหาและเสนอความคิดเห็น — ผู้ดูแลระบบจะนำไปพิจารณาในการปรับปรุง"}
    >
      <VStack gap={6}>
        {error && <Alert variant="danger" title="เกิดข้อผิดพลาด">{error}</Alert>}
        {notice && <Alert variant="info" title="ผลลัพธ์">{notice}</Alert>}

        <Card>
          <CardContent className="p-5">
            <VStack gap={4}>
              <h3 className="m-0 text-base font-semibold">ส่งฟีดแบ็กใหม่</h3>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-sm">
                  <span className="mb-1 block font-medium">ประเภท</span>
                  <select
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">ความสำคัญ</span>
                  <select
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="low">ต่ำ</option>
                    <option value="medium">ปานกลาง</option>
                    <option value="high">สูง</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">ส่วนของระบบ</span>
                  <input
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder="เช่น งานซ่อม, PM, อะไหล่"
                    value={module}
                    onChange={(e) => setModule(e.target.value)}
                  />
                </label>
              </div>

              <label className="text-sm">
                <span className="mb-1 block font-medium">หน้า/จุดที่เจอ (ไม่บังคับ)</span>
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="เช่น หน้าแจ้งซ่อม"
                  value={screen}
                  onChange={(e) => setScreen(e.target.value)}
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium">รายละเอียด</span>
                <textarea
                  className="min-h-[110px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="อธิบายปัญหา / สิ่งที่อยากให้ปรับปรุง..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>

              <HStack hAlign="end">
                <Button disabled={submitting} onClick={submit}>
                  {submitting ? "กำลังส่ง..." : "ส่งฟีดแบ็ก"}
                </Button>
              </HStack>
            </VStack>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <HStack hAlign="between" vAlign="center" gap={3}>
              <h3 className="m-0 text-base font-semibold">รายการฟีดแบ็ก ({scope === "all" ? "ทั้งหมด" : "ของฉัน"})</h3>
              <Button variant="secondary" size="sm" onClick={fetchList}>
                รีเฟรช
              </Button>
            </HStack>

            {loading && items.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">กำลังโหลด...</p>
            ) : items.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">ยังไม่มีฟีดแบ็ก</p>
            ) : (
              <VStack gap={3}>
                {items.map((f) => (
                  <div key={f.id} className="rounded-lg border border-border p-4">
                    <HStack hAlign="between" vAlign="start" gap={3}>
                      <VStack gap={1}>
                        <HStack gap={2} vAlign="center">
                          <span className="text-sm font-semibold">{CATEGORY_LABEL[f.category] || f.category}</span>
                          <span className="cmms-andon-chip" style={STATUS_STYLE[f.status] || undefined}>
                            {STATUS_LABEL[f.status] || f.status}
                          </span>
                          {f.priority === "high" && (
                            <span className="cmms-andon-chip" style={{ background: "var(--cmms-danger-light, #fee2e2)", color: "var(--cmms-danger-dark, #b91c1c)" }}>
                              เร่งด่วน
                            </span>
                          )}
                        </HStack>
                        <p className="text-sm">{f.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.user_name || "ผู้ใช้"} · {f.created_at || ""}
                          {f.module ? " · " + f.module : ""}
                          {f.screen ? " · หน้า " + f.screen : ""}
                        </p>
                      </VStack>
                      {scope === "all" && (
                        <select
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                          value={f.status}
                          onChange={(e) => updateStatus(f.id, e.target.value)}
                        >
                          {Object.entries(STATUS_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      )}
                    </HStack>
                  </div>
                ))}
              </VStack>
            )}
          </CardContent>
        </Card>
      </VStack>
    </PageShell>
  );
}