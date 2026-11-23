import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { e2eCreds, hasCreds } from "./creds";

const creds = { get username() { return e2eCreds().username; }, get password() { return e2eCreds().password; } };

const LEVEL1 = [
  "/dashboard/wallboard",
  "/supervisor",
  "/dashboard/backlog-aging",
  "/dashboard/pm-compliance",
  "/reports/downtime",
  "/dashboard/my",
];

async function login(page: any) {
  await page.goto("/login");
  const userBox = page.getByRole("textbox", { name: /ชื่อผู้ใช้|Username/i });
  const passBox = page.getByRole("textbox", { name: /รหัสผ่าน|Password/i });
  let filled = false;
  for (let i = 0; i < 20 && !filled; i++) {
    await userBox.fill(creds.username!);
    await passBox.fill(creds.password!);
    await page.waitForTimeout(400);
    filled = (await userBox.inputValue()) === creds.username && (await passBox.inputValue()) === creds.password;
  }
  await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();
  await page.waitForURL((u: URL) => !u.pathname.includes("/login"), { timeout: 15_000 });
}

test.describe("baseline level1", () => {
  test.skip(() => !hasCreds(), "needs creds");
  for (const url of LEVEL1) {
    test(`baseline ${url}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await login(page);
      await page.goto(url);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(2000);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      const axe = await new AxeBuilder({ page }).analyze();
      const counts: Record<string, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
      for (const v of axe.violations) {
        const imp = v.impact || "minor";
        if (counts[imp] !== undefined) counts[imp]++;
        else counts.minor++;
      }
      console.log(`BASELINE ${url} overflow=${overflow} axe=${JSON.stringify(counts)} rules=${axe.violations.map(v => v.id).join(",")}`);
      expect(counts.critical).toBe(0);
      const strict = ["/dashboard/backlog-aging", "/dashboard/my"].includes(url);
      if (strict) expect(counts.serious).toBe(0);
    });
  }
});