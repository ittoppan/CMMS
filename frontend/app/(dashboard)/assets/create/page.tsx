"use client";

import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import { PlusIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";

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
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>ASSETS CREATE · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>ลงทะเบียนเครื่องจักรใหม่</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ClipboardDocumentIcon className="w-3.5 h-3.5" /> ฟอร์มลงทะเบียน
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            กรอกข้อมูลเครื่องจักร/ทรัพย์สินใหม่เข้าระบบทะเบียน CMMS-TOPPAN
          </Text>
        </VStack>
        <a href="/assets" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300">
          <PlusIcon className="w-4 h-4" />
          กลับรายการ
        </a>
      </div>

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
        <a href="/assets" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300">
          ยกเลิก
        </a>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#0057A8] to-[#1E88E5] shadow-lg shadow-blue-900/30 hover:shadow-xl hover:brightness-110 transition-all duration-300"
        >
          <PlusIcon className="w-4 h-4" />
          บันทึกเครื่องจักร
        </button>
      </HStack>
    </VStack>
  );
}
