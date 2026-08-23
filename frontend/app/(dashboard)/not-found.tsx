"use client";

import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Home, Search } from "lucide-react";
import { useRouter } from "next/navigation";

export default function DashboardNotFound() {
  const router = useRouter();

  return (
    <PageShell
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "ไม่พบหน้านี้" },
      ]}
      title="ไม่พบหน้านี้"
    >
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Search size={32} strokeWidth={1.75} aria-hidden="true" />
        </div>

        <p className="text-5xl font-bold tracking-tight tabular-nums text-foreground">404</p>

        <p className="mt-3 max-w-[400px] text-sm leading-relaxed text-muted-foreground">
          หน้าที่คุณค้นหาอาจถูกย้าย ลบ หรือไม่มีสิทธิ์เข้าถึง — ลองกลับไปหน้าแรกหรือใช้เมนูนำทาง
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => router.push("/dashboard")}>
            <Home size={16} strokeWidth={1.75} aria-hidden="true" />
            กลับหน้าแรก
          </Button>
          <Button variant="secondary" onClick={() => router.back()}>
            ย้อนกลับ
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
