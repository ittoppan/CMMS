import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--cmms-bg-muted,#f1f5f9)] text-[var(--cmms-text-muted,#64748b)]">
        <span className="text-2xl font-semibold" aria-hidden="true">?</span>
      </div>
      <p className="text-sm font-medium uppercase tracking-wide text-[var(--cmms-text-muted,#64748b)]">404</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--cmms-text-primary,#0f172a)]">
        ไม่พบหน้านี้
      </h1>
      <p className="mt-3 max-w-[420px] text-sm leading-relaxed text-[var(--cmms-text-secondary,#475569)]">
        หน้าที่คุณค้นหาอาจถูกย้าย ลบ หรือไม่มีอยู่ในระบบ — ลองกลับไปหน้าแรกหรือใช้เมนูนำทาง
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-[var(--cmms-primary,#2563eb)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--cmms-primary-hover,#1d4ed8)]"
        >
          กลับหน้าแรก
        </Link>
      </div>
    </div>
  );
}
