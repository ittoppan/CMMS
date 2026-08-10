import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // TODO: Remove after all Astryx prop-name fixes are complete
    ignoreBuildErrors: true,
  },
  output: "standalone",
  turbopack: {
    // Fix: Next.js inferred the workspace root from the parent package-lock.json
    // (C:\inetpub\wwwroot\cmms-tpt), which broke the standalone static-file copy.
    root: __dirname,
  },
  transpilePackages: ["@astryxdesign/core", "@astryxdesign/theme-neutral"],
  // Allow ngrok and local IPs for HMR
  allowedDevOrigins: ["192.168.1.9", "ommatophorous-robert-fortifyingly.ngrok-free.app"],
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
