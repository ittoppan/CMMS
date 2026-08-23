"use client";

import { useEffect } from "react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Home, RefreshCw, TriangleAlert } from "lucide-react";
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
    <PageShell
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "เกิดข้อผิดพลาด" },
      ]}
      title="เกิดข้อผิดพลาดในการแสดงหน้านี้"
    >
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--cmms-danger-light)] text-[var(--cmms-danger)]">
          <TriangleAlert size={32} strokeWidth={1.75} aria-hidden="true" />
        </div>

        <p
          className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground"
          style={{ margin: "10px auto 0", lineHeight: 1.7 }}
        >
          ระบบพบปัญหาขณะโหลดข้อมูล กรุณาลองใหม่อีกครั้ง หากยังเกิดซ้ำ ติดต่อทีม IT
          พร้อมรหัสข้อผิดพลาดด้านล่าง
        </p>

        {error?.digest && (
          <code className="mt-4 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
            Error ID: {error.digest}
          </code>
        )}

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={reset}>
            <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
            ลองใหม่อีกครั้ง
          </Button>
          <Button variant="secondary" onClick={() => router.push("/dashboard")}>
            <Home size={16} strokeWidth={1.75} aria-hidden="true" />
            กลับหน้าแรก
          </Button>
        </div>

        <p className="mt-12 text-xs text-muted-foreground">CMMS-TOPPAN Enterprise Suite</p>
      </div>
    </PageShell>
  );
}
