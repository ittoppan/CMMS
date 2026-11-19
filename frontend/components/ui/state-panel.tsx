"use client";

import { LockClosedIcon, InboxIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { EmptyState as UiEmptyState } from "@/components/ui/empty-state";

interface BaseProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * สถานะระดับหน้า (ไม่มีสิทธิ์ / ไม่มีข้อมูล)
 * EmptyState ที่นี่ห่อ components/ui/empty-state ตัวเดียวของระบบ —
 * ไม่มีสไตล์ dashed-card ซ้ำอีก เพื่อให้ทุกหน้าใช้หน้าตาเดียวกัน
 */
export function PermissionDeniedState({
  title = "ไม่มีสิทธิ์เข้าถึง",
  description = "คุณไม่มีสิทธิ์ดูข้อมูลในหน้านี้ — ติดต่อผู้ดูแลระบบหากต้องการสิทธิ์เพิ่ม",
  actionLabel,
  onAction,
}: BaseProps) {
  return (
    <UiEmptyState
      icon={<LockClosedIcon className="h-5 w-5" />}
      title={title}
      description={description}
      action={
        actionLabel && onAction ? (
          <Button variant="secondary" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : undefined
      }
    />
  );
}

export function EmptyState({
  title = "ยังไม่มีข้อมูล",
  description = "ยังไม่มีรายการ — เริ่มต้นด้วยการเพิ่มรายการแรก",
  actionLabel,
  onAction,
}: BaseProps) {
  return (
    <UiEmptyState
      icon={<InboxIcon className="h-5 w-5" />}
      title={title}
      description={description}
      action={
        actionLabel && onAction ? (
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : undefined
      }
    />
  );
}
