"use client";

// pages — v3 design system (shadcn-style)
// logic ครบเดิม: ตรวจสิทธิ์ useMenuPermission + โหลดรายการ custom_pages

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { Grid } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText, LayoutGrid, ExternalLink, SquarePen } from "lucide-react";
import { useMenuPermission } from "@/lib/useMenuPermission";

interface PageRow {
  id: number;
  slug: string;
  title: string;
  updated_at: string;
}

export default function CustomPagesListPage() {
  const [pages, setPages] = useState<PageRow[] | null>(null);
  const { canShow, loading: permLoading } = useMenuPermission();
  const canBuild = canShow("editor/builder");
  const canViewPages = canShow("pages");

  useEffect(() => {
    let cancelled = false;
    if (!canViewPages) return;
    (async () => {
      try {
        const res = await fetch("/api/v1/custom_pages.php", {
          cache: "no-store",
        });
        const json = await res.json();
        if (!cancelled && json?.status === "success" && Array.isArray(json.pages)) {
          setPages(json.pages);
        } else if (!cancelled && res.status === 403) {
          setPages([]);
        }
      } catch {
        if (!cancelled) setPages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canViewPages]);

  if (permLoading) {
    return (
      <PageShell
        eyebrow={<p className="cmms-eyebrow">CMS PAGES · CMMS-TOPPAN</p>}
        breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ระบบ & ตั้งค่า" }, { label: "หน้าเว็บที่สร้างเอง" }]}
        title="หน้าเว็บที่สร้างเอง"
        description="หน้าทั้งหมดที่สร้างจาก Visual Page Builder"
      >
        <p className="py-10 text-sm text-muted-foreground">กำลังตรวจสอบสิทธิ์การเข้าถึง...</p>
      </PageShell>
    );
  }

  // บังคับสิทธิ์เมนู "หน้าเว็บที่สร้างเอง" (pages)
  if (!canViewPages) {
    return (
      <PageShell
        breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ระบบ & ตั้งค่า" }, { label: "หน้าเว็บที่สร้างเอง" }]}
        title="หน้าเว็บที่สร้างเอง"
        description="หน้าทั้งหมดที่สร้างจาก Visual Page Builder"
      >
        <Alert variant="danger" title="ไม่มีสิทธิ์เข้าถึงหน้านี้" description={`กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์เมนู "หน้าเว็บที่สร้างเอง"`} />
        <div className="pt-2">
          <Link href="/dashboard" className="text-sm font-semibold text-primary hover:underline">
            กลับไปหน้าแรก
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ระบบ & ตั้งค่า" }, { label: "หน้าเว็บที่สร้างเอง" }]}
      title="หน้าเว็บที่สร้างเอง"
      description="หน้าทั้งหมดที่สร้างจาก Visual Page Builder — กดเพื่อเปิดดูหรือเข้าไปแก้ไข"
      actions={
        canBuild ? (
          <Link
            href="/editor/builder"
            className="inline-flex h-10 items-center gap-2 rounded-[var(--cmms-radius)] bg-[var(--cmms-primary)] px-4 text-sm font-semibold text-white shadow-[var(--cmms-shadow-sm)] transition-colors hover:bg-[var(--cmms-primary-hover)]"
          >
            <LayoutGrid size={16} strokeWidth={1.75} aria-hidden="true" />
            สร้างหน้าใหม่
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-6 pb-24 lg:pb-8">
        {pages === null ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : pages.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={<FileText size={28} strokeWidth={1.75} aria-hidden="true" />}
                title="ยังไม่มีหน้าเว็บที่สร้างเอง"
                description="ไปที่หน้า Visual Page Builder เพื่อลากวางบล็อกและสร้างหน้าแรกของคุณ"
                action={
                  canBuild ? (
                    <Button onClick={() => (window.location.href = "/editor/builder")}>
                      <LayoutGrid size={16} strokeWidth={1.75} aria-hidden="true" />
                      เปิด Visual Page Builder
                    </Button>
                  ) : undefined
                }
              />
            </CardContent>
          </Card>
        ) : (
          <Grid columns={{ minWidth: 260, repeat: "fit" }} gap={4}>
            {pages.map((p) => (
              <Card key={p.id} className="transition-shadow hover:shadow-md">
                <CardContent className="flex h-full flex-col gap-2 p-4">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--cmms-success)]"
                    />
                    <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{p.title}</h3>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">/pages/{p.slug}</p>
                  <p className="text-xs text-muted-foreground">อัปเดต: {p.updated_at}</p>
                  <div className="mt-auto flex gap-2 pt-2">
                    <a
                      href={`/pages/${encodeURIComponent(p.slug)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cmms-border)] px-3 py-1.5 text-xs font-semibold text-[var(--cmms-primary)] hover:bg-accent"
                    >
                      <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" /> เปิดดู
                    </a>
                    {canBuild && (
                      <a
                        href={`/editor/builder?slug=${encodeURIComponent(p.slug)}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cmms-border)] px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary"
                      >
                        <SquarePen size={14} strokeWidth={1.75} aria-hidden="true" /> แก้ไข
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </Grid>
        )}
      </div>
    </PageShell>
  );
}
