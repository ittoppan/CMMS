"use client";

import { t, useLang } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { ShieldAlert, Home, RefreshCw } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * AccessDenied — หน้าแสดงเมื่อ backend ตอบ 403 FORBIDDEN (requirePerm / requireLogin admin)
 * ใช้เพื่อซ่อนเนื้อหาหน้าทันที ไม่ให้ content กระพริบโชว์ก่อนรู้สิทธิ์
 */
export function AccessDenied({ onRetry }: { onRetry?: () => void }) {
  useLang();
  const router = useRouter();

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">SECURITY · ACCESS DENIED · CMMS-TOPPAN</p>}
      breadcrumbs={[{ label: t("nav.system"), href: "/settings" }]}
      title={t("access_denied.title")}
      description={t("access_denied.desc")}
      actions={
        <>
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              <RefreshCw className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              {t("access_denied.retry")}
            </Button>
          )}
          <Button onClick={() => router.push("/dashboard")}>
            <Home className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            {t("access_denied.back")}
          </Button>
        </>
      }
    >
      <Card className="p-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{
              background: "var(--cmms-danger-light)",
              color: "var(--cmms-danger)",
            }}
          >
            <ShieldAlert className="h-8 w-8" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">{t("access_denied.title")}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{t("access_denied.desc")}</p>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}