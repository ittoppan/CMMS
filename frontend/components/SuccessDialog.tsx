"use client";

import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

/**
 * SuccessDialog — หน้าจอ "สำเร็จ" แบบเต็มจอ (Astryx design)
 * ใช้แทน cmms-success-overlay/card/icon เดิมในหน้า create/edit ทุกรายการ
 * คลิกพื้นที่ว่าง = onBackdrop (มักพาไปหน้ารายการ)
 */
interface SuccessDialogProps {
  title: string;
  message?: React.ReactNode;
  /** เนื้อหาเสริม (เช่น รหัสใบงาน / ชื่อรายการแบบตัวใหญ่) */
  children?: React.ReactNode;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  onBackdrop?: () => void;
  /** เรียงปุ่มแบบซ้อนกันเต็มความกว้าง (ใช้หน้า mobile/standalone) */
  stackButtons?: boolean;
}

export default function SuccessDialog({
  title,
  message,
  children,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  onBackdrop,
  stackButtons = false,
}: SuccessDialogProps) {
  return (
    <div
      onClick={onBackdrop}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "var(--color-overlay, rgba(15,23,42,0.5))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <VStack
        gap={4}
        hAlign="center"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-background-card, #fff)",
          borderRadius: 18,
          padding: 48,
          textAlign: "center",
          maxWidth: 420,
          width: "100%",
          boxShadow:
            "0 20px 25px -5px rgba(15,23,42,0.08), 0 10px 10px -5px rgba(15,23,42,0.03)",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "var(--color-success-muted, #D1FAE5)",
            color: "var(--color-success, #059669)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CheckCircleIcon style={{ width: 36, height: 36 }} />
        </div>

        <Heading level={3} style={{ marginBottom: 0 }}>
          {title}
        </Heading>

        {message && (
          <Text type="body" color="secondary">
            {message}
          </Text>
        )}

        {children}

        {stackButtons ? (
          <VStack gap={2} style={{ width: "100%" }}>
            <Button label={primaryLabel} variant="primary" width="100%" onClick={onPrimary} />
            {secondaryLabel && onSecondary && (
              <Button label={secondaryLabel} variant="secondary" width="100%" onClick={onSecondary} />
            )}
          </VStack>
        ) : (
          <HStack gap={2} hAlign="center" wrap="wrap">
            <Button label={primaryLabel} variant="primary" onClick={onPrimary} />
            {secondaryLabel && onSecondary && (
              <Button label={secondaryLabel} variant="secondary" onClick={onSecondary} />
            )}
          </HStack>
        )}
      </VStack>
    </div>
  );
}
