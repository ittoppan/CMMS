"use client";

import { useState, useEffect, useCallback } from "react";
import { PageShell } from "@/components/PageShell";
import { HStack, VStack, Grid } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Zap, TriangleAlert, RefreshCw, Cpu } from "lucide-react";

interface IoTSensorNode {
  id: string;
  assetName: string;
  assetCode: string;
  sensorName: string;
  vibrationThreshold: string;
  tempThreshold: string;
  status: "online" | "alarm" | "offline";
  lastPing: string;
}

export default function IotMonitorPage() {
  const [sensors, setSensors] = useState<IoTSensorNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/index.php?resource=iot-devices");
      const json = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        const fetched: IoTSensorNode[] = json.data.map((row: any) => {
          // สถานะจริงจากตาราง iot_devices (online / alarm)
          const rawStatus = String(row.status || "offline").toLowerCase();
          return {
            id: row.device_code || `IOT-${row.id}`,
            assetName: row.asset_name || row.asset_code || `เครื่องจักร #${row.asset_id}`,
            assetCode: row.asset_code || "",
            sensorName: row.sensor_name || "IoT Sensor",
            vibrationThreshold: row.vibration_threshold != null ? String(row.vibration_threshold) : "",
            tempThreshold: row.temp_threshold != null ? String(row.temp_threshold) : "",
            status: rawStatus === "alarm" ? "alarm" : rawStatus === "online" ? "online" : "offline",
            lastPing: row.last_ping ? String(row.last_ping) : "",
          };
        });
        setSensors(fetched);
        setError(null);
      } else {
        setError("ไม่สามารถโหลดข้อมูลเซนเซอร์ได้");
      }
    } catch (e) {
      console.error("Fetch iot-devices error:", e);
      setError("ไม่สามารถเชื่อมต่อระบบได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    // อัปเดตข้อมูลทุก 30 วินาที (ข้อมูลจริงจาก DB)
    const interval = setInterval(fetchDevices, 30000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  const alarmDevices = sensors.filter(s => s.status === "alarm");

  return (
    <PageShell
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "IoT Monitor", href: "/iot/monitor" },
        { label: "มอนิเตอร์เซนเซอร์ IoT" },
      ]}
      title="มอนิเตอร์เซนเซอร์ IoT"
      description="แสดงสถานะเซนเซอร์ IoT จากฐานข้อมูล (อัปเดตทุก 30 วินาที)"
      actions={
        <>
          <Badge variant={alarmDevices.length > 0 ? "danger" : "neutral"}>
            <Zap size={12} strokeWidth={1.75} aria-hidden="true" />
            {loading ? "กำลังโหลด..." : sensors.length > 0 ? `เชื่อมต่อ ${sensors.length} ตัว` : "ไม่มีอุปกรณ์"}
          </Badge>
          <Button variant="secondary" onClick={fetchDevices}>
            <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
            รีเฟรช
          </Button>
        </>
      }
    >
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      {/* Alert Banner — แสดงเฉพาะเมื่อมีอุปกรณ์สถานะ alarm จริงใน DB */}
      {alarmDevices.length > 0 && (
        <Alert
          variant="danger"
          title={`ตรวจพบ ${alarmDevices.length} อุปกรณ์สถานะแจ้งเตือน (Alarm)`}
          description={`${alarmDevices.map(d => d.id).join(", ")} — อยู่ในสถานะ alarm ตามข้อมูลในระบบ`}
        />
      )}

      {loading ? (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      ) : sensors.length === 0 ? (
        <Card>
          <EmptyState
            title="ยังไม่มีอุปกรณ์ IoT ในระบบ"
            description="เมื่อมีการลงทะเบียนเซนเซอร์และบันทึกข้อมูลจริง อุปกรณ์จะแสดงที่นี่"
            icon={<Cpu className="h-8 w-8" strokeWidth={1.75} aria-hidden="true" />}
          />
        </Card>
      ) : (
        <Grid columns={{ minWidth: 340, max: 2 }} gap={6}>
          {sensors.map((sensor) => (
            <Card key={sensor.id} className="p-5">
              <VStack gap={4}>
                <HStack hAlign="between" vAlign="start" wrap="wrap">
                  <VStack gap={1}>
                    <HStack gap={2} vAlign="center">
                      <span className="text-sm font-semibold text-foreground">{sensor.id}</span>
                      <Badge variant="neutral">เซนเซอร์ IoT</Badge>
                    </HStack>
                    <h3 className="text-base font-semibold text-foreground">{sensor.assetName}</h3>
                  </VStack>
                  <Badge variant={sensor.status === "alarm" ? "danger" : "success"} dot>
                    {sensor.status === 'alarm' ? 'แจ้งเตือน (Alarm)' : 'ออนไลน์'}
                  </Badge>
                </HStack>

                <HStack hAlign="between" vAlign="end" wrap="wrap" className="rounded-lg border border-border bg-muted/40 p-4">
                  <VStack gap={0}>
                    <span className="text-sm text-muted-foreground">ประเภทเซนเซอร์</span>
                    <span className="text-sm font-semibold text-foreground">{sensor.sensorName}</span>
                  </VStack>
                  <VStack gap={0} hAlign="end">
                    {sensor.vibrationThreshold && (
                      <span className="text-sm text-muted-foreground">เกณฑ์สั่นสะเทือน: &lt; {sensor.vibrationThreshold} mm/s</span>
                    )}
                    {sensor.tempThreshold && (
                      <span className="text-sm text-muted-foreground">เกณฑ์อุณหภูมิ: &lt; {sensor.tempThreshold} °C</span>
                    )}
                  </VStack>
                </HStack>

                <HStack gap={2} vAlign="center" wrap="wrap">
                  <span className="text-sm text-muted-foreground">
                    อัปเดตล่าสุด: {sensor.lastPing ? sensor.lastPing.slice(0, 16) : "ยังไม่มีข้อมูล"}
                  </span>
                  {sensor.status === "alarm" && (
                    <span className="text-sm font-semibold text-destructive">
                      เกินเกณฑ์ที่ตั้งไว้ — ควรตรวจสอบเครื่องจักร
                    </span>
                  )}
                </HStack>
              </VStack>
            </Card>
          ))}
        </Grid>
      )}
    </PageShell>
  );
}
