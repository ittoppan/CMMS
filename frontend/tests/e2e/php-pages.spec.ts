import { test, expect } from "@playwright/test";

/**
 * php-pages.spec.ts — legacy PHP pages are RETIRED stubs (302 → Next.js canonical)
 *
 * สถาปัตยกรรม 2026-10-17: Next.js UI (frontend/app) คือ UI หลัก 100%
 * หน้า PHP ทั้งหมดที่เหลืออยู่ไว้เพื่อรองรับ bookmark/ลิงก์เก่า โดยส่ง 302 ไปหน้า
 * Next.js ที่เทียบเท่า (src/includes/gone_next.php)
 *
 * spec นี้จึง assert แผนที่ redirect ตรงตาม contract:
 *   1. HTTP status = 302 (ไม่ 404/500)
 *   2. Location → canonical :3001 path ที่ถูกต้อง พร้อม query string ที่คงมาด้วย
 */

const NEXTJS_PORT = process.env.NEXTJS_PORT || "3001";
const NEXT_BASE = `http://localhost:${NEXTJS_PORT}`;
const PHP_BASE = process.env.E2E_PHP_BASE_URL ?? "http://localhost:8081";

const STUB_MAP: Array<[string, string]> = [
  ["/index.php", "/dashboard"],
  ["/pages/repair/index.php", "/repair"],
  ["/pages/repair/view.php?id=1", "/repair/view?id=1"],
  ["/pages/pm_am/index.php", "/pm_am"],
  ["/pages/spare_parts/index.php", "/spare_parts"],
  ["/pages/users/index.php", "/users"],
  ["/pages/settings/departments.php", "/settings/master/departments"],
  ["/pages/settings/locations.php", "/settings/master/locations"],
  ["/pages/calibration/history.php", "/calibration/tracking"],
  ["/pages/analytics/oee.php", "/asset_registry/oee"],
];

for (const [phpPath, canonicalPath] of STUB_MAP) {
  test(`stub ${phpPath} → ${canonicalPath}`, async ({ request }) => {
    const res = await request.get(`${PHP_BASE}${phpPath}`, { maxRedirects: 0 });
    const loc = res.headers().location ?? "";
    expect.soft(res.status(), `${phpPath}: expect 302 (got ${res.status()})`).toBe(302);
    expect
      .soft(loc, `${phpPath}: Location must point to canonical Next route`)
      .toBe(`${NEXT_BASE}${canonicalPath}`);
  });
}
