import { expect, test } from "@playwright/test";

/**
 * Smoke specs that work WITHOUT credentials.
 * Server must be running on :3001 (deploy.ps1).
 */

test.describe("public pages render", () => {
  test("/login renders the auth form", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);

    // Kit <Input label> renders a linked <label><input> pair
    const user = page.getByLabel(/ชื่อผู้ใช้|Username/i);
    const pass = page.getByLabel(/รหัสผ่าน|Password/i);
    await expect(user).toBeVisible();
    await expect(pass).toBeVisible();

    // primary submit button exists and is enabled before typing
    const submit = page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first();
    await expect(submit).toBeVisible();
    await expect(submit).toBeEnabled();
  });

  test("auth guard: unauthenticated /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/(login|$)/, { timeout: 10_000 });
    await expect(page).toHaveURL(/login|\/$/);
  });

  test("/repair-request (LIFF form) shows auth gate when unauthenticated", async ({ page }) => {
    // /repair-request redirects to /repair/request (canonical LIFF endpoint).
    // Outside LINE, without a session, the form gates behind identity choice:
    // webchoice -> User/Password or LINE login. Assert that gate renders.
    await page.goto("/repair-request");
    await expect(page).toHaveURL(/\/repair\/request/);
    await expect(page.getByRole("button", { name: /User\s*\/\s*Password/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /LINE/i }).first()).toBeVisible();
  });

  test("health: no server 5xx on key public assets", async ({ request }) => {
    for (const path of ["/logo.png", "/manifest.webmanifest"]) {
      const res = await request.get(path);
      expect(res.status(), `${path} should not 5xx`).toBeLessThan(500);
    }
  });
});

/**
 * Authenticated happy path — ENABLE by setting env:
 *   E2E_USERNAME=<real user>  E2E_PASSWORD=<password>
 */
test.describe("authenticated flow", () => {
  test.skip(
    !process.env.E2E_USERNAME || !process.env.E2E_PASSWORD,
    "set E2E_USERNAME/E2E_PASSWORD to run"
  );

  test("login → dashboard shell visible", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/ชื่อผู้ใช้|Username/i).fill(process.env.E2E_USERNAME!);
    await page.getByLabel(/รหัสผ่าน|Password/i).fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();

    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });

    // v3 shell marks the app: brand text in sidebar/topbar + main content region
    await expect(page.getByText("CMMS-TOPPAN").first()).toBeVisible();
  });

  test("repair module list loads after login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/ชื่อผู้ใช้|Username/i).fill(process.env.E2E_USERNAME!);
    await page.getByLabel(/รหัสผ่าน|Password/i).fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });

    await page.goto("/repair");
    await expect(page.locator("main")).toBeVisible();
    // PageShell h1 present (v3 layout contract)
    await expect(page.locator("main h1")).toBeVisible();
  });
});
