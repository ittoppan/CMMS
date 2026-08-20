"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { PencilSquareIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
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
      <VStack gap={3} style={{ padding: "40px 0" }} vAlign="center">
        <Text type="body" className="cmms-eyebrow">
          CUSTOM PAGE · GRAPESJS
        </Text>
        <Text type="body" style={{ color: "var(--cmms-text-muted)" }}>
          กำลังตรวจสอบสิทธิ์การเข้าถึง...
        </Text>
      </VStack>
    );
  }

  // บังคับสิทธิ์เมนู "หน้าเว็บที่สร้างเอง" (pages) — ลิงก์ตรงไม่มีสิทธิ์เปิดดูไม่ได้
  if (!canViewPages) {
    return (
      <VStack gap={3} style={{ padding: "40px 0" }} vAlign="center">
        <Text type="body" className="cmms-eyebrow">
          CUSTOM PAGE · GRAPESJS
        </Text>
        <Text type="body" style={{ color: "var(--cmms-text-secondary)" }}>
          ไม่มีสิทธิ์เข้าถึงหน้านี้ — กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์เมนู "หน้าเว็บที่สร้างเอง"
        </Text>
        <a
          href="/dashboard"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--cmms-primary)",
            textDecoration: "none",
          }}
        >
          กลับไปหน้าแรก
        </a>
      </VStack>
    );
  }

  if (error) {
    return (
      <VStack gap={3} style={{ padding: "40px 0" }} vAlign="center">
        <Text type="body" className="cmms-eyebrow">
          CUSTOM PAGE · GRAPESJS
        </Text>
        <Text type="body" style={{ color: "var(--cmms-text-secondary)" }}>
          {error}
        </Text>
        <a
          href="/pages"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--cmms-primary)",
            textDecoration: "none",
          }}
        >
          กลับไปหน้ารายการหน้าเว็บ
        </a>
      </VStack>
    );
  }

  // เติมข้อมูลจริงลงบล็อกไดนามิก ([data-dynamic]) หลัง HTML ของหน้า render เสร็จ
  useEffect(() => {
    if (page && contentRef.current) {
      void hydrateDynamicPage(contentRef.current);
    }
  }, [page]);

  return (
    <VStack gap={4}>
      {/* แถบหัวเล็ก — แสดงชื่อหน้า + ปุ่มแก้ไข */}
      {page && (
        <HStack
          gap={3}
          vAlign="center"
          wrap="wrap"
          style={{
            background: "var(--cmms-bg-card)",
            border: "1px solid var(--cmms-border)",
            borderRadius: 12,
            padding: "10px 16px",
          }}
        >
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ margin: 0 }}>
            CUSTOM PAGE · /pages/{page.slug}
          </Text>
          <div style={{ flex: 1 }} />
          <a
            href="/pages"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--cmms-text-secondary)",
              textDecoration: "none",
            }}
          >
            <ArrowLeftIcon className="w-4 h-4" /> รายการหน้า
          </a>
          {canBuild && (
            <a
              href={`/editor/builder?slug=${encodeURIComponent(page.slug)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--cmms-primary)",
                textDecoration: "none",
              }}
            >
              <PencilSquareIcon className="w-4 h-4" /> แก้ไขด้วย Builder
            </a>
          )}
        </HStack>
      )}

      {/* เนื้อหาหน้าที่สร้างจาก GrapesJS */}
      {page ? (
        <div
          style={{
            background: "var(--cmms-bg-page)",
            borderRadius: 14,
            border: "1px solid var(--cmms-border)",
            padding: 24,
          }}
        >
          <style dangerouslySetInnerHTML={{ __html: page.css }} />
          <div ref={contentRef} dangerouslySetInnerHTML={{ __html: page.html }} />
        </div>
      ) : (
        <Text type="body" style={{ color: "var(--cmms-text-muted)" }}>
          กำลังโหลดหน้า...
        </Text>
      )}
    </VStack>
  );
}
