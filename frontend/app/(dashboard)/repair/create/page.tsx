"use client";

import RepairRequestForm from "@/components/RepairRequestForm";
import { usePageHero } from "@/lib/i18n";
import { PageHeader } from "@/components/layout";

/**
 * เปิดใบแจ้งซ่อม (dashboard) — ใช้ฟอร์มและข้อมูลชุดเดียวกับ /repair/request
 * เพื่อให้ฟิลด์และพฤติกรรมการแจ้งซ่อมตรงกัน
 */
export default function CreateWorkOrderPage() {
  const hero = usePageHero("repair/create");

  return (
    <>
      <PageHeader
        className="sr-only"
        eyebrow={<p className="cmms-eyebrow">REPAIR REQUEST · CMMS-TOPPAN</p>}
        title={hero.title}
        description={hero.desc}
      />
      <RepairRequestForm />
    </>
  );
}
