/**
 * Global loading UI — แสดง skeleton ทุกครั้งที่ navigate ระหว่างหน้า
 * (Next.js Suspense boundary: ไฟล์นี้ครอบทุกหน้าใน (dashboard))
 */
export default function DashboardLoading() {
  return (
    <div className="animate-fade-in w-full" aria-busy="true" aria-label="กำลังโหลดหน้า">
      {/* Page header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
        <div className="flex flex-col gap-2">
          <div className="cmms-skeleton h-7 w-56 rounded-lg" />
          <div className="cmms-skeleton h-4 w-80 max-w-full rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <div className="cmms-skeleton h-10 w-24 rounded-xl" />
          <div className="cmms-skeleton h-10 w-36 rounded-xl" />
        </div>
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-[var(--cmms-border)] bg-[var(--cmms-bg-card)] p-5"
            style={{ boxShadow: "var(--cmms-shadow)" }}
          >
            <div className="cmms-skeleton h-3.5 w-28 rounded-md mb-4" />
            <div className="cmms-skeleton h-8 w-20 rounded-lg" />
            <div className="cmms-skeleton h-3 w-32 rounded-md mt-3" />
          </div>
        ))}
      </div>

      {/* Table / content card skeleton */}
      <div className="rounded-2xl border border-[var(--cmms-border)] bg-[var(--cmms-bg-card)] p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="cmms-skeleton h-5 w-40 rounded-md" />
          <div className="cmms-skeleton h-9 w-28 rounded-lg" />
        </div>
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="cmms-skeleton h-4 w-24 rounded-md" />
              <div className="cmms-skeleton h-4 w-1/3 rounded-md" />
              <div className="cmms-skeleton h-4 w-1/5 rounded-md ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
