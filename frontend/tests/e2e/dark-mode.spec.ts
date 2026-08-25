import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Dark-mode visual pass — localStorage.theme=dark via addInitScript
 * works for BOTH stacks (PHP engine + next-themes share the key).
 */

const SHOT_DIR = path.join("test-results", "screenshots-dark");

const DASH: Array<[string, string]> = [
  ["dashboard", "/dashboard"],
  ["repair-list", "/repair"],
  ["pm-am", "/pm_am"],
  ["issue-center", "/spare_parts/issue_center"],
  ["settings", "/settings"],
  ["users", "/users"],
];

const PHP_PAGES: Array<[string, string]> = [
  ["repair-index", "/pages/repair/index.php"],
  ["departments", "/pages/settings/departments.php"],
  ["dashboard-php", "/index.php"],
];

test.describe.configure({ mode: "serial" });

test.use({
  colorScheme: "dark",
});

let savedStorage: string | undefined;

test.beforeAll(async ({ browser }) => {
  test.skip(!process.env.E2E_USERNAME || !process.env.E2E_PASSWORD, "needs creds");
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => localStorage.setItem("theme", "dark"));
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel(/ชื่อผู้ใช้|Username/i).fill(process.env.E2E_USERNAME!);
  await page.getByLabel(/รหัสผ่าน|Password/i).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });
  savedStorage = JSON.stringify(await ctx.storageState());
  await ctx.close();
});

function shoot(page: import("@playwright/test").Page, name: string): void {
  const dir = path.join(SHOT_DIR, "dark");
  fs.mkdirSync(dir, { recursive: true });
  return void page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

for (const [name, route] of DASH) {
  test(`dark ${name}`, async ({ browser }) => {
    const ctx = await browser.newContext({
      colorScheme: "dark",
      storageState: savedStorage ? JSON.parse(savedStorage) : undefined,
    });
    await ctx.addInitScript(() => localStorage.setItem("theme", "dark"));
    const page = await ctx.newPage();
    await page.goto(route, { waitUntil: "domcontentloaded" });
    // splash fades after window load (+250ms, 5s safety) — wait for it to detach
    await page.waitForSelector("#cmms-splash", { state: "detached", timeout: 8_000 }).catch(() => undefined);
    await expect(page.locator("main")).toBeVisible();
    await shoot(page, name);
    await ctx.close();
  });
}

for (const [name, url] of PHP_PAGES) {
  test(`dark php ${name}`, async ({ browser }) => {
    const ctx = await browser.newContext({
      colorScheme: "dark",
      storageState: savedStorage ? JSON.parse(savedStorage) : undefined,
    });
    await ctx.addInitScript(() => localStorage.setItem("theme", "dark"));
    const page = await ctx.newPage();
    await page.goto(`http://localhost:8081${url}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_500);
    const body = await page.content();
    expect(/Fatal error|Parse error/.test(body), `fatal in ${url}`).toBeFalsy();
    await shoot(page, `php-${name}`);
    await ctx.close();
  });
}
