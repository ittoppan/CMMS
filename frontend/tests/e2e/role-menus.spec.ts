import { expect, test } from "@playwright/test";

/**
 * Role-based landing + visible menu items.
 *
 * Uses the dedicated test accounts created for E2E:
 *   e2e_viewer        (role 5, Viewer)        -> landing /dashboard
 *   e2e_officer_read  (role 10, Officer-Read) -> landing /home
 * Password (both): Test@Cmms2026
 */

const VIEWER_CREDS = { username: "e2e_viewer", password: "Test@Cmms2026" };
const OFFICER_READ_CREDS = { username: "e2e_officer_read", password: "Test@Cmms2026" };

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

test.describe("role landing & menus: Viewer (e2e_viewer)", () => {
  test("lands on /dashboard and shows viewer menus", async ({ page }) => {
    await login(page, VIEWER_CREDS.username, VIEWER_CREDS.password);

    await expect(page).toHaveURL(/\/dashboard/);

    // Viewer sees the dashboard entry point.
    await expect(page.getByRole("link", { name: /แดชบอร์ดภาพรวม/ }).first()).toBeVisible();

    // Viewer does not see asset registry (hidden for this role).
    await expect(page.getByRole("link", { name: /ทะเบียนเครื่องจักร/ })).toHaveCount(0);

    // Home launcher also reflects viewer-visible menus (and omits hidden ones).
    await page.goto("/home");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('a[href="/dashboard"]').first()).toBeVisible();
    await expect(page.locator('a[href="/analytics"]').first()).toBeVisible();
    await expect(page.locator('a[href="/asset_registry"]')).toHaveCount(0);
  });
});

test.describe("role landing & menus: Officer-Read (e2e_officer_read)", () => {
  test("lands on /home and shows officer-read menus", async ({ page }) => {
    await login(page, OFFICER_READ_CREDS.username, OFFICER_READ_CREDS.password);

    await expect(page).toHaveURL(/\/home/);

    // Officer-Read sees repair tracking (visible for this role).
    await expect(page.getByRole("link", { name: /ติดตามงานซ่อม/ }).first()).toBeVisible();

    // Officer-Read does not see "my tasks" (hidden for this role).
    await expect(page.getByRole("link", { name: /งานซ่อมของฉัน/ })).toHaveCount(0);

    // Home launcher (landing) reflects officer-read-visible menus.
    await expect(page.locator('a[href="/repair/tracking"]').first()).toBeVisible();
    await expect(page.locator('a[href="/pm_am"]').first()).toBeVisible();
    await expect(page.locator('a[href="/repair/my_tasks"]')).toHaveCount(0);
  });
});