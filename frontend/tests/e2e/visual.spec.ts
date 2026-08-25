import { expect, test } from "@playwright/test";
import { e2eCreds, hasCreds } from "./creds";
const creds = e2eCreds();
import fs from "node:fs";
import path from "node:path";

/**
 * Visual regression harness — screenshots every key route.
 * Public routes always run. Dashboard routes require auth:
 *   set E2E_USERNAME / E2E_PASSWORD to enable (self-skips otherwise).
 *
 * Screenshots land in test-results/screenshots/<viewport>/<name>.png
 * Diff against a previous run manually or in CI artifacts.
 */

const SHOT_DIR = path.join("test-results", "screenshots");

const PUBLIC_ROUTES: Array<[string, string]> = [
  ["login", "/login"],
  ["repair-request-gate", "/repair-request"],
];

// Routes behind auth (v3 shell contract: PageShell h1 inside <main>)
const DASH_ROUTES: Array<[string, string]> = [
  ["dashboard", "/dashboard"],
  ["repair-list", "/repair"],
  ["repair-kanban", "/repair/kanban"],
  ["repair-tracking", "/repair/tracking"],
  ["repair-my-tasks", "/repair/my_tasks"],
  ["pm-am", "/pm_am"],
  ["pm-am-calendar", "/pm_am/calendar"],
  ["inspections", "/inspections"],
  ["asset-registry", "/asset_registry"],
  ["spare-parts", "/spare_parts"],
  ["issue-center", "/spare_parts/issue_center"],
  ["users", "/users"],
  ["roles", "/roles"],
  ["settings", "/settings"],
  ["settings-menus", "/settings/menus"],
  ["reports", "/reports"],
  ["analytics", "/analytics"],
  ["approval", "/approval"],
  ["notifications", "/notifications"],
  ["safety-work-permit", "/safety/work_permit"],
  ["calibration", "/calibration"],
  ["manuals", "/manuals"],
  ["suppliers", "/suppliers"],
  ["mtbf-mttr", "/mtbf_mttr"],
  ["iot-monitor", "/iot/monitor"],
  ["profile", "/profile"],
];

const VIEWPORTS = [
  { name: "mobile-360", width: 360, height: 740 },
  { name: "desktop-1280", width: 1280, height: 800 },
] as const;

async function shoot(
  page: import("@playwright/test").Page,
  name: string
): Promise<void> {
  const vp = page.viewportSize();
  const dir = path.join(SHOT_DIR, `vp${vp?.width ?? "?"}`);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

test.describe("public route screenshots", () => {
  for (const [name, route] of PUBLIC_ROUTES) {
    test(`shot ${name}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      // settle bind-state fetches (networkidle never fires on LIFF pages)
      await page.waitForTimeout(1_500);
      const body = page.locator("body");
      await expect(body).toBeVisible();
      await shoot(page, name);
    });
  }
});

test.describe("dashboard route screenshots", () => {
  test.skip(() =>
    !hasCreds(),
    "set E2E_USERNAME/E2E_PASSWORD to run"
  );

  let savedStorage: string | undefined;

  test.beforeAll(async ({ browser }) => {
    // log in once, persist session for the route loop
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByLabel(/ชื่อผู้ใช้|Username/i).fill(creds.username!);
    await page.getByLabel(/รหัสผ่าน|Password/i).fill(creds.password!);
    await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });
    savedStorage = JSON.stringify(await ctx.storageState());
    await ctx.close();
  });

  for (const [name, route] of DASH_ROUTES) {
    for (const vp of VIEWPORTS) {
      test(`shot ${name} @${vp.name}`, async ({ browser }) => {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          storageState: savedStorage ? JSON.parse(savedStorage) : undefined,
        });
        const page = await ctx.newPage();
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1_500);

        // v3 contract: every dashboard page renders <main>; fail loudly on crash UI
        await expect(page.locator("main")).toBeVisible();
        const crash = page.getByText(/Application error|Something went wrong/i);
        await expect(crash).toHaveCount(0);

        await shoot(page, name);
        await ctx.close();
      });
    }
  }
});
