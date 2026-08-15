"use client";

import { useEffect, useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { DocumentTextIcon, Squares2X2Icon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
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
          headers: { "ngrok-skip-browser-warning": "1" },
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
      <VStack gap={3} style={{ padding: "40px 0" }} vAlign="center">
        <Text type="body" className="cmms-eyebrow">
          CUSTOM PAGES · GRAPESJS
        </Text>
        <Text type="body" style={{ color: "var(--cmms-text-muted)" }}>
          กำลังตรวจสอบสิทธิ์การเข้าถึง...
        </Text>
      </VStack>
    );
  }

  // บังคับสิทธิ์เมนู "หน้าเว็บที่สร้างเอง" (pages)
  if (!canViewPages) {
    return (
      <VStack gap={3} style={{ padding: "40px 0" }} vAlign="center">
        <Text type="body" className="cmms-eyebrow">
          CUSTOM PAGES · GRAPESJS
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

  return (
    <VStack gap={4}>
      <div
        style={{
          background: "var(--cmms-bg-card)",
          border: "1px solid var(--cmms-border)",
          borderRadius: 14,
          padding: "18px 20px",
        }}
      >
        <Text type="body" size="sm" className="cmms-eyebrow">
          CUSTOM PAGES · GRAPESJS
        </Text>
        <HStack gap={3} vAlign="center" wrap="wrap">
          <Heading level={2} style={{ margin: 0 }}>
            หน้าเว็บที่สร้างเอง
          </Heading>
          {canBuild && (
            <a
              href="/editor/builder"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "var(--cmms-primary)",
                color: "var(--cmms-text-on-primary)",
                fontSize: 13,
                fontWeight: 600,
                padding: "8px 14px",
                borderRadius: 8,
                textDecoration: "none",
              }}
            >
              <Squares2X2Icon className="w-4 h-4" /> สร้างหน้าใหม่
            </a>
          )}
        </HStack>
        <Text type="body" style={{ color: "var(--cmms-text-secondary)", marginTop: 4 }}>
          หน้าทั้งหมดที่สร้างจาก Visual Page Builder — กดเพื่อเปิดดูหรือเข้าไปแก้ไข
        </Text>
      </div>

      {pages === null ? (
        <Text type="body" style={{ color: "var(--cmms-text-muted)" }}>
          กำลังโหลด...
        </Text>
      ) : pages.length === 0 ? (
        <Card padding={5}>
          <VStack gap={3} vAlign="center">
            <DocumentTextIcon className="w-8 h-8" style={{ color: "var(--cmms-text-muted)" }} />
            <Heading level={3}>ยังไม่มีหน้าเว็บที่สร้างเอง</Heading>
            <Text type="body" style={{ color: "var(--cmms-text-secondary)" }}>
              ไปที่หน้า Visual Page Builder เพื่อลากวางบล็อกและสร้างหน้าแรกของคุณ
            </Text>
            {canBuild && (
              <a
                href="/editor/builder"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "var(--cmms-primary)",
                  color: "var(--cmms-text-on-primary)",
                  fontSize: 14,
                  fontWeight: 600,
                  padding: "10px 18px",
                  borderRadius: 8,
                  textDecoration: "none",
                }}
              >
                <Squares2X2Icon className="w-4 h-4" /> เปิด Visual Page Builder
              </a>
            )}
          </VStack>
        </Card>
      ) : (
        <Grid columns={{ minWidth: 260, repeat: "fit" }} gap={4}>
          {pages.map((p) => (
            <Card key={p.id} padding={4}>
              <VStack gap={2} style={{ height: "100%" }}>
                <HStack gap={2} vAlign="center">
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "var(--cmms-andon-ok)",
                      display: "inline-block",
                      flex: "none",
                    }}
                  />
                  <Heading level={4} style={{ margin: 0, flex: 1 }}>
                    {p.title}
                  </Heading>
                </HStack>
                <Text type="body" size="sm" style={{ color: "var(--cmms-text-muted)" }}>
                  /pages/{p.slug}
                </Text>
                <Text type="body" size="sm" style={{ color: "var(--cmms-text-muted)" }}>
                  อัปเดต: {p.updated_at}
                </Text>
                <HStack gap={2} style={{ marginTop: "auto", paddingTop: 8 }}>
                  <a
                    href={`/pages/${encodeURIComponent(p.slug)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--cmms-primary)",
                      textDecoration: "none",
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--cmms-border)",
                    }}
                  >
                    <ArrowTopRightOnSquareIcon className="w-4 h-4" /> เปิดดู
                  </a>
                  {canBuild && (
                    <a
                      href={`/editor/builder?slug=${encodeURIComponent(p.slug)}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--cmms-text-secondary)",
                        textDecoration: "none",
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--cmms-border)",
                      }}
                    >
                      <Squares2X2Icon className="w-4 h-4" /> แก้ไข
                    </a>
                  )}
                </HStack>
              </VStack>
            </Card>
          ))}
        </Grid>
      )}
    </VStack>
  );
}
