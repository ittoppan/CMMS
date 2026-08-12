"use client";

import { HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { HomeIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";

export default function DashboardNotFound() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{
          background: "var(--cmms-bg-muted)",
          color: "var(--cmms-text-muted)",
        }}
      >
        <Icon icon={MagnifyingGlassIcon} size="xl" />
      </div>

      <Text type="display-2" weight="bold" style={{ letterSpacing: "-0.03em" }}>
        404
      </Text>
      <Heading level={2} style={{ marginTop: 4 }}>
        ไม่พบหน้านี้
      </Heading>
      <Text
        type="body"
        color="secondary"
        style={{ maxWidth: 400, margin: "10px auto 0", lineHeight: 1.7 }}
      >
        หน้าที่คุณค้นหาอาจถูกย้าย ลบ หรือไม่มีสิทธิ์เข้าถึง — ลองกลับไปหน้าแรกหรือใช้เมนูนำทาง
      </Text>

      <HStack gap={3} wrap="wrap" hAlign="center" style={{ marginTop: 28 }}>
        <Button
          label="กลับหน้าแรก"
          variant="primary"
          onClick={() => router.push("/dashboard")}
          icon={<Icon icon={HomeIcon} size="sm" />}
        />
        <Button
          label="ย้อนกลับ"
          variant="secondary"
          onClick={() => router.back()}
        />
      </HStack>
    </div>
  );
}
