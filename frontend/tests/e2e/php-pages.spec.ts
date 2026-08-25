import { test, expect } from "@playwright/test";

/**
 * PHP-page smoke: reuse the PWA session cookie (same host, port 8081)
 * to fetch key server-rendered pages and assert they don't fatal.
 */
const PHP_PAGES = [
  "/pages/repair/index.php",
  "/pages/repair/view.php?id=1",
  "/pages/pm_am/index.php",
  "/pages/spare_parts/index.php",
  "/pages/users/index.php",
  "/pages/settings/departments.php",
  "/pages/settings/locations.php",
  "/pages/calibration/history.php",
  "/pages/analytics/oee.php",
  "/index.php",
];

test.describe.configure({ mode: "serial" });

let done = false;

test("php pages render without fatal errors", async ({ page }) => {
  test.skip(process.env.E2E_USERNAME === undefined || process.env.E2E_PASSWORD === undefined);
  await page.goto("/login");
  await page.getByLabel(/ชื่อผู้ใช้|Username/i).fill(process.env.E2E_USERNAME!);
  await page.getByLabel(/รหัสผ่าน|Password/i).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });

  const results: string[] = [];
  for (const p of PHP_PAGES) {
    const res = await page.request.get(`http://localhost:8081${p}`);
    const body = await res.text().catch(() => "");
    const fatal = /Fatal error|Parse error/.test(body);
    const warn = (body.match(/Warning:/g) || []).length;
    results.push(`${res.status()} fatal=${fatal ? "YES" : "no"} warn=${warn} ${p}`);
    expect.soft(res.status(), p).toBeLessThan(500);
    expect.soft(fatal, `fatal in ${p}`).toBeFalsy();
  }
  console.log("\n" + results.join("\n"));
});
