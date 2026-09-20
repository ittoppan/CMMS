import { expect, test } from "@playwright/test";
import { e2eCreds, hasCreds } from "./creds";

/**
 * Sage Shipments E2E flow
 * 
 * Preconditions:
 * - Server running on :3001 (deploy.ps1)
 * - Credentials come from the e2e fixture (e2e_bot, Manager) or E2E_USERNAME/E2E_PASSWORD
 * - spare_issue_requests has at least one row with status='Approved' for testing
 *   (if empty, modal tests will skip gracefully)
 */

test.describe("sage shipments", () => {
  test.skip(() => !hasCreds(), "set E2E_USERNAME/E2E_PASSWORD to run");
  const creds = e2eCreds() as { username: string; password: string };

  async function login(page: any) {
    // Login via API and extract session cookie
    const res = await page.request.post("/api/login", {
      data: { username: creds.username, password: creds.password },
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!data.success) throw new Error(`API login failed: ${data.error ?? JSON.stringify(data)}`);

    // Extract cookies from response and set in browser context
    const cookies = res.headers()["set-cookie"];
    if (cookies) {
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      for (const c of cookieArray) {
        const [pair] = c.split(";");
        const [name, value] = pair.split("=");
        await page.context().addCookies([{ name: name.trim(), value: value.trim(), domain: "localhost", path: "/" }]);
      }
    }

    // Navigate to target page
    await page.goto("/spare_parts/sage_shipments");
    await page.waitForLoadState("networkidle");

    // Debug: check page content
    const html = await page.content();
    console.log("[DEBUG] Page HTML after login:", html.slice(0, 3000));
  }

  test.describe.configure({ retries: 0 });

  test("page loads and shows table", async ({ page }) => {
    await login(page);
    await page.goto("/spare_parts/sage_shipments");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("main h1")).toBeVisible();

    // Table should exist (even if empty). ถ้าไม่มีใบเบิกที่อนุมัติ ระบบแสดง empty-state
    // ("ไม่พบรายการที่ต้องตัดใน Sage 300") แทน <table> — ยอมรับทั้งสองสถานะ
    const table = page.locator("table");
    const emptyState = page.locator('text="ไม่พบรายการที่ต้องตัดใน Sage 300"');
    const hasTable = await table.count();
    if (hasTable > 0) {
      await expect(table).toBeVisible();
      await expect(page.locator("thead")).toBeVisible();
    } else {
      await expect(emptyState).toBeVisible();
    }
  });

  test("request status update modal opens and submits", async ({ page }) => {
    test.skip(!hasCreds(), "needs credentials");
    await login(page);
    await page.goto("/spare_parts/sage_shipments");

    // Find first row with "อัปเดต" button (request-level)
    const updateBtn = page.locator('button:has-text("อัปเดต")').first();
    const rowCount = await updateBtn.count();
    if (rowCount === 0) {
      test.skip(true, "no requests available to test");
    }

    await expect(updateBtn).toBeVisible();
    await updateBtn.click();

    // Modal should open
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('h2:has-text("เลขที่ Shipment")')).toBeVisible();

    // Fill shipment number
    const input = page.locator('[role="dialog"] input[type="text"]').first();
    await input.fill("SHP-TEST-001");

    // Submit
    await page.locator('[role="dialog"] button:has-text("บันทึก")').first().click();

    // Modal should close, toast should appear
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('.cmms-toast:has-text("อัปเดตสถานะ Sage 300 เรียบร้อย")')).toBeVisible({ timeout: 10_000 });
  });

  test("item qty + shipment modal chain works", async ({ page }) => {
    test.skip(!hasCreds(), "needs credentials");
    await login(page);
    await page.goto("/spare_parts/sage_shipments");

    // Find first expandable row with items
    const expandBtn = page.locator('button[aria-label="ขยาย"]').first();
    const expandCount = await expandBtn.count();
    if (expandCount === 0) {
      test.skip(true, "no expandable rows available");
    }

    await expandBtn.click();
    await expect(page.locator("tbody tr")).toContainText("ตัด"); // item row visible

    // Click "ตัด" on first item
    const cutBtn = page.locator('button:has-text("ตัด")').first();
    const cutCount = await cutBtn.count();
    if (cutCount === 0) {
      test.skip(true, "no items available to cut");
    }

    await cutBtn.click();

    // Step 1: item-qty modal
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('h2:has-text("จำนวนที่ตัด")')).toBeVisible();

    const qtyInput = page.locator('[role="dialog"] input[type="number"]').first();
    await qtyInput.fill("1");

    await page.locator('[role="dialog"] button:has-text("ถัดไป")').first().click();

    // Step 2: item-shipment modal
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('h2:has-text("เลขที่ Shipment")')).toBeVisible();

    const shipmentInput = page.locator('[role="dialog"] input[type="text"]').first();
    await shipmentInput.fill("SHP-ITEM-001");

    await page.locator('[role="dialog"] button:has-text("บันทึก")').first().click();

    // Modal should close, toast should appear
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('.cmms-toast:has-text("อัปเดตรายการ Sage 300 เรียบร้อย")')).toBeVisible({ timeout: 10_000 });
  });
});