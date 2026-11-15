"use client";

import RepairRequestForm from "@/components/RepairRequestForm";
import { usePageHero } from "@/lib/i18n";

/**
 * เปิดใบแจ้งซ่อม (dashboard) — ใช้ฟอร์มและข้อมูลชุดเดียวกับ /repair/request
 * เพื่อให้ฟิลด์และพฤติกรรมการแจ้งซ่อมตรงกัน
 */
export default function CreateWorkOrderPage() {
  const hero = usePageHero("repair/create");

  return (
    <>
      <p className="cmms-eyebrow sr-only">REPAIR REQUEST · CMMS-TOPPAN</p>
      <RepairRequestForm />
    </>
  );
}
