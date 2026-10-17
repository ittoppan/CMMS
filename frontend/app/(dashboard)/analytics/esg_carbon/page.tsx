"use client";

// analytics/esg_carbon — ESG Carbon Tracking (port จาก analytics/esg_carbot.php)
// downtime hours จุริง  ->  ค่าพลังงานสูญเสีย + CO2 (ค่าคงที่: 45 kW / 0.4999 kg CO2e per kWh)

import { useCallback, useEffect, useState } from "react";
import { Leaf, RefreshCw, Zap, CloudCog } from "lucide-react";
import { usePageHero, t } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const KW_RATING = 45;
const CO2_FACTOR = 0.4999;

export default function EsgCarbonPage() {
  const hero = usePageHero("analytics");
  const [downtimeHours, setDowntimeHours] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/asset_stats.php?resource=energy");
      const json = await res.json();
      setDowntimeHours(Number(json?.downtime_hours) || 0);
    } catch {
      setError("โหลดข้อมูล downtime ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalKwh = Math.round((downtimeHours ?? 0) * KW_RATING * 100) / 100;
  const co2Kg = Math.round(totalKwh * CO2_FACTOR * 100) / 100;
  const co2Ton = Math.round((co2Kg / 1000) * 1000) / 1000;

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "แดชบอร์ด", href: "/dashboard" }, { label: "วิเคราะห์", href: "/analytics" }, { label: "ESG Carbon" }]}
      title="Carbon & Energy Tracking (ISO 14001)"
      description="ประเมินพลังงานสูญเสียจาก downtime การทำงานที่ไม่มีการผลิตและค่าประเมินการปล่อย CO2"
      actions={
        <Button variant="secondary" onClick={fetchData}>
          <RefreshCw className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          {t("action.refresh")}
        </Button>
      }
    >
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">กำลังคำนวณ...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase text-muted-foreground flex items-center gap-2">
                <Zap className="w-4 h-4" aria-hidden="true" /> Downtime รวม (ชม.)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-4 text-center">
              <div className="text-3xl font-black text-primary">{(downtimeHours ?? 0).toLocaleString()}</div>
              <p className="mt-1 text-xs text-muted-foreground">จากงานซ่อมทั้งหมด</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase text-muted-foreground flex items-center gap-2">
                <Zap className="w-4 h-4" aria-hidden="true" /> พลังงานสูญเสีย (kWh)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-4 text-center">
              <div className="text-3xl font-black text-amber-600">{totalKwh.toLocaleString()}</div>
              <p className="mt-1 text-xs text-muted-foreground">กำลังไฟเฉลี่ยเป้าหมายเครื่อง {KW_RATING} kW</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase text-muted-foreground flex items-center gap-2">
                <Leaf className="w-4 h-4" aria-hidden="true" /> CO2 (kg CO2e)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-4 text-center">
              <div className="text-3xl font-black text-emerald-700">{co2Kg.toLocaleString()}</div>
              <p className="mt-1 text-xs text-muted-foreground">Factor {CO2_FACTOR} kg/kWh</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase text-muted-foreground flex items-center gap-2">
                <CloudCog className="w-4 h-4" aria-hidden="true" /> CO2 (ตัน)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-4 text-center">
              <div className="text-3xl font-black text-emerald-700">{co2Ton.toLocaleString()}</div>
              <p className="mt-1 text-xs text-muted-foreground">รายงานในหน่วยตัน CO2e</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="pt-4 text-sm leading-relaxed text-muted-foreground">
          การประเมินนี้ใช้สมมติฐานแบบมาตรฐาน (ตัวเลขที่ไม่มีการอ่านจากมิเตอร์จริง): ตราสารแสดงค่าพลังงานประหลัดจาก
          Downtime Hours × อัตราเฉลี่ย 45 kW แล้วแปลงเป็น CO2e ด้วยค่า emissions factor ของสายการไฟฟ้า
          เพื่อผลลัพธ์แม่นยำขึ้นควรเชื่อมข้อมูลมิเตอร์จริงต่อไปแบบ min-max รายเครื่อง
        </CardContent>
      </Card>
    </PageShell>
  );
}
