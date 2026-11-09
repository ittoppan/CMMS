import { expect, test } from "@playwright/test";
import { e2eCreds, hasCreds } from "./creds";
const creds = e2eCreds();
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

// PHP legacy pages are retired 302 stubs — dark shots target the canonical Next.js routes instead
const PHP_PAGES: Array<[string, string]> = [
  ["repair-index", "/repair"],
  ["departments", "/settings/master/departments"],
  ["dashboard-php", "/dashboard"],
];

test.describe.configure({ mode: "serial" });

test.use({
  colorScheme: "dark",
});

let savedStorage: string | undefined;

test.beforeAll(async ({ browser }) => {
  test.skip(!hasCreds(), "needs creds");
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => localStorage.setItem("theme", "dark"));
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByRole("textbox", { name: /ชื่อผู้ใช้|Username/i }).fill(creds.username!);
  await page.getByRole("textbox", { name: /รหัสผ่าน|Password/i }).fill(creds.password!);
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
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_500);
    await page.waitForSelector("#cmms-splash", { state: "detached", timeout: 8_000 }).catch(() => undefined);
    await expect(page.locator("main"), `Next.js canonical dark UI for ${name}`).toBeVisible();
    await shoot(page, `php-${name}`);
    await ctx.close();
  });
}
