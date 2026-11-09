"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import ToastProvider from "./ToastProvider";

/**
 * Providers — ครอบทั้งแอป
 * - next-themes: light เป็นค่าเริ่มต้นเสมอ (attribute="class" → .dark บน <html> เมื่อเปิด dark ผ่าน toggle) — ไม่ตามระบบ เพื่อกันหน้า login/home เพี้ยนบนเครื่อง dark
 * - react-query: cache/data fetching มาตรฐาน (lib/api.ts ใช้ร่วม)
 * - disableTransitionOnChange: กัน transition กระตุกตอนสลับธีม
 * - suppressHydrationWarning อยู่ที่ <html> ใน root layout แล้ว (กัน FOUC warning)
 * - ToastProvider: toast notifications ทั้งแอป
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </NextThemesProvider>
  );
}