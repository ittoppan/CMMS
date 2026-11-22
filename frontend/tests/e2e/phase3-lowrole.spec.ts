import { expect, test } from "@playwright/test";

const CREDS = [
  { name: "User", username: "e2e_user", password: process.env.E2E_PASSWORD! },
  { name: "Viewer", username: "e2e_viewer", password: process.env.E2E_PASSWORD! },
  { name: "Officer-Read", username: "e2e_officer_read", password: process.env.E2E_PASSWORD! },
];

const ENDPOINTS = [
  "/api/v1/users.php",
  "/api/v1/roles.php",
  "/api/v1/settings.php",
  "/api/v1/menu_permissions.php",
  "/api/v1/sage_sync.php",
  "/api/v1/import_excel.php",
];

async function getCsrf(page: any): Promise<string> {
  const res = await page.request.get("/api/v1/csrf.php");
  const json = await res.json().catch(() => ({}));
  return json?.csrf_token ?? "";
}

async function login(page: any, username: string, password: string) {
  await page.goto("/login");
  const userBox = page.getByRole("textbox", { name: /ชื่อผู้ใช้|Username/i });
  const passBox = page.getByRole("textbox", { name: /รหัสผ่าน|Password/i });
  for (let i = 0; i < 20; i++) {
    await userBox.fill(username);
    await passBox.fill(password);
    await page.waitForTimeout(200);
    if ((await userBox.inputValue()) === username && (await passBox.inputValue()) === password) break;
  }
  await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();
  await page.waitForURL((u: URL) => !u.pathname.includes("/login"), { timeout: 15_000 });
}

test.describe("phase3: low-role API writes blocked", () => {
  for (const c of CREDS) {
    test(`${c.name} POST -> 401/403 on admin endpoints`, async ({ page }) => {
      await login(page, c.username, c.password);
      const csrf = await getCsrf(page);
      for (const ep of ENDPOINTS) {
        const res = await page.request.post(ep, {
          data: {},
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        });
        expect([401, 403]).toContain(res.status());
      }
    });
  }
});