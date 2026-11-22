import { expect, test } from "@playwright/test";

/**
 * ขั้น 5 — ตัวดัก 401/403 (ApiFetchInterceptor) แบบไม่มี session:
 *  - /login รหัสผ่านผิด → เห็นข้อความของฟอร์ม ไม่ถูกเด้ง
 *  - /register ใช้งานได้
 *  - endpoint สาธารณะไม่ทำให้ redirect/toast 403 ผิดที่
 */

const PUBLIC_ENDPOINTS = [
  "/api/v1/health.php",
  "/api/v1/csrf.php",
  "/api/v1/settings.php",
  "/api/v1/asset_hub.php",
  "/api/v1/line_register.php",
  "/api/v1/my_repairs.php",
  "/api/v1/user_lookup.php",
];

test.describe("interceptor: ผู้ใช้ยังไม่ล็อกอิน (ขั้น 5)", () => {
  test("/login รหัสผ่านผิดเห็นข้อความของฟอร์มและไม่ถูกเด้ง", async ({ page }) => {
    await page.goto("/login");
    const userBox = page.getByRole("textbox", { name: /ชื่อผู้ใช้|Username/i });
    const passBox = page.getByRole("textbox", { name: /รหัสผ่าน|Password/i });
    await userBox.fill("e2e_probe_ghost");
    await passBox.fill("wrong-password-for-interceptor");
    await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();

    await expect(page.getByText(/ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง/)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("/register เปิดได้โดยไม่ถูกเด้งไป /login", async ({ page }) => {
    const res = await page.goto("/register");
    expect(res?.status() ?? 200).toBeLessThan(500);
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/register/);
  });

  test("endpoint สาธารณะบนหน้า /login ไม่ทำให้ redirect หรือ toast 403", async ({ page }) => {
    await page.goto("/login");
    const results = await page.evaluate(async (urls: string[]) => {
      const out: { url: string; status: number }[] = [];
      for (const u of urls) {
        try {
          const r = await fetch(u, { headers: { Accept: "application/json" } });
          out.push({ url: u, status: r.status });
        } catch {
          out.push({ url: u, status: -1 });
        }
      }
      return out;
    }, PUBLIC_ENDPOINTS);

    // endpoint สาธารณะห้ามตอบ 403 (จะทำให้เกิด toast) — และแม้ตอบ 401 ก็ห้ามพาไป /login
    for (const r of results) {
      expect(r.status, `${r.url} ต้องไม่ตอบ 403`).not.toBe(403);
    }
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้")).toHaveCount(0);
  });

  test("หน้าแจ้งซ่อมสาธารณะยังใช้งานได้โดยไม่ถูกเด้ง", async ({ page }) => {
    const res = await page.goto("/repair/request");
    expect(res?.status() ?? 200).toBeLessThan(500);
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/repair\/request/);
    await expect(page.getByText("คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้")).toHaveCount(0);
  });
});
