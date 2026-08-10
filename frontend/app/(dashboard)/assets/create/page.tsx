"use client";

import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";

const categoryOptions = [
  { value: "pump", label: "ปั๊ม" },
  { value: "compressor", label: "คอมเพรสเซอร์" },
  { value: "motor", label: "มอเตอร์" },
  { value: "heat-exchanger", label: "เครื่องแลกเปลี่ยนความร้อน" },
  { value: "boiler", label: "หม้อไอน้ำ" },
  { value: "conveyor", label: "สายพานลำเลียง" },
  { value: "machine", label: "เครื่องจักร" },
  { value: "electrical", label: "อุปกรณ์ไฟฟ้า" },
];

const departmentOptions = [
  { value: "production", label: "ฝ่ายผลิต" },
  { value: "utilities", label: "ฝ่ายสาธารณูปโภค" },
  { value: "fabrication", label: "ฝ่ายประกอบ" },
  { value: "facility", label: "ฝ่ายอาคาร" },
  { value: "logistics", label: "ฝ่ายคลังสินค้า" },
];

export default function CreateAssetPage() {
  return (
    <VStack gap={6}>
      <Heading level={2}>ลงทะเบียนเครื่องจักรใหม่</Heading>

      <Card padding={6}>
        <Grid columns={2} gap={4}>
          <TextInput label="รหัสทรัพย์สิน *" value="" placeholder="เช่น AST-016"  />
          <TextInput label="ชื่อทรัพย์สิน *" value="" placeholder="เช่น Centrifugal Pump P-102"  />
          <Selector label="หมวดหมู่ *" options={categoryOptions} placeholder="เลือกหมวดหมู่" />
          <Selector label="แผนก *" options={departmentOptions} placeholder="เลือกแผนก" />
          <TextInput label="สถานที่ติดตั้ง" value="" placeholder="เช่น อาคาร A ชั้น 2"  />
          <DateInput label="วันที่ติดตั้ง" />
          <TextInput label="ผู้ผลิต" value="" placeholder="เช่น Grundfos, Siemens"  />
          <TextInput label="รุ่น" value="" placeholder="เช่น CR 32-3"  />
        </Grid>
      </Card>

      <HStack gap={3} hAlign="end">
        <Link href="/assets">
          <Button label="ยกเลิก" variant="secondary" />
        </Link>
        <Button label="บันทึกเครื่องจักร" variant="primary" />
      </HStack>
    </VStack>
  );
}
