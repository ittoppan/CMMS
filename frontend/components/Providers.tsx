"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import ToastProvider from "./ToastProvider";

/**
 * Providers — ครอบทั้งแอป
 * - next-themes: dark mode light/dark/system (attribute="class" → .dark บน <html>)
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
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </NextThemesProvider>
  );
}