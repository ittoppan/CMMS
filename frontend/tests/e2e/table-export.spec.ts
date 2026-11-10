import { expect, test } from "@playwright/test";
import { e2eCreds, hasCreds } from "./creds";

/**
 * DataTable shared features:
 *  - เลือกแถว → toolbar แสดงจำนวน + bulk action
 *  - "ส่งออก CSV" ดาวน์โหลดทุกแถวหลังตัวกรอง (ไม่ใช่แค่หน้าปัจจุบัน)
 */

async function login(page: import("@playwright/test").Page) {
  const creds = e2eCreds();
  await page.goto("/login");
  const user = page.getByRole("textbox", { name: /ชื่อผู้ใช้|Username/i });
  const pass = page.getByRole("textbox", { name: /รหัสผ่าน|Password/i });
  for (let i = 0, filled = false; i < 20 && !filled; i++) {
    await user.fill(creds.username!);
    await pass.fill(creds.password!);
    await page.waitForTimeout(400);
    filled = (await user.inputValue()) === creds.username && (await pass.inputValue()) === creds.password;
  }
  await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
}

test.describe("DataTable: เลือกแถว + ส่งออก CSV", () => {
  test.skip(!hasCreds(), "requires E2E_USERNAME/E2E_PASSWORD");

  test("เลือกแถวแล้วเห็น toolbar และ bulk action ทำงาน", async ({ page }) => {
    await login(page);
    await page.goto("/pm_am");
    await expect(page.getByRole("table")).toBeVisible({ timeout: 20_000 });

    const rowCheckboxes = page.locator("tbody input[type=checkbox], tbody [role=checkbox]");
    await rowCheckboxes.first().click();

    await expect(page.getByText(/เลือกแล้ว 1 รายการ/)).toBeVisible();

    // ล้างที่เลือก → toolbar หาย
    await page.getByRole("button", { name: /ล้างที่เลือก/ }).click();
    await expect(page.getByText(/เลือกแล้ว/)).toHaveCount(0);

    // เลือกใหม่ + รัน bulk action → ทำงานและล้าง selection เอง
    await rowCheckboxes.first().click();
    await page.getByRole("button", { name: /คัดลอกเลข PM/ }).click();
    await expect(page.getByRole("status")).toContainText(/คัดลอกแล้ว 1 รายการ|ไม่อนุญาต/);
    await expect(page.getByText(/เลือกแล้ว/)).toHaveCount(0);
  });

  test("ส่งออก CSV ได้ไฟล์ที่มีหัวคอลัมน์ภาษาไทย", async ({ page }) => {
    await login(page);
    await page.goto("/pm_am");
    await expect(page.getByRole("table")).toBeVisible({ timeout: 20_000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await page.getByRole("button", { name: /ส่งออก CSV/ }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^pm-am-plans-\d{4}-\d{2}-\d{2}\.csv$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const csv = Buffer.concat(chunks).toString("utf8");
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM → Excel อ่านไทยถูก
    expect(csv).toContain("เลขที่ PM");
    expect(csv.split("\r\n").length).toBeGreaterThan(1);
  });
});
