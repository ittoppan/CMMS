"use client";

import { LockClosedIcon, InboxIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";

interface BaseProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function PermissionDeniedState({
  title = "ไม่มีสิทธิ์เข้าถึง",
  description = "คุณไม่มีสิทธิ์ดูข้อมูลในหน้านี้ — ติดต่อผู้ดูแลระบบหากต้องการสิทธิ์เพิ่ม",
  actionLabel,
  onAction,
}: BaseProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--cmms-danger-light)] text-[var(--cmms-danger)]">
        <LockClosedIcon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button variant="secondary" onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}

export function EmptyState({
  title = "ยังไม่มีข้อมูล",
  description = "ยังไม่มีรายการ — เริ่มต้นด้วยการเพิ่มรายการแรก",
  actionLabel,
  onAction,
}: BaseProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--cmms-bg-muted)] text-[var(--cmms-text-muted)]">
        <InboxIcon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}
