import { expect, test } from "@playwright/test";

const VIEWER_CREDS = { username: "e2e_viewer", password: "Test@Cmms2026" };
const OFFICER_READ_CREDS = { username: "e2e_officer_read", password: "Test@Cmms2026" };
const OPERATE_CREDS = { username: "e2e_operate", password: "Test@Cmms2026" };

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

async function postWithCsrf(page: any, url: string, data: any) {
  const csrf = await getCsrf(page);
  return page.request.post(url, {
    data,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
  });
}

test.describe("phase2: dashboard write permissions", () => {
  test("Viewer POST -> 403 on all 3 endpoints", async ({ page }) => {
    await login(page, VIEWER_CREDS.username, VIEWER_CREDS.password);
    const cases = [
      ["/api/v1/shift_handover.php", { shift_date: "2026-01-01" }],
      ["/api/v1/utility_energy.php", { utility_type: "electricity", reading_date: "2026-01-01", value: 1 }],
      ["/api/v1/lubrication.php", { action: "add_point", name: "t" }],
    ];
    for (const [url, data] of cases) {
      const res = await postWithCsrf(page, url as string, data);
      expect(res.status()).toBe(403);
    }
  });

  test("Officer-Read POST -> 403 on all 3 endpoints", async ({ page }) => {
    await login(page, OFFICER_READ_CREDS.username, OFFICER_READ_CREDS.password);
    const cases = [
      ["/api/v1/shift_handover.php", { shift_date: "2026-01-01" }],
      ["/api/v1/utility_energy.php", { utility_type: "electricity", reading_date: "2026-01-01", value: 1 }],
      ["/api/v1/lubrication.php", { action: "add_point", name: "t" }],
    ];
    for (const [url, data] of cases) {
      const res = await postWithCsrf(page, url as string, data);
      expect(res.status()).toBe(403);
    }
  });

  test("Operate POST -> success on all 3 endpoints", async ({ page }) => {
    await login(page, OPERATE_CREDS.username, OPERATE_CREDS.password);
    const r1 = await postWithCsrf(page, "/api/v1/shift_handover.php", { shift_date: "2026-01-01", shift_code: "day" });
    expect(r1.ok()).toBeTruthy();
    const r2 = await postWithCsrf(page, "/api/v1/utility_energy.php", { utility_type: "electricity", reading_date: "2026-01-01", value: 1 });
    expect(r2.ok()).toBeTruthy();
    const r3 = await postWithCsrf(page, "/api/v1/lubrication.php", { action: "add_point", name: "e2e point", interval_days: 30 });
    expect(r3.ok()).toBeTruthy();
  });
});