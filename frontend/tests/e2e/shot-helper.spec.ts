import { test } from "@playwright/test";

const TARGET = process.env.SHOT_TARGET || "/pages/repair/request.php";
const OUT = process.env.SHOT_OUT || "test-results/shot.png";

test("screenshot " + TARGET, async ({ page }) => {
  // auth via PWA first (same host => session cookie covers :8081 too)
  if (process.env.E2E_USERNAME && process.env.E2E_PASSWORD) {
    await page.goto("/login");
    await page.getByLabel(/ชื่อผู้ใช้|Username/i).fill(process.env.E2E_USERNAME!);
    await page.getByLabel(/รหัสผ่าน|Password/i).fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });
  }
  await page.goto(`http://localhost:8081${TARGET}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const el = page.locator("#shot-element");
  if (await el.count()) {
    await el.scrollIntoViewIfNeeded();
    await el.screenshot({ path: OUT });
  } else {
    await page.screenshot({ path: OUT, fullPage: true });
  }
});
