import { expect, test } from "@playwright/test";

/**
 * Role-based landing + full visible menu set + hidden routes.
 *
 * Dedicated E2E accounts:
 *   e2e_viewer        (role 5, Viewer)        -> landing /dashboard
 *   e2e_officer_read  (role 10, Officer-Read) -> landing /home
 */

const VIEWER_CREDS = { username: "e2e_viewer", password: process.env.E2E_PASSWORD! };
const OFFICER_READ_CREDS = { username: "e2e_officer_read", password: process.env.E2E_PASSWORD! };

// Full visible sidebar menu set for each role (derived from menu_permissions + sidebar-nav).
const VIEWER_VISIBLE = [
  "/analytics",
  "/analytics/advanced",
  "/analytics/intelligence",
  "/analytics/kpi",
  "/andon-board",
  "/dashboard",
  "/notifications",
  "/register",
  "/reports",
  "/reports/export_excel",
  "/reports/monthly_pdf",
];

const OFFICER_READ_VISIBLE = [
  "/asset_registry",
  "/calibration",
  "/calibration/certificates",
  "/calibration/data-quality",
  "/calibration/instruments",
  "/calibration/mobile",
  "/calibration/oot",
  "/calibration/plans",
  "/calibration/procedures",
  "/calibration/reports",
  "/calibration/schedule",
  "/calibration/standards",
  "/calibration/tracking",
  "/dashboard",
  "/documents",
  "/facility-layout",
  "/feedback",
  "/forms",
  "/inspections",
  "/inspections/templates",
  "/knowledge",
  "/knowledge/articles",
  "/knowledge/articles/create",
  "/knowledge/gaps",
  "/knowledge/reviews",
  "/knowledge/search",
  "/manuals",
  "/notifications",
  "/pm_am",
  "/pm_am/batch_schedule",
  "/pm_am/calendar",
  "/pm_am/create",
  "/qr-sheet",
  "/register",
  "/repair",
  "/repair/tracking",
  "/reports",
  "/reports/export_excel",
  "/reports/monthly_pdf",
  "/spare_parts",
  "/spare_parts/balances",
  "/spare_parts/issue_center",
  "/spare_parts/returns",
  "/spare_parts/stock_take",
];

async function login(page: import("@playwright/test").Page, username: string, password: string) {
  await page.goto("/login");
  const userBox = page.getByRole("textbox", { name: /ชื่อผู้ใช้|Username/i });
  const passBox = page.getByRole("textbox", { name: /รหัสผ่าน|Password/i });

  let filled = false;
  for (let i = 0; i < 20 && !filled; i++) {
    await userBox.fill(username);
    await passBox.fill(password);
    await page.waitForTimeout(400);
    filled = (await userBox.inputValue()) === username && (await passBox.inputValue()) === password;
  }
  await expect(userBox).toHaveValue(username);
  await expect(passBox).toHaveValue(password);

  await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });
}

/**
 * The desktop sidebar is a single-open accordion (only one section expanded at a
 * time), so each section must be opened and read separately.
 */
async function collectVisibleSidebarLinks(page: import("@playwright/test").Page): Promise<string[]> {
  const aside = page.locator("aside").first();
  const all = new Set<string>();

  const groupButtons = () =>
    aside.locator("button[aria-expanded]").filter({ hasNotText: /แสดงเพิ่มเติม|ย่อรายการ|show more|show less/i });

  const groupCount = await groupButtons().count();
  for (let i = 0; i < groupCount; i++) {
    const btn = groupButtons().nth(i);
    if ((await btn.getAttribute("aria-expanded")) !== "true") {
      await btn.click();
      await page.waitForTimeout(100);
    }

    // Reveal all secondary items in this section.
    while (true) {
      const more = aside.locator("button").filter({ hasText: /แสดงเพิ่มเติม|show more/i });
      if (await more.count() === 0) break;
      await more.first().click();
      await page.waitForTimeout(50);
    }

    const links = await aside.locator("a[href]").evaluateAll((els) =>
      els.map((e) => e.getAttribute("href") || "")
    );
    links.forEach((h) => {
      if (h) all.add(h);
    });
  }

  // Frequent-items block is always rendered; make sure it is captured too.
  const finalLinks = await aside.locator("a[href]").evaluateAll((els) =>
    els.map((e) => e.getAttribute("href") || "")
  );
  finalLinks.forEach((h) => {
    if (h) all.add(h);
  });

  return [...all].sort();
}

test.describe("role landing & menus: Viewer (e2e_viewer)", () => {
  test("lands on /dashboard, full visible menu set, hidden routes are 403", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, VIEWER_CREDS.username, VIEWER_CREDS.password);

    await expect(page).toHaveURL(/\/dashboard/);

    const visible = await collectVisibleSidebarLinks(page);
    expect(visible).toEqual(VIEWER_VISIBLE);

    for (const route of ["/asset_registry", "/repair/my_tasks", "/settings"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(/403|ไม่มีสิทธิ์/).first()).toBeVisible();
    }
  });
});

test.describe("role landing & menus: Officer-Read (e2e_officer_read)", () => {
  test("lands on /home, full visible menu set, hidden routes are 403", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, OFFICER_READ_CREDS.username, OFFICER_READ_CREDS.password);

    await expect(page).toHaveURL(/\/home/);

    const visible = await collectVisibleSidebarLinks(page);
    expect(visible).toEqual(OFFICER_READ_VISIBLE);

    for (const route of ["/repair/my_tasks", "/settings", "/users"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(/403|ไม่มีสิทธิ์/).first()).toBeVisible();
    }
  });
});