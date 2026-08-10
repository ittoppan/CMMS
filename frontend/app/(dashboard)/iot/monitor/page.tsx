"use client";

import { useState, useEffect } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Icon } from "@astryxdesign/core/Icon";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Grid } from "@astryxdesign/core/Grid";
import { 
  BoltIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  WrenchScrewdriverIcon,
  SparklesIcon
} from "@heroicons/react/24/outline";

interface IoTSensorNode {
  id: string;
  asset: string;
  sensorType: string;
  currentValue: string;
  unit: string;
  normalRange: string;
  status: "normal" | "warning" | "critical";
  lastUpdate: string;
}

const mockSensors: IoTSensorNode[] = [
  { id: "IOT-VB-01", asset: "Extruder Motor Bearings", sensorType: "Vibration (ความสั่นสะเทือน)", currentValue: "4.8", unit: "mm/s RMS", normalRange: "< 3.5 mm/s", status: "warning", lastUpdate: "เมื่อครู่นี้ (10 วิ)" },
  { id: "IOT-TP-02", asset: "Compressor #2 Discharge", sensorType: "Temperature (อุณหภูมิ)", currentValue: "89.4", unit: "°C", normalRange: "< 75 °C", status: "critical", lastUpdate: "เมื่อครู่นี้ (5 วิ)" },
  { id: "IOT-EC-03", asset: "Flexo Machine Main Drive", sensorType: "Current (กระแสไฟฟ้า)", currentValue: "142.5", unit: "A", normalRange: "120 - 150 A", status: "normal", lastUpdate: "เมื่อครู่นี้ (2 วิ)" },
  { id: "IOT-PR-04", asset: "Hydraulic Pump Station", sensorType: "Pressure (แรงดันไฮดรอลิก)", currentValue: "185.0", unit: "Bar", normalRange: "180 - 200 Bar", status: "normal", lastUpdate: "เมื่อครู่นี้ (8 วิ)" },
];

export default function IotMonitorPage() {
  const [sensors, setSensors] = useState<IoTSensorNode[]>(mockSensors);

  useEffect(() => {
    fetch("/api/v1/index.php?resource=iot-devices")
      .then(res => res.json())
      .then(json => {
        if (json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
          const fetched: IoTSensorNode[] = json.data.map((row: any) => {
            const isAlarm = row.status === "alarm";
            return {
              id: row.device_code || `IOT-${row.id}`,
              asset: row.asset_name || row.asset_code || `เครื่องจักร #${row.asset_id}`,
              sensorType: row.sensor_name || "IoT Sensor",
              currentValue: isAlarm ? "4.8" : "2.1",
              unit: row.vibration_threshold ? "mm/s RMS" : "°C",
              normalRange: `< ${row.vibration_threshold || row.temp_threshold || 4.5}`,
              status: isAlarm ? "warning" : "normal",
              lastUpdate: row.last_ping ? row.last_ping.split(" ")[1] : "เมื่อครู่นี้"
            };
          });
          setSensors(fetched);
        }
      })
      .catch(e => console.error("Fetch iot-devices error:", e));
  }, []);

  return (
    <VStack gap={6}>
      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>มอนิเตอร์เซนเซอร์ IoT และการบำรุงรักษาเชิงคาดการณ์ด้วย AI</Heading>
            <Badge label="สตรีมสด" variant="error" icon={<Icon icon={BoltIcon} size="sm" />} />
          </HStack>
          <Text type="body" color="secondary">เฝ้าระวังและตรวจติดตามสภาวะเครื่องจักรแบบเรียลไทม์ผ่าน IoT Sensors และ AI คาดการณ์ล่วงหน้า</Text>
        </VStack>
        <Button label="ตั้งค่า Threshold" variant="secondary" />
      </HStack>

      {/* Alert Banner เมื่อมีค่าผิดปกติ */}
      <Card padding={4} style={{ backgroundColor: 'var(--color-error-wash)', border: '1px solid var(--color-error)' }}>
        <HStack hAlign="between" vAlign="center">
           <HStack gap={3} vAlign="center">
             <Icon icon={ExclamationTriangleIcon} color="error" size="md" />
             <VStack gap={0}>
               <Text type="body" weight="bold" style={{ color: "var(--color-error)" }}>ตรวจพบความร้อนสูงผิดปกติ (แจ้งเตือนวิกฤต)</Text>
               <Text type="body" size="sm">IOT-TP-02 (Compressor #2) อุณหภูมิ 89.4 °C สูงกว่าเกณฑ์ 75 °C</Text>
             </VStack>
           </HStack>
           <Button label="เปิดใบแจ้งซ่อมด่วน (AI Auto Create)" variant="primary" icon={<Icon icon={WrenchScrewdriverIcon} size="sm" />} />
        </HStack>
      </Card>

      <Grid columns={2} gap={6}>
         {sensors.map((sensor) => (
           <Card key={sensor.id} padding={5} style={{ borderLeft: `4px solid ${sensor.status === 'critical' ? 'var(--color-error)' : sensor.status === 'warning' ? 'var(--color-warning)' : 'var(--color-success)'}` }}>
              <VStack gap={4}>
                 <HStack hAlign="between" vAlign="start">
                    <VStack gap={1}>
                       <HStack gap={2} vAlign="center">
                          <Text type="body" weight="bold">{sensor.id}</Text>
                          <Badge label={sensor.sensorType} variant="neutral" />
                       </HStack>
                       <Heading level={4}>{sensor.asset}</Heading>
                    </VStack>

                    <Badge 
                      variant={sensor.status === 'critical' ? 'error' : sensor.status === 'warning' ? 'warning' : 'success'} 
                      label={sensor.status === 'critical' ? 'วิกฤต' : sensor.status === 'warning' ? 'เตือน' : 'ปกติ'} 
                    />
                 </HStack>

                 <HStack hAlign="between" vAlign="end" style={{ padding: 16, backgroundColor: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                    <VStack gap={0}>
                       <Text type="body" size="sm" color="secondary">ค่าปัจจุบัน</Text>
                       <Heading level={1} style={{ color: sensor.status === 'critical' ? 'var(--color-error)' : sensor.status === 'warning' ? 'var(--color-warning)' : 'var(--color-success)' }}>
                         {sensor.currentValue} <span style={{ fontSize: 16, color: 'var(--color-secondary)' }}>{sensor.unit}</span>
                       </Heading>
                    </VStack>

                    <VStack gap={0} hAlign="end">
                       <Text type="body" size="sm" color="secondary">เกณฑ์ปกติ: {sensor.normalRange}</Text>
                       <Text type="body" size="sm" color="secondary">อัปเดต: {sensor.lastUpdate}</Text>
                    </VStack>
                 </HStack>

                 {sensor.status !== 'normal' && (
                   <HStack gap={2} vAlign="center" style={{ padding: '8px 12px', backgroundColor: 'var(--color-muted)', borderRadius: 6 }}>
                     <Icon icon={SparklesIcon} color="accent" size="sm" />
                     <Text type="body" size="sm">
                        <strong>คำแนะนำ AI:</strong> {sensor.status === 'critical' ? 'ควรทำการหยุดพักเครื่องเพื่อตรวจสอบระบบคูลลิ่งทันที' : 'ควรตรวจสอบการหล่อลื่นและระดับความตึงสายพาน'}
                     </Text>
                   </HStack>
                 )}
              </VStack>
           </Card>
         ))}
      </Grid>
    </VStack>
  );
}
