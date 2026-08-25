import { test } from "@playwright/test";

const TARGET = process.env.SHOT_TARGET || "/pages/repair/request.php";
const OUT = process.env.SHOT_OUT || "test-results/request-before.png";

test("screenshot " + TARGET, async ({ page }) => {
  await page.goto(`http://localhost:8081${TARGET}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500); // fonts + LIFF splash settle
  await page.screenshot({ path: OUT, fullPage: true });
});
