"use client";

// pages/[slug] — v3 design system (Astryx-free)
// logic ครบเดิม: ตรวจสิทธิ์ + โหลดหน้าตาม slug + hydrateDynamicPage

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ArrowLeft, SquarePen } from "lucide-react";
import { hydrateDynamicPage } from "@/lib/dynamicPages";
import { useMenuPermission } from "@/lib/useMenuPermission";

interface CustomPage {
  slug: string;
  title: string;
  html: string;
  css: string;
  updated_at: string;
}

export default function CustomPageView() {
  const params = useParams<{ slug: string }>();
  const { canShow, loading: permLoading } = useMenuPermission();
  const canBuild = canShow("editor/builder");
  const canViewPages = canShow("pages");
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug ?? "";
  const [page, setPage] = useState<CustomPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!slug || !canViewPages) return;
    (async () => {
      try {
        const res = await fetch(`/api/v1/custom_pages.php?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (cancelled) return;
        if (res.status === 403) {
          setError(json?.error || "ไม่มีสิทธิ์เข้าถึงหน้านี้");
        } else if (json?.status === "success" && json.page) {
          setPage(json.page);
        } else {
          setError(json?.message || json?.error || "ไม่พบหน้านี้");
        }
      } catch {
        if (!cancelled) setError("โหลดหน้าไม่สำเร็จ — ลองใหม่ภายหลัง");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, canViewPages]);

  if (permLoading) {
    return (
      <PageShell
        eyebrow={<p className="cmms-eyebrow">CMS PAGES · CMMS-TOPPAN</p>}
        breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ระบบ & ตั้งค่า" }, { label: "ดูหน้าที่สร้างเอง" }]}
        title="ดูหน้าที่สร้างเอง"
      >
        <p className="py-10 text-sm text-muted-foreground">กำลังตรวจสอบสิทธิ์การเข้าถึง...</p>
      </PageShell>
    );
  }

  // บังคับสิทธิ์เมนู "หน้าเว็บที่สร้างเอง" (pages) — ลิงก์ตรงไม่มีสิทธิ์เปิดดูไม่ได้
  if (!canViewPages) {
    return (
      <PageShell
        breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ระบบ & ตั้งค่า" }, { label: "ดูหน้าที่สร้างเอง" }]}
        title="ดูหน้าที่สร้างเอง"
      >
        <Alert variant="danger" title="ไม่มีสิทธิ์เข้าถึงหน้านี้" description={`กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์เมนู "หน้าเว็บที่สร้างเอง"`} />
        <div className="pt-2">
          <a href="/dashboard" className="text-sm font-semibold text-primary hover:underline">
            กลับไปหน้าแรก
          </a>
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell
        breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ระบบ & ตั้งค่า" }, { label: "ดูหน้าที่สร้างเอง" }]}
        title="ดูหน้าที่สร้างเอง"
      >
        <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />
        <div className="pt-2">
          <a href="/pages" className="text-sm font-semibold text-primary hover:underline">
            กลับไปหน้ารายการหน้าเว็บ
          </a>
        </div>
      </PageShell>
    );
  }

  // เติมข้อมูลจริงลงบล็อกไดนามิก ([data-dynamic]) หลัง HTML ของหน้า render เสร็จ
  useEffect(() => {
    if (page && contentRef.current) {
      void hydrateDynamicPage(contentRef.current);
    }
  }, [page]);

  return (
    <PageShell
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "ระบบ & ตั้งค่า" },
        { label: page?.title || "ดูหน้าที่สร้างเอง" },
      ]}
      title={page?.title || "กำลังโหลดหน้า..."}
      description={page ? `CUSTOM PAGE · /pages/${page.slug}` : undefined}
      actions={
        page ? (
          <>
            <a href="/pages" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
              <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" /> รายการหน้า
            </a>
            {canBuild && (
              <a
                href={`/editor/builder?slug=${encodeURIComponent(page.slug)}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--cmms-primary)] hover:underline"
              >
                <SquarePen size={16} strokeWidth={1.75} aria-hidden="true" /> แก้ไขด้วย Builder
              </a>
            )}
          </>
        ) : undefined
      }
    >
      <div className="pb-24 lg:pb-8">
        {/* เนื้อหาหน้าที่สร้างจาก GrapesJS */}
        {page ? (
          <Card className="bg-background p-6">
            <style dangerouslySetInnerHTML={{ __html: page.css }} />
            <div ref={contentRef} dangerouslySetInnerHTML={{ __html: page.html }} />
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">กำลังโหลดหน้า...</p>
        )}
      </div>
    </PageShell>
  );
}
