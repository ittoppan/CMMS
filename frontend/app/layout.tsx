import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "../components/PwaRegister";
import SplashScreen from "../components/SplashScreen";

export const metadata: Metadata = {
  title: "CMMS-TOPPAN — Enterprise Maintenance Suite",
  description:
    "TOPPAN Flexible Packaging (Thailand) Co., Ltd. — CMMS Login",
  manifest: "/manifest.webmanifest",
  applicationName: "CMMS-TOPPAN",
  appleWebApp: {
    capable: true,
    title: "CMMS-TOPPAN",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#4F46E5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/**
 * Inline splash (PWA-friendly)
 * - แสดงทันทีจาก HTML shell (ไม่ต้องรอ JS/React) — ป้องกันหน้าขาวตอนเปิดแอป
 * - SplashScreen (client) จะ fade-out หลัง window load + hydration
 */
const SPLASH_CSS = `
#cmms-splash {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px;
  background: linear-gradient(165deg, #312E81 0%, #1E1B4B 60%, #0E1524 100%);
  color: #fff;
  transition: opacity 0.35s ease, visibility 0.35s ease;
}
#cmms-splash.cmms-splash-hidden { opacity: 0; visibility: hidden; pointer-events: none; }
.cmms-splash-logo {
  width: 84px; height: 84px; border-radius: 22px;
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.18);
  display: flex; align-items: center; justify-content: center;
  font-size: 40px; font-weight: 800; letter-spacing: -0.02em;
  animation: cmmsSplashPop 0.5s ease;
}
.cmms-splash-title { font-size: 18px; font-weight: 700; letter-spacing: 0.01em; }
.cmms-splash-sub { font-size: 12px; opacity: 0.72; font-weight: 500; letter-spacing: 0.04em; }
.cmms-splash-spinner {
  width: 26px; height: 26px; border-radius: 50%;
  border: 3px solid rgba(255,255,255,0.2); border-top-color: #fff;
  animation: cmmsSplashSpin 0.8s linear infinite; margin-top: 6px;
}
@keyframes cmmsSplashSpin { to { transform: rotate(360deg); } }
@keyframes cmmsSplashPop { 0% { transform: scale(0.7); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: OpenWork/Electron shell ฉีด attribute
    // (data-openwork-shell, className) เข้า <html> หลัง SSR — กัน warning ปลอม
    <html lang="th" suppressHydrationWarning>
      <body>
        <style>{SPLASH_CSS}</style>
        <div id="cmms-splash" aria-hidden="true">
          <div className="cmms-splash-logo">C</div>
          <div>
            <div className="cmms-splash-title">CMMS-TOPPAN</div>
            <div className="cmms-splash-sub">ระบบบริหารงานซ่อมบำรุง</div>
          </div>
          <div className="cmms-splash-spinner" />
        </div>
        <PwaRegister />
        <SplashScreen />
        {children}
      </body>
    </html>
  );
}
