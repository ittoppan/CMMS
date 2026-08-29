import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // จับ type error ใน next build ด้วย (tsc --noEmit ผ่าน 0 error แล้ว — ล้าง 96 จุด)
  typescript: {
    ignoreBuildErrors: false,
  },
  output: "standalone",
  // Allow building to an alternate dir while the standalone prod server
  // (node server.js, port 3001) holds a lock on .next/standalone:
  //   $env:NEXT_DIST_DIR=".next-verify"; npm run build
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  turbopack: {
    // Fix: Next.js inferred the workspace root from the parent package-lock.json
    // (C:\inetpub\wwwroot\cmms-tpt), which broke the standalone static-file copy.
    root: __dirname,
  },
  // Allow ngrok, Cloudflare tunnels, and local IPs for HMR
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "192.168.1.9",
    "ommatophorous-robert-fortifyingly.ngrok-free.app",
    "*.trycloudflare.com",
  ],
  async headers() {
    // ตรงข้ามกับที่ Next ส่ง (SSG prerender => Cache-Control: s-maxage=31536000 = 1 ปี)
    // LINE in-app browser (ผ่าน shared cache/relay) เชื่อ s-maxage แล้วแคชหน้า HTML เก่า
    // ทั้งปี => สาเหตุหลัก "เปิดใน LINE เห็นระบบตัวเก่า" ขณะที่นอก LINE เห็นของใหม่
    return [
      // 1) HTML / navigation / API — ห้ามแคชทุก shared cache (สั่ง no-store ก่อน -> ข้อ 2-4 ยกเว้นให้)
      {
        source: "/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" }],
      },
      // 2) hashed static (Next ใส่ hash ในชื่อไฟล์) — แคชยาวได้ ปลอดภัย
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      // 3) SW / manifest / offline page — ให้ revalidate ทุกครั้งที่เปิด (กัน SW เก่าจุก)
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" }],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" }],
      },
      {
        source: "/offline.html",
        headers: [{ key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" }],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8081/api/:path*",
      },
      // LINE Login / bind flow ยังใช้ PHP ฝั่ง IIS (8081)
      {
        source: "/line_callback.php",
        destination: "http://localhost:8081/line_callback.php",
      },
      {
        source: "/line_login.php",
        destination: "http://localhost:8081/line_login.php",
      },
      {
        source: "/bind_line.php",
        destination: "http://localhost:8081/bind_line.php",
      },
      {
        source: "/login.php",
        destination: "http://localhost:8081/login.php",
      },
      {
        source: "/logout.php",
        destination: "http://localhost:8081/logout.php",
      },
      // รูปอัปโหลด (avatar, รูปซ่อม) — เสิร์ฟจาก IIS (8081) ให้แสดงใน PWA ได้ทันที
      {
        source: "/uploads/:path*",
        destination: "http://localhost:8081/uploads/:path*",
      },
    ];
  },
};

export default nextConfig;
