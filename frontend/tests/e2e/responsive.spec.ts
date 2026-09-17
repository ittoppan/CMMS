import { expect, test, type ConsoleMessage } from "@playwright/test";
import { e2eCreds, hasCreds } from "./creds";

/**
 * Responsive + accessibility smoke (Phase 20 QA)
 * - ไม่ให้เกิด horizontal scroll (overflow-X) ทั้ง mobile (390px) และ desktop (1440px)
 * - ทุกหน้า (หลัง login) ต้องมี h1 หน้าเดียวเท่านั้น — mobile app bar ต้องไม่ใช้ heading
 * - no console errors / pageerrors ระหว่าง navigate
 * - ต้องรันกับ LIVE server :3001 (deploy.ps1)
 */

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

function watchErrors(page: any, opts?: { ignoreHttpStatusArg?: boolean }) {
  const errors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() !== "error") return;
    const msg = m.text();
    // HTTP 401/403 ที่คาดไว้ (ยังไม่ login -> protected API ปฏิเสธ) => ข้าม เพื่อให้แยกจาก error จริง
    if (opts?.ignoreHttpStatusArg && /status of (401|403)\b/.test(msg)) return;
    errors.push(msg);
  });
  page.on("pageerror", (e: Error) => errors.push(`PAGEERROR: ${e.message}`));
  return errors;
}

async function assertNoHorizontalOverflow(page: any) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `horizontal overflow: scroll=${scrollWidth} client=${clientWidth}`).toBeLessThanOrEqual(
    clientWidth + 1
  );
}

async function assertSingleH1(page: any) {
  const count = await page.locator("h1").count();
  expect(count, `expected exactly one h1, got ${count}`).toBe(1);
}

test.describe("responsive layouts", () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name} (${vp.width}px): key public+protected pages have no overflow & no console errors`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const errors = watchErrors(page, { ignoreHttpStatusArg: true });

      // public page
      await page.goto("/login");
      await assertNoHorizontalOverflow(page);
      await expect(page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first()).toBeVisible();

      // protected pages redirect when unauthenticated
      await page.goto("/dashboard");
      await page.waitForURL(/\/(login|$)/, { timeout: 10_000 });

      expect(errors, `console errors on ${vp.name} for public pages`).toEqual([]);
    });
  }

  test("mobile app bar title must NOT be a heading (single h1 contract)", async ({ page }) => {
    test.skip(!hasCreds(), "requires E2E_USERNAME/E2E_PASSWORD");
    const creds = e2eCreds();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await page.getByLabel(/ชื่อผู้ใช้|Username/i).fill(creds.username!);
    await page.getByLabel(/รหัสผ่าน|Password/i).fill(creds.password!);
    await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });

    await assertSingleH1(page);
    const titleTag = await page
      .locator(".cmms-mobile-app-bar-title")
      .first()
      .evaluate((el) => el.tagName)
      .catch(() => null);
    expect(titleTag, "mobile app bar title tagName").not.toBe("H1");
  });

  test("authenticated pages: one h1 + no horizontal overflow at 390px", async ({ page }) => {
    test.skip(!hasCreds(), "requires E2E_USERNAME/E2E_PASSWORD");
    const creds = e2eCreds();
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = watchErrors(page);

    await page.goto("/login");
    await page.getByLabel(/ชื่อผู้ใช้|Username/i).fill(creds.username!);
    await page.getByLabel(/รหัสผ่าน|Password/i).fill(creds.password!);
    await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });

    for (const path of ["/dashboard", "/sync-center", "/repair", "/reports/report-center"]) {
      await page.goto(path);
      await page.locator("main").waitFor({ timeout: 15_000 });
      await assertSingleH1(page);
      await assertNoHorizontalOverflow(page);
    }

    expect(errors, "console errors on authenticated pages").toEqual([]);
  });
});

test.describe("health endpoint (public)", () => {
  test("GET /health returns ok JSON through the Next rewrite", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { status?: string; db?: string };
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
  });
});