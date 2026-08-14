"use client";

import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Squares2X2Icon } from "@heroicons/react/24/outline";
import GrapesBuilder from "@/components/GrapesBuilder";

export default function VisualBuilderPage() {
  return (
    <VStack gap={4}>
      {/* หัวหน้าเพจ */}
      <div
        style={{
          background: "var(--cmms-bg-card)",
          border: "1px solid var(--cmms-border)",
          borderRadius: 14,
          padding: "18px 20px",
        }}
      >
        <Text type="body" size="sm" className="cmms-eyebrow">
          VISUAL PAGE BUILDER · GRAPESJS
        </Text>
        <HStack gap={3} vAlign="center" wrap="wrap">
          <Heading level={2} style={{ margin: 0 }}>
            สร้างหน้าเว็บด้วยการลากวาง
          </Heading>
          <span
            className="cmms-andon-chip"
            style={{
              background: "var(--cmms-success-light)",
              color: "var(--cmms-success)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Squares2X2Icon className="w-3.5 h-3.5" /> Open Source · GrapesJS
          </span>
        </HStack>
        <Text type="body" style={{ color: "var(--cmms-text-secondary)", marginTop: 4 }}>
          ลากบล็อกจากซ้ายมือ (การ์ด KPI, ไฟ Andon, ตาราง, ฟอร์ม) ลง canvas ปรับแต่งด้วยแผงสไตล์ทางขวา
          แล้วกดบันทึก — หน้าใหม่จะเปิดได้ที่ /pages/ชื่อslug ทันที
        </Text>
      </div>

      <GrapesBuilder />
    </VStack>
  );
}
