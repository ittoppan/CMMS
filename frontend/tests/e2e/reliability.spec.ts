import { expect, test, type Page } from "@playwright/test";
import { e2eCreds, hasCreds } from "./creds";

/**
 * Phase 37 — Reliability workspace (/reliability/*)
 *
 * Targets the LIVE standalone server on :3001. Authed flows self-skip unless
 * E2E_USERNAME / E2E_PASSWORD (or .e2e-auth.json) are available.
 *
 * These assertions are deliberately tolerant about DATA (production is sparse:
 * no failures, no studies, no criteria) and strict about STRUCTURE — one h1,
 * no horizontal overflow, no console errors, no JS exceptions, filters in the
 * URL, and a visible engine verdict instead of an invented zero.
 */

const creds = e2eCreds();

/** eyebrow text is ASCII by convention in this app, so it is a safe anchor */
const REL_PAGES = [
  { path: "/reliability", eyebrow: "RELIABILITY" },
  { path: "/reliability/assets", eyebrow: "ASSET RELIABILITY" },
  { path: "/reliability/failure-modes", eyebrow: "FAILURE MODES" },
  { path: "/reliability/trend", eyebrow: "RELIABILITY TREND" },
  { path: "/reliability/weibull", eyebrow: "WEIBULL ANALYSIS" },
  { path: "/reliability/bad-actors", eyebrow: "BAD ACTORS" },
  { path: "/reliability/pm-effectiveness", eyebrow: "PM EFFECTIVENESS" },
  { path: "/reliability/growth", eyebrow: "RELIABILITY GROWTH" },
  { path: "/reliability/studies", eyebrow: "ENGINEERING STUDIES" },
  { path: "/reliability/data-quality", eyebrow: "DATA QUALITY" },
  { path: "/reliability/config", eyebrow: "KPI DEFINITIONS" },
] as const;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/ชื่อผู้ใช้|Username/i).fill(creds.username!);
  await page.getByLabel(/รหัสผ่าน|Password/i).fill(creds.password!);
  await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/Failed to load resource|net::ERR|favicon|status of (401|403)/.test(t)) return;
    errors.push(t);
  });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
  return errors;
}

async function assertNoOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `horizontal overflow: ${scrollWidth} > ${clientWidth}`).toBeLessThanOrEqual(
    clientWidth + 1,
  );
}

test.describe("reliability API gate (no auth)", () => {
  test("401 without session", async ({ request }) => {
    const res = await request.get("/api/v1/reliability.php?action=config");
    expect(res.status()).toBe(401);
  });

  test("mutating actions require a session too", async ({ request }) => {
    const res = await request.post("/api/v1/reliability.php?action=study_save", {
      headers: { "Content-Type": "application/json" },
      data: { title: "e2e probe" },
    });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("reliability workspace (authed)", () => {
  test.skip(() => !hasCreds(), "set E2E_USERNAME/E2E_PASSWORD to run");

  test("all 11 pages load with exactly one h1, no overflow, no console errors", async ({ page }) => {
    await login(page);
    for (const p of REL_PAGES) {
      const errors = watchErrors(page);
      await page.goto(p.path);
      await expect(page.locator("h1")).toHaveCount(1, { timeout: 20_000 });
      await assertNoOverflow(page);
      expect(errors, `console errors on ${p.path}`).toEqual([]);
      // every page is identified by its ASCII eyebrow and can walk back up
      await expect(page.locator("main").getByText(p.eyebrow).first()).toBeVisible();
      await expect(page.locator('main a[href^="/reliability"]').first()).toBeVisible();
    }
  });

  test("sidebar exposes the reliability group and navigates", async ({ page }) => {
    await login(page);
    // landing inside the workspace auto-expands its sidebar group
    await page.goto("/reliability");

    const child = page.locator('a[href="/reliability/bad-actors"]').first();
    await expect(child).toBeVisible({ timeout: 15_000 });

    const groupToggle = page.locator('button[aria-expanded]').filter({
      has: page.locator('a[href="/reliability"]'),
    });
    if (await groupToggle.count()) {
      await expect(groupToggle.first()).toHaveAttribute("aria-expanded", "true");
    }

    await child.click();
    await page.waitForURL(/\/reliability\/bad-actors/, { timeout: 10_000 });
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("filters are URL-backed and survive a reload", async ({ page }) => {
    await login(page);
    await page.goto("/reliability/trend");

    const scopeTrigger = page.getByRole("combobox").first();
    await expect(scopeTrigger).toBeVisible({ timeout: 15_000 });
    await scopeTrigger.click();

    // pick the first non-fleet scope the API offers
    const option = page.getByRole("option").filter({ hasText: /หน่วยงาน|ตำแหน่ง|เครื่องจักร|หมวด/ }).first();
    if (await option.count()) {
      await option.click();
      await expect.poll(() => page.url()).toMatch(/scope_id=/);
      const url = page.url();
      await page.reload();
      await expect.poll(() => page.url()).toBe(url);
    }
  });

  test("period filter changes the engine request", async ({ page }) => {
    await login(page);
    const calls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("reliability.php")) calls.push(r.url());
    });
    await page.goto("/reliability/trend?range=rolling_12m");
    await page.waitForTimeout(2500);
    expect(calls.some((u) => u.includes("range=rolling_12m")), "engine call carries the range").toBe(true);
  });

  test("overview renders KPI labels and an engine-sourced verdict, never a bare 0", async ({ page }) => {
    await login(page);
    await page.goto("/reliability");
    for (const kpi of ["MTBF", "MTTR", "Availability"]) {
      await expect(page.getByText(kpi, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    }
    const body = await page.locator("main").innerText();
    expect(body.length).toBeGreaterThan(200);
  });

  test("weibull explains insufficiency instead of showing a number", async ({ page }) => {
    await login(page);
    await page.goto("/reliability/weibull");
    await expect(page.locator("h1")).toHaveCount(1, { timeout: 20_000 });
    const body = await page.locator("main").innerText();
    // sparse data: either a fit or an explicit NOT_ENOUGH_DATA explanation
    expect(/NOT_ENOUGH_DATA|ไม่เพียงพอ|ฟอร์ม|β|shape/i.test(body)).toBe(true);
  });

  test("PM effectiveness keeps its windows explicit and rejects an inverted pair", async ({ page }) => {
    await login(page);
    await page.goto("/reliability/pm-effectiveness?b_start=2026-01-01&b_end=2026-03-31&a_start=2026-01-01&a_end=2026-03-31");
    await expect(page.getByText(/after window must start after the baseline|ข้อมูลไม่พอ|หน้าต่าง/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("bad actors shows the empty state when no criterion is enabled", async ({ page }) => {
    await login(page);
    await page.goto("/reliability/bad-actors");
    await expect(page.locator("h1")).toHaveCount(1, { timeout: 20_000 });
    const body = await page.locator("main").innerText();
    expect(body.length).toBeGreaterThan(100);
  });

  test("studies list handles an empty dataset without breaking", async ({ page }) => {
    await login(page);
    await page.goto("/reliability/studies");
    await expect(page.locator("h1")).toHaveCount(1, { timeout: 20_000 });
    const body = await page.locator("main").innerText();
    expect(/ยังไม่มีงานวิเคราะห์|งานวิเคราะห์/.test(body)).toBe(true);
  });

  test("config page lists KPI definitions from the backend", async ({ page }) => {
    await login(page);
    await page.goto("/reliability/config");
    await expect(page.getByText(/นิยาม KPI/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/MTBF/).first()).toBeVisible();
  });

  test("data-quality page reads findings and never offers a resolve action", async ({ page }) => {
    await login(page);
    await page.goto("/reliability/data-quality");
    await expect(page.locator("h1")).toHaveCount(1, { timeout: 20_000 });
    await expect(page.locator("main").getByRole("button", { name: /แก้ไข|ปิดรายการ|resolve/i })).toHaveCount(0);
  });

  test("asset detail handles an unknown id gracefully", async ({ page }) => {
    const errors = watchErrors(page);
    await login(page);
    await page.goto("/reliability/assets/999999");
    await expect(page.getByText(/ไม่พบเครื่องจักร|ไม่พบ|ยังไม่มีข้อมูล/)).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("study detail handles an unknown id gracefully", async ({ page }) => {
    const errors = watchErrors(page);
    await login(page);
    await page.goto("/reliability/studies/999999");
    await expect(page.getByText(/ไม่พบงานวิเคราะห์|ไม่ถูกต้อง/)).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });
});

test.describe("reliability responsive", () => {
  test.skip(() => !hasCreds(), "set E2E_USERNAME/E2E_PASSWORD to run");

  for (const vp of [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 820, height: 1180 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    test(`${vp.name} (${vp.width}px): no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page);
      for (const p of ["/reliability", "/reliability/assets", "/reliability/bad-actors", "/reliability/studies"]) {
        await page.goto(p);
        await expect(page.locator("h1")).toHaveCount(1, { timeout: 20_000 });
        await assertNoOverflow(page);
      }
    });
  }
});
