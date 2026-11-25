/**
 * Global loading UI — แสดงกราฟิกโหลด (docs/loading.svg) ทุกครั้งที่ navigate ระหว่างหน้า
 * (Next.js Suspense boundary: ไฟล์นี้ครอบทุกหน้าใน (dashboard))
 */
export default function DashboardLoading() {
  return (
    <div
      className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4"
      aria-busy="true"
      aria-label="กำลังโหลดหน้า"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/loading.svg" alt="กำลังโหลด" width={160} height={160} className="h-40 w-40 sm:h-56 sm:w-56" draggable={false} />
      <p className="text-sm font-medium text-[var(--cmms-text-secondary)]">กำลังโหลด…</p>
    </div>
  );
}