"use client";

import { ModuleGuide } from "@/components/dashboard/module-guide";
import { usePageHero } from "@/lib/i18n";
// editor/builder — v3 design system (shadcn-style)
// logic ครบเดิม: embed GrapesJS ผ่าน GrapesBuilder (ไม่แตะ integration)

import { PageShell } from "@/components/PageShell";
import { Badge } from "@/components/ui/badge";
import { LayoutGrid } from "lucide-react";
import GrapesBuilder from "@/components/GrapesBuilder";

export default function VisualBuilderPage() {
  const hero = usePageHero("editor/builder");

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">PAGE BUILDER · CMMS-TOPPAN</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ระบบ & ตั้งค่า" }, { label: "Visual Page Builder" }]}
      title="สร้างหน้าเว็บด้วยการลากวาง"
      description={`ลากบล็อกจากซ้ายมือ (การ์ด KPI, ไฟ Andon, ตาราง, ฟอร์ม) ลง canvas ปรับแต่งด้วยแผงสไตล์ทางขวา แล้วกดบันทึก — หน้าใหม่จะเปิดได้ที่ /pages/ชื่อslug ทันที — หมวด "ข้อมูลจริง (จากฐานข้อมูล)" จะดึง KPI งานซ่อม, ไฟ Andon และอะไหล่ใกล้หมดจาก DB มาแสดงอัตโนมัติเมื่อเปิดหน้า`}
      actions={
        <Badge variant="neutral">
          <LayoutGrid size={14} strokeWidth={1.75} aria-hidden="true" /> Open Source · GrapesJS
        </Badge>
      }
    >

      <ModuleGuide
        name="ตัวสร้างหน้า/Editor Builder"
        summary="เครื่องมือสร้างหรือแก้ไขหน้า/เลย์เอาต์ตามฟีเจอร์ที่ระบบรองรับ (editor/builder) สำหรับผู้ดูแลที่มีสิทธิ์"
        steps={["เปิด builder และแก้ไขเนื้อหา/เลย์เอาต์ตามที่ต้องการ","บันทึกและตรวจสอบผลบนหน้าปลายทาง","หากมีการเผยแพร่ ให้ระวังผลกระทบต่อผู้ใช้และทดสอบก่อน"]}
        source="ทำงานผ่านหน้า builder และ API/บริการที่เกี่ยวข้องกับการจัดเก็บหน้า (ตามโค้ดในหน้านี้)"
        note="การแก้ไข builder อาจมีผลกับหน้าที่เผยแพร่แล้ว — ควรทดสอบและมีผู้รับผิดชอบกำกับ"
        related={[{"href":"/pages","label":"จัดการหน้า (Pages)"},{"href":"/settings","label":"ตั้งค่าระบบ"}]}
      />
      <div className="pb-24 lg:pb-8">
        <GrapesBuilder />
      </div>
    </PageShell>
  );
}
