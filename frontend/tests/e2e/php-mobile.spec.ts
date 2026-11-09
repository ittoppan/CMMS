import { test, expect } from "@playwright/test";

/**
 * php-mobile.spec.ts — PHP pages were RETIRED (302 stubs → Next.js)
 *
 * เดิม spec นี้วัด horizontal overflow ของหน้า PHP ที่ 360px (Redesign Plan Step 2)
 * ตอนนี้หน้าเหล่านั้นไม่มี HTML เหลืออยู่ (302 ไปหน้า Next.js ทันที)
 * mobile layout ของหน้า canonical ทุกหน้าถูก cover โดย responsive.spec.ts (390px)
 * + visual regression harness — ที่นี่จึงเหลือแค่ assert ว่า stub ยังทำหน้าที่
 * redirect ถูกต้อง ไม่มีรายงาน error รั่วไหนมา javax_IIS
 */
const PHP_BASE = process.env.E2E_PHP_BASE_URL ?? "http://localhost:8081";
const NEXTJS_PORT = process.env.NEXTJS_PORT || "3001";

const STUB_ROUTES = [
  ["/index.php", "/dashboard"],
  ["/pages/repair/index.php", "/repair"],
  ["/pages/pm_am/index.php", "/pm_am"],
  ["/pages/spare_parts/index.php", "/spare_parts"],
  ["/pages/users/index.php", "/users"],
  ["/pages/settings/departments.php", "/settings/master/departments"],
  ["/pages/settings/locations.php", "/settings/master/locations"],
  ["/pages/calibration/history.php", "/calibration/tracking"],
  ["/pages/analytics/oee.php", "/asset_registry/oee"],
] as const;

for (const [phpPath, canonicalPath] of STUB_ROUTES) {
  test(`mobile bookmark ${phpPath} lands on Next.js ${canonicalPath}`, async ({ request }) => {
    const res = await request.get(`${PHP_BASE}${phpPath}`, { maxRedirects: 0 });
    const loc = res.headers().location ?? "";
    expect
      .soft(
        `${res.status()} ${loc}`,
        `${phpPath} must 302 to http://localhost:${NEXTJS_PORT}${canonicalPath}`
      )
      .toBe(`302 http://localhost:${NEXTJS_PORT}${canonicalPath}`);
  });
}
