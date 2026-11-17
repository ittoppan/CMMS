import { expect, test } from "@playwright/test";
import { e2eCreds, hasCreds } from "./creds";

/**
 * Sage Shipments E2E flow
 *
 * Preconditions:
 * - Server running on :3001 (deploy.ps1)
 * - Credentials come from the e2e fixture (e2e_bot, Manager) or E2E_USERNAME/E2E_PASSWORD
 * - มีใบเบิกที่อนุมัติแล้วอย่างน้อย 1 ใบ (globalSetup เติมผ่าน fixtures/seed-data.php)
 */

test.describe("sage shipments", () => {
  test.skip(() => !hasCreds(), "set E2E_USERNAME/E2E_PASSWORD to run");
  const creds = e2eCreds() as { username: string; password: string };

  async function login(page: import("@playwright/test").Page) {
    // Login via API and reuse the session cookie
    const res = await page.request.post("/api/login", {
      data: { username: creds.username, password: creds.password },
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!data.success) throw new Error(`API login failed: ${data.error ?? JSON.stringify(data)}`);

    const cookies = res.headers()["set-cookie"];
    if (cookies) {
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      for (const c of cookieArray) {
        const [pair] = c.split(";");
        const [name, value] = pair.split("=");
        await page.context().addCookies([{ name: name.trim(), value: value.trim(), domain: "localhost", path: "/" }]);
      }
    }

    await page.goto("/spare_parts/sage_shipments");
    await page.waitForLoadState("networkidle");
  }

  test.describe.configure({ retries: 0 });

  test("page loads and shows table", async ({ page }) => {
    await login(page);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("main h1")).toBeVisible();

    // ถ้าไม่มีใบเบิกที่อนุมัติ ระบบแสดง empty-state ("ไม่พบรายการที่ต้องตัดใน Sage 300")
    const table = page.locator("table");
    const emptyState = page.getByText("ไม่พบรายการที่ต้องตัดใน Sage 300");
    if ((await table.count()) > 0) {
      await expect(table.first()).toBeVisible();
      await expect(page.locator("thead").first()).toBeVisible();
    } else {
      await expect(emptyState).toBeVisible();
    }
  });

  test("request-level status update (เลขที่ Shipment) submits", async ({ page }) => {
    await login(page);

    const row = page
      .locator("tbody tr")
      .filter({ hasText: /SIR-\d{6}/ })
      .first();
    if ((await row.count()) === 0) test.skip(true, "no spare-issue request seeded");

    // Manager มีสิทธิ์ sage:write → ปุ่มระดับใบเบิกคือ ตัดบางส่วน / ตัดครบ
    const partialBtn = row.getByRole("button", { name: /ตัดบางส่วน/ });
    if ((await partialBtn.count()) === 0) test.skip(true, "role cannot write Sage shipments");

    await partialBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("h2")).toContainText("เลขที่ Shipment");

    await dialog.locator('input[type="text"], input:not([type])').first().fill("SHP-E2E-001");
    await dialog.getByRole("button", { name: "บันทึก" }).click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.locator(".cmms-toast")).toContainText("อัปเดตสถานะ Sage 300 เรียบร้อย", {
      timeout: 10_000,
    });
  });

  test("item qty → shipment number modal chain works", async ({ page }) => {
    await login(page);

    const expandBtn = page.locator('button[aria-label="ขยาย"]').first();
    if ((await expandBtn.count()) === 0) test.skip(true, "no spare-issue request seeded");
    await expandBtn.click();

    const cutBtn = page.getByRole("button", { name: /^\s*ตัด\s*$/ }).first();
    if ((await cutBtn.count()) === 0) test.skip(true, "no remaining item to cut");
    await cutBtn.click();

    const dialog = page.locator('[role="dialog"]');

    // Step 1: จำนวนที่ตัด
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("h2")).toContainText("จำนวนที่ตัด");
    await dialog.locator('input[type="number"]').first().fill("1");
    await dialog.getByRole("button", { name: "ถัดไป" }).click();

    // Step 2: เลขที่ Shipment
    await expect(dialog.locator("h2")).toContainText("เลขที่ Shipment");
    await dialog.locator('input[type="text"], input:not([type])').first().fill("SHP-E2E-ITEM-001");
    await dialog.getByRole("button", { name: "บันทึก" }).click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.locator(".cmms-toast")).toContainText("อัปเดตรายการ Sage 300 เรียบร้อย", {
      timeout: 10_000,
    });
  });
});
