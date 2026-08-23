"use client";

/**
 * Sentry client-side error monitoring (optional).
 *
 * To ENABLE: add to frontend/.env.local —
 *   NEXT_PUBLIC_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
 * then rebuild + redeploy. Without the variable this module is a no-op,
 * so the app stays dependency-free in behavior and cost.
 *
 * Catches: uncaught exceptions, unhandled promise rejections, and
 * React render errors bubbled through app/global-error.tsx.
 */
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  const [Sentry] = await Promise.all([import("@sentry/nextjs")]);
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.5,
  });
}
