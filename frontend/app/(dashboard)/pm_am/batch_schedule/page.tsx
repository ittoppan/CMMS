"use client";

import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/components/ToastProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Layers, Search } from "lucide-react";

interface AssetItem {
  id: string;
  rawId: number;
  name: string;
  code: string;
}

export default function BatchSchedulePage() {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [users, setUsers] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    frequency: "monthly",
    startDate: new Date().toISOString().slice(0, 10),
    assignee: "",
    title: "",
  });

  const [assetSearch, setAssetSearch] = useState("");
  const [selectedAssets, setSelectedAssets] = useState<number[]>([]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [assetRes, userRes] = await Promise.all([
        fetch("/api/v1/index.php?resource=assets"),
        fetch("/api/v1/users.php"),
      ]);
      const assetJson = await assetRes.json();
      const userJson = await userRes.json();
      if (Array.isArray(assetJson.data)) {
        setAssets(
          assetJson.data.map((a: any) => ({
            rawId: a.id,
            id: `a-${a.id}`,
            name: a.name || "",
            code: a.code || "",
          }))
        );
      }
      if (Array.isArray(userJson)) {
        setUsers(
          userJson
            .filter((u: any) => u.is_active !== 0)
            .map((u: any) => ({
              value: String(u.id),
              label: `${u.full_name}${u.role ? ` (${u.role})` : ""}`,
            }))
        );
      }
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดข้อมูลเครื่องจักร / ผู้ใช้ได้");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredAssets = useMemo(() => {
    const q = assetSearch.toLowerCase();
    return assets.filter(
      (a) => !q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)
    );
  }, [assetSearch, assets]);

  const handleToggleAsset = (rawId: number) => {
    setSelectedAssets((prev) =>
      prev.includes(rawId) ? prev.filter((x) => x !== rawId) : [...prev, rawId]
    );
  };

  const handleSelectAll = () => {
    if (selectedAssets.length === filteredAssets.length && filteredAssets.length > 0) {
      setSelectedAssets([]);
    } else {
      setSelectedAssets(filteredAssets.map((a) => a.rawId));
    }
  };

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.startDate || selectedAssets.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      let created = 0;
      for (const assetId of selectedAssets) {
        const res = await fetch("/api/v1/pm_am.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asset_id: assetId,
            assigned_to: formData.assignee ? Number(formData.assignee) : null,
            title: formData.title,
            frequency_type: formData.frequency,
            frequency_interval: 1,
            due_date: formData.startDate,
            status: "pending",
          }),
        });
        const json = await res.json();
        if (json.success) created += 1;
      }
      if (created > 0) {
        showToast("success", `สร้างแผน PM จำนวน ${created} แผน เรียบร้อยแล้ว`);
        setFormData({ frequency: "monthly", startDate: new Date().toISOString().slice(0, 10), assignee: "", title: "" });
        setSelectedAssets([]);
      } else {
        setError("ไม่สามารถสร้างแผน PM ได้ (ไม่มีการบันทึก)");
      }
    } catch (e) {
      console.error(e);
      setError("เกิดข้อผิดพลาดในการสร้างแผน กรุณาลองใหม่");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <Spinner size={28} />
        <span className="text-[var(--cmms-text-secondary)]">กำลังโหลดข้อมูล...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="Error" description={error} />}

      {/* Header */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>PM SCHEDULER · CMMS-TOPPAN</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>สร้างแผน PM แบบกลุ่ม (Batch Scheduling)</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              กำหนดเช็คชีทเดียว ให้หลายเครื่องพร้อมกัน
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            กำหนดเช็คชีทเดียว ให้กับเครื่องจักรหลายๆ ตัวพร้อมกัน
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* คอลัมน์ซ้าย: ข้อมูลแผน */}
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-5">
              <h4 className="font-bold">1. กำหนดแผน PM</h4>
              <div className="space-y-4">
                <Input
                  label="ชื่อแผน PM *"
                  placeholder="เช่น PM ประจำเดือน: ตรวจสอบสายพานลำเลียง"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
                <div className="space-y-1.5">
                  <Label>รอบความถี่ *</Label>
                  <Select value={formData.frequency} onValueChange={(v) => setFormData({ ...formData, frequency: v })}>
                    <SelectTrigger aria-label="รอบความถี่">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">ทุกวัน (Daily)</SelectItem>
                      <SelectItem value="weekly">ทุกสัปดาห์ (Weekly)</SelectItem>
                      <SelectItem value="monthly">ทุกเดือน (Monthly)</SelectItem>
                      <SelectItem value="quarterly">ทุกไตรมาส (Quarterly)</SelectItem>
                      <SelectItem value="yearly">ทุกปี (Yearly)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  label="วันที่เริ่มทำ PM ครั้งแรก *"
                  placeholder="ปปปป-ดด-วว (เช่น 2026-08-01)"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
                <div className="space-y-1.5">
                  <Label>มอบหมายผู้รับผิดชอบ (ไม่บังคับ)</Label>
                  <Select value={formData.assignee || "__none__"} onValueChange={(v) => setFormData({ ...formData, assignee: v === "__none__" ? "" : v })}>
                    <SelectTrigger aria-label="ผู้รับผิดชอบ">
                      <SelectValue placeholder="เลือกช่าง / ทีม..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">เลือกช่าง / ทีม...</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="cmms-kpi-card blue">
            <CardContent className="flex items-start gap-3 p-5">
              <div className="cmms-icon-tile h-10 w-10 rounded-xl">
                <Layers size={20} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold">ข้อมูลสรุป</p>
                <p className="text-sm text-[var(--cmms-text-secondary)]">
                  ระบบจะสร้างแผน PM จำนวน <strong className="cmms-kpi-value">{selectedAssets.length}</strong> แผน
                  (รอบ {formData.frequency}) เริ่มครั้งแรกวันที่ {formData.startDate || "-"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* คอลัมน์ขวา: เลือกเครื่องจักร */}
        <div className="space-y-4">
          <Card className="flex max-h-[560px] flex-col">
            <CardContent className="flex min-h-0 flex-1 flex-col p-5">
              <h4 className="mb-4 font-bold">2. เลือกเครื่องจักร (Select Assets)</h4>

              <div className="relative">
                <Search size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cmms-text-muted)]" />
                <Input
                  label="ค้นหาเครื่องจักร"
                  isLabelHidden
                  placeholder="ค้นหารหัส หรือชื่อเครื่องจักร..."
                  value={assetSearch}
                  onChange={(e) => setAssetSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="mb-2 mt-4 flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--cmms-border)" }}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    id="select-all"
                    type="checkbox"
                    aria-label="เลือกทั้งหมด"
                    checked={selectedAssets.length === filteredAssets.length && filteredAssets.length > 0}
                    onChange={handleSelectAll}
                    className="h-4 w-4 accent-[var(--cmms-primary)]"
                  />
                  <span className="text-sm font-semibold">เลือกทั้งหมด</span>
                </label>
                <span className="text-sm text-[var(--cmms-text-secondary)]">เลือกแล้ว {selectedAssets.length} รายการ</span>
              </div>

              <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
                <div className="space-y-2">
                  {filteredAssets.map((asset) => (
                    <label
                      key={asset.rawId}
                      className="flex cursor-pointer items-center gap-3 rounded-md border p-3"
                      style={{
                        backgroundColor: selectedAssets.includes(asset.rawId) ? "var(--cmms-primary-wash)" : "var(--cmms-bg-card)",
                        borderColor: selectedAssets.includes(asset.rawId) ? "var(--cmms-primary)" : "var(--cmms-border)",
                      }}
                    >
                      <input
                        type="checkbox"
                        aria-label={asset.code}
                        checked={selectedAssets.includes(asset.rawId)}
                        onChange={() => handleToggleAsset(asset.rawId)}
                        className="h-4 w-4 accent-[var(--cmms-primary)]"
                      />
                      <div>
                        <p className="font-semibold">{asset.code}</p>
                        <p className="text-sm text-[var(--cmms-text-secondary)]">{asset.name}</p>
                      </div>
                    </label>
                  ))}
                  {filteredAssets.length === 0 && (
                    <p className="mt-6 text-center text-[var(--cmms-text-secondary)]">
                      ไม่พบเครื่องจักรที่ค้นหา
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t pt-6" style={{ borderColor: "var(--cmms-border)" }}>
        <Button
          variant="secondary"
          onClick={() => {
            setFormData({ frequency: "monthly", startDate: new Date().toISOString().slice(0, 10), assignee: "", title: "" });
            setSelectedAssets([]);
          }}
        >
          ล้างฟอร์ม
        </Button>
        <Button
          disabled={submitting || !formData.title.trim() || !formData.startDate || selectedAssets.length === 0}
          onClick={handleSubmit}
        >
          <Layers size={16} strokeWidth={1.75} aria-hidden="true" />
          {submitting ? "กำลังสร้างแผน..." : "ยืนยันการสร้างแผนแบบกลุ่ม"}
        </Button>
      </div>

    </div>
  );
}
