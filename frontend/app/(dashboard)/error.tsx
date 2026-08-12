"use client";

import { useEffect } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { ArrowPathIcon, HomeIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";

/**
 * Global error boundary — แสดงเมื่อหน้าใดหน้าใน (dashboard) render ผิดพลาด
 * (Next.js Error Boundary: รับทั้ง runtime error + client errors)
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // บันทึก error ไว้ตรวจสอบ (console เท่านั้น ไม่ส่งออกนอกเครื่อง)
    console.error("[CMMS] Page render error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{
          background: "var(--cmms-danger-light)",
          color: "var(--cmms-danger)",
        }}
      >
        <Icon icon={ExclamationTriangleIcon} size="xl" />
      </div>

      <Heading level={2}>เกิดข้อผิดพลาดในการแสดงหน้านี้</Heading>
      <Text
        type="body"
        color="secondary"
        style={{ maxWidth: 440, margin: "10px auto 0", lineHeight: 1.7 }}
      >
        ระบบพบปัญหาขณะโหลดข้อมูล กรุณาลองใหม่อีกครั้ง หากยังเกิดซ้ำ ติดต่อทีม IT
        พร้อมรหัสข้อผิดพลาดด้านล่าง
      </Text>

      {error?.digest && (
        <code
          className="mt-4 px-3 py-1.5 rounded-lg text-xs"
          style={{
            background: "var(--cmms-bg-muted)",
            border: "1px solid var(--cmms-border)",
            color: "var(--cmms-text-muted)",
          }}
        >
          Error ID: {error.digest}
        </code>
      )}

      <HStack gap={3} wrap="wrap" hAlign="center" style={{ marginTop: 28 }}>
        <Button
          label="ลองใหม่อีกครั้ง"
          variant="primary"
          onClick={reset}
          icon={<Icon icon={ArrowPathIcon} size="sm" />}
        />
        <Button
          label="กลับหน้าแรก"
          variant="secondary"
          onClick={() => router.push("/dashboard")}
          icon={<Icon icon={HomeIcon} size="sm" />}
        />
      </HStack>

      <VStack gap={1} hAlign="center" style={{ marginTop: 48 }}>
        <Text type="supporting" color="secondary">CMMS-TOPPAN Enterprise Suite</Text>
      </VStack>
    </div>
  );
}
