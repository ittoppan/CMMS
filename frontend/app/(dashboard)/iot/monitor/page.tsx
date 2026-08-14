"use client";

import { useState, useEffect, useCallback } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { Spinner } from "@astryxdesign/core/Spinner";
import {
  BoltIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  CpuChipIcon,
} from "@heroicons/react/24/outline";

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
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>IOT MONITOR · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>มอนิเตอร์เซนเซอร์ IoT</Heading>
            <span
              className="cmms-andon-chip"
              style={{
                background: alarmDevices.length > 0 ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.12)",
                color: alarmDevices.length > 0 ? "var(--cmms-danger-light)" : "#fff",
              }}
            >
              <BoltIcon className="w-3.5 h-3.5" />
              {loading ? "กำลังโหลด..." : sensors.length > 0 ? `เชื่อมต่อ ${sensors.length} ตัว` : "ไม่มีอุปกรณ์"}
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            แสดงสถานะเซนเซอร์ IoT จากฐานข้อมูล (อัปเดตทุก 30 วินาที)
          </Text>
        </VStack>
        <button
          type="button"
          onClick={fetchDevices}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
        >
          <ArrowPathIcon className="w-4 h-4" />
          รีเฟรช
        </button>
      </div>

      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      {/* Alert Banner — แสดงเฉพาะเมื่อมีอุปกรณ์สถานะ alarm จริงใน DB */}
      {alarmDevices.length > 0 && (
        <Card padding={4} style={{ backgroundColor: 'var(--color-error-wash)', border: '1px solid var(--color-error)' }}>
          <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
            <HStack gap={3} vAlign="center">
              <ExclamationTriangleIcon className="w-5 h-5" style={{ color: "var(--color-error)" }} />
              <VStack gap={0}>
                <Text type="body" weight="bold" style={{ color: "var(--color-error)" }}>
                  ตรวจพบ {alarmDevices.length} อุปกรณ์สถานะแจ้งเตือน (Alarm)
                </Text>
                <Text type="body" size="sm">
                  {alarmDevices.map(d => d.id).join(", ")} — อยู่ในสถานะ alarm ตามข้อมูลในระบบ
                </Text>
              </VStack>
            </HStack>
          </HStack>
        </Card>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spinner />
        </div>
      ) : sensors.length === 0 ? (
        <Card padding={6}>
          <EmptyState
            title="ยังไม่มีอุปกรณ์ IoT ในระบบ"
            description="เมื่อมีการลงทะเบียนเซนเซอร์และบันทึกข้อมูลจริง อุปกรณ์จะแสดงที่นี่"
            icon={<CpuChipIcon className="w-8 h-8" />}
          />
        </Card>
      ) : (
        <Grid columns={{ minWidth: 340, max: 2 }} gap={6}>
          {sensors.map((sensor) => (
            <Card key={sensor.id} padding={5} style={{ borderLeft: `4px solid ${sensor.status === 'alarm' ? 'var(--color-error)' : 'var(--color-success)'}` }}>
              <VStack gap={4}>
                <HStack hAlign="between" vAlign="start" wrap="wrap">
                  <VStack gap={1}>
                    <HStack gap={2} vAlign="center">
                      <Text type="body" weight="bold">{sensor.id}</Text>
                      <span className="cmms-andon-chip" style={{ background: "rgba(100,116,139,0.12)", color: "var(--cmms-text-muted)", fontSize: "0.7rem", padding: "3px 9px" }}>เซนเซอร์ IoT</span>
                    </HStack>
                    <Heading level={4}>{sensor.assetName}</Heading>
                  </VStack>
                  <span
                    className="cmms-andon-chip"
                    style={{
                      background: sensor.status === 'alarm' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                      color: sensor.status === 'alarm' ? 'var(--cmms-danger)' : 'var(--cmms-success)',
                      fontSize: "0.75rem",
                      padding: "4px 10px",
                    }}
                  >
                    {sensor.status === 'alarm' ? 'แจ้งเตือน (Alarm)' : 'ออนไลน์'}
                  </span>
                </HStack>

                <HStack hAlign="between" vAlign="end" style={{ padding: 16, backgroundColor: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                  <VStack gap={0}>
                    <Text type="body" size="sm" color="secondary">ประเภทเซนเซอร์</Text>
                    <Text type="body" weight="bold">{sensor.sensorName}</Text>
                  </VStack>
                  <VStack gap={0} hAlign="end">
                    {sensor.vibrationThreshold && (
                      <Text type="body" size="sm" color="secondary">เกณฑ์สั่นสะเทือน: &lt; {sensor.vibrationThreshold} mm/s</Text>
                    )}
                    {sensor.tempThreshold && (
                      <Text type="body" size="sm" color="secondary">เกณฑ์อุณหภูมิ: &lt; {sensor.tempThreshold} °C</Text>
                    )}
                  </VStack>
                </HStack>

                <HStack gap={2} vAlign="center">
                  <Text type="body" size="sm" color="secondary">
                    อัปเดตล่าสุด: {sensor.lastPing ? sensor.lastPing.slice(0, 16) : "ยังไม่มีข้อมูล"}
                  </Text>
                  {sensor.status === "alarm" && (
                    <Text type="body" size="sm" style={{ color: 'var(--color-error)', fontWeight: 600 }}>
                      เกินเกณฑ์ที่ตั้งไว้ — ควรตรวจสอบเครื่องจักร
                    </Text>
                  )}
                </HStack>
              </VStack>
            </Card>
          ))}
        </Grid>
      )}
    </VStack>
  );
}
