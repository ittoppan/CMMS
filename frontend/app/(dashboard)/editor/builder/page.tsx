"use client";

// editor/builder — v3 design system (shadcn-style)
// logic ครบเดิม: embed GrapesJS ผ่าน GrapesBuilder (ไม่แตะ integration)

import { PageShell } from "@/components/PageShell";
import { Badge } from "@/components/ui/badge";
import { LayoutGrid } from "lucide-react";
import GrapesBuilder from "@/components/GrapesBuilder";

export default function VisualBuilderPage() {
  return (
    <PageShell
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ระบบ & ตั้งค่า" }, { label: "Visual Page Builder" }]}
      title="สร้างหน้าเว็บด้วยการลากวาง"
      description={`ลากบล็อกจากซ้ายมือ (การ์ด KPI, ไฟ Andon, ตาราง, ฟอร์ม) ลง canvas ปรับแต่งด้วยแผงสไตล์ทางขวา แล้วกดบันทึก — หน้าใหม่จะเปิดได้ที่ /pages/ชื่อslug ทันที — หมวด "ข้อมูลจริง (จากฐานข้อมูล)" จะดึง KPI งานซ่อม, ไฟ Andon และอะไหล่ใกล้หมดจาก DB มาแสดงอัตโนมัติเมื่อเปิดหน้า`}
      actions={
        <Badge variant="success">
          <LayoutGrid size={14} strokeWidth={1.75} aria-hidden="true" /> Open Source · GrapesJS
        </Badge>
      }
    >
      <div className="pb-24 lg:pb-8">
        <GrapesBuilder />
      </div>
    </PageShell>
  );
}
