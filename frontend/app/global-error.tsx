"use client";

/**
 * Global error boundary — catches render errors that bubble past every
 * page-level boundary and reports them to Sentry (when configured, see
 * instrumentation-client.ts). Renders a minimal recovery screen.
 */
import * as React from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Lazy import: no network/SDK cost when Sentry is not configured.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
    } else {
      console.error("[global-error]", error);
    }
  }, [error]);

  return (
    <html lang="th">
      <body className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">เกิดข้อผิดพลาด</h1>
          <p className="text-sm text-muted-foreground">
            ระบบพบปัญหาที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--cmms-primary-hover)]"
            >
              ลองอีกครั้ง
            </button>
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center rounded-lg border border-border bg-secondary px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              กลับหน้าหลัก
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
