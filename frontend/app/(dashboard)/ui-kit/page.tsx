"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import {
  DetailHeader,
  InfoGrid,
  FormPage,
  FormSection,
  FormActions,
  HubGrid,
  HubCard,
} from "@/components/layout";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function UiKitDemoPage() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [success, setSuccess] = React.useState<string | null>(null);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSuccess("บันทึกข้อมูลเรียบร้อย");
    }, 600);
  };

  return (
    <div className="w-full space-y-8">
      <DetailHeader
        breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "UI kit demo" }]}
        eyebrow={<p className="cmms-eyebrow">ตัวอย่าง component</p>}
        title="ชุด component กลาง (Detail/Form/Hub)"
        description="หน้านี้เป็นตัวอย่างชั่วคราวของ DetailHeader, InfoGrid, FormPage/FormSection/FormActions, HubGrid/HubCard, EmptyState — ข้อมูลปลอม ไม่ได้ต่อ API"
        status={<Badge variant="success">พร้อมใช้งาน</Badge>}
        primaryAction={
          <Button variant="primary">
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            สร้างใหม่
          </Button>
        }
        actions={[<Button key="edit" variant="secondary">แก้ไข</Button>]}
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">InfoGrid</h2>
        <Card className="p-5">
          <InfoGrid
            items={[
              { label: "หมายเลขงาน", value: "EN-2041" },
              { label: "สถานะ", value: <Badge variant="primary">กำลังซ่อม</Badge> },
              { label: "เครื่องจักร", value: "PUMP-01" },
              { label: "ช่างผู้รับผิดชอบ", value: "สมชาย ใจดี" },
              { label: "วันที่สร้าง", value: "20/11/2026" },
              { label: "กำหนดเสร็จ", value: "22/11/2026", hint: "เหลืออีก 2 วัน" },
            ]}
          />
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">FormPage / FormSection / FormActions</h2>
        <FormPage error={null} success={success}>
          <FormSection title="ข้อมูลผู้ใช้" description="กรอกข้อมูลพื้นฐาน">
            <div className="space-y-1.5">
              <Label htmlFor="name">ชื่อ-นามสกุล</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น สมชาย ใจดี" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">อีเมล</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </div>
          </FormSection>
          <FormSection title="การตั้งค่า" columns={1}>
            <div className="space-y-1.5">
              <Label htmlFor="dept">แผนก</Label>
              <Input id="dept" placeholder="เช่น ซ่อมบำรุง" />
            </div>
          </FormSection>
          <FormActions
            primary={
              <Button variant="primary" loading={saving} onClick={handleSave}>
                บันทึก
              </Button>
            }
            secondary={[<Button key="cancel" variant="secondary">ยกเลิก</Button>]}
          />
        </FormPage>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">HubGrid / HubCard</h2>
        <HubGrid>
          <HubCard
            icon={<span className="text-lg">🔧</span>}
            title="งานซ่อม"
            description="ติดตามและจัดการใบสั่งงานซ่อมทั้งหมด"
            href="/repair"
          />
          <HubCard
            icon={<span className="text-lg">📋</span>}
            title="PM/AM"
            description="แผนบำรุงรักษาเชิงป้องกัน"
            href="/pm_am"
          />
          <HubCard
            icon={<span className="text-lg">📦</span>}
            title="อะไหล่"
            description="จัดการสต็อกและเบิกจ่าย"
            href="/spare_parts"
          />
        </HubGrid>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">EmptyState</h2>
        <Card>
          <EmptyState
            title="ไม่พบข้อมูล"
            description="ยังไม่มีรายการในขณะนี้ กดปุ่มด้านล่างเพื่อสร้างใหม่"
            action={<Button variant="primary">สร้างใหม่</Button>}
          />
        </Card>
      </section>
    </div>
  );
}