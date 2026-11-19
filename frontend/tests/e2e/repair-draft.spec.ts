import { expect, test, type Page } from "@playwright/test";

/**
 * ร่างฟอร์มแจ้งซ่อม (lib/repair-draft) — E2E
 *
 * 1) กรอกฟอร์ม → reload → ร่างถูกกู้คืน (ขั้นเดิม + ชื่อเครื่อง + อาการ)
 * 2) ส่งสำเร็จ → ร่างใน localStorage ถูกล้าง
 *
 * ไม่แตะฐานข้อมูล: intercept เฉพาะ POST /api/v1/repair.php ให้ตอบสำเร็จ
 * เปิดฟอร์มโดยไม่ต้องล็อกอิน: ใส่แคช "ผูกบัญชีแล้ว" ใน localStorage (เส้นทางเดียวกับ
 * ผู้ใช้ที่เคยผูกบัญชีและเปิดหน้านอกแอป LINE) — ด้วยเหตุนี้ /api/v1/departments.php
 * (ต้องล็อกอิน) จึงถูก stub เป็นรายการแผนกขั้นต่ำ เพื่อให้เลือกแผนกในขั้น 3 ได้
 *
 * รัน: npm run test:e2e -- repair-draft   (ต้องมี standalone server ที่ :3001)
 */

const DRAFT_KEY = "cmms_repair_draft_v1";
const MACHINE_NAME = "เครื่องทดสอบร่างฟอร์ม E2E";
const SYMPTOMS = "ฟิล์มขาดเป็นช่วง ๆ ระหว่างเดินเครื่อง ทดสอบการกู้คืนร่างอัตโนมัติ";
const REPORTER = "ผู้ทดสอบ ร่างฟอร์ม";
const PHONE = "0812345678";

// หน้าจอแนว LIFF (มือถือ) — toast อยู่เหนือ bottom bar ไม่บังปุ่มถัดไป
test.use({ viewport: { width: 420, height: 900 }, serviceWorkers: "block" });

async function openBoundForm(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("cmms_line_bound", "1");
    localStorage.setItem("cmms_line_user_id", "U_e2e_repair_draft");
    localStorage.setItem("cmms_line_full_name", "ผู้ทดสอบ ร่างฟอร์ม");
    localStorage.setItem("cmms_line_phone", "0812345678");
    // กันแบนเนอร์ "ติดตั้งแอป" บังปุ่ม
    localStorage.setItem("cmms_install_banner_dismissed", "1");
  });
  // endpoint นี้ต้องล็อกอิน — ผู้แจ้งซ่อมผ่าน LIFF ไม่มี session เว็บ
  await page.route("**/api/v1/departments.php", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: 1, code: "EN", name: "แผนกซ่อมบำรุง" }]),
    })
  );
  await page.goto("/repair/request");
  await expect(page.getByText("เลือกเครื่องจักร / อุปกรณ์")).toBeVisible();
}

/** ปิด toast ที่ค้างอยู่ (ถ้ามี) — กันการบังปุ่ม */
async function dismissToasts(page: Page) {
  const closes = page.locator(".cmms-toast-close");
  for (let i = 0, n = await closes.count(); i < n; i++) {
    await closes.nth(i).click().catch(() => {});
  }
}

/** กรอกครบถึงขั้นยืนยัน (ขั้น 1–3) */
async function fillFormToConfirm(page: Page) {
  // ขั้น 1: เครื่องจักร (เลือก "อื่นๆ" เพื่อไม่ผูกกับข้อมูล asset ในฐานข้อมูล)
  await page.getByRole("button", { name: /อื่นๆ — พิมพ์ชื่อเอง/ }).click();
  await page.getByPlaceholder(/พิมพ์ชื่อ\/รหัสเครื่องจักร/).fill(MACHINE_NAME);
  await page.locator("button.cmms-option-row").first().click();
  await dismissToasts(page);
  await page.getByRole("button", { name: /ถัดไป · รายละเอียดงาน/ }).click();

  // ขั้น 2: ประเภทงาน / ลักษณะงาน / อาการ
  await page.locator(".cmms-job-grid").nth(0).locator("button").first().click();
  await page.locator(".cmms-job-grid").nth(1).locator("button").first().click();
  await page.getByPlaceholder(/อธิบายปัญหาที่พบ/).fill(SYMPTOMS);
  await dismissToasts(page);
  await page.getByRole("button", { name: /ถัดไป · ผู้แจ้ง/ }).click();

  // ขั้น 3: ผู้แจ้ง — ชื่อ/เบอร์พิมพ์เอง แผนกเลือกจากรายการจริง
  await page.getByPlaceholder("เช่น สมชาย ใจดี").fill(REPORTER);
  await page.getByPlaceholder("เช่น 083-0000000").fill(PHONE);
  await dismissToasts(page);
  await page.getByRole("combobox").first().click();
  await page.getByRole("option").filter({ hasNotText: "เลือกแผนก" }).first().click();
  await dismissToasts(page);
  await page.getByRole("button", { name: /ถัดไป · ยืนยัน/ }).click();
}

/** รอจนร่างที่บันทึกลง localStorage มีอาการที่พิมพ์ (ผ่าน debounce 700 ms) */
async function expectDraftWithSymptoms(page: Page) {
  await expect
    .poll(
      async () =>
        page.evaluate(
          ({ key, text }) => {
            try {
              const draft = JSON.parse(localStorage.getItem(key) || "null");
              return draft?.form?.symptoms === text ? "saved" : "pending";
            } catch {
              return "pending";
            }
          },
          { key: DRAFT_KEY, text: SYMPTOMS }
        ),
      { timeout: 8_000 }
    )
    .toBe("saved");
}

test("กรอกฟอร์มแล้ว reload — ร่างถูกกู้คืน", async ({ page }) => {
  await openBoundForm(page);
  await dismissToasts(page);

  // กรอกถึงขั้น 2 แล้วรอให้ร่างถูกเขียนลงเครื่อง
  await page.getByRole("button", { name: /อื่นๆ — พิมพ์ชื่อเอง/ }).click();
  await page.getByPlaceholder(/พิมพ์ชื่อ\/รหัสเครื่องจักร/).fill(MACHINE_NAME);
  await page.locator("button.cmms-option-row").first().click();
  await page.getByRole("button", { name: /ถัดไป · รายละเอียดงาน/ }).click();
  await page.locator(".cmms-job-grid").nth(0).locator("button").first().click();
  await page.locator(".cmms-job-grid").nth(1).locator("button").first().click();
  await page.getByPlaceholder(/อธิบายปัญหาที่พบ/).fill(SYMPTOMS);
  await expectDraftWithSymptoms(page);

  // จำลอง "ปิดหน้าแล้วเปิดลิงก์จาก LINE ใหม่"
  await page.reload();

  await expect(page.getByText(/กู้คืนร่างที่กรอกไว้/)).toBeVisible();
  await expect(page.getByPlaceholder(/อธิบายปัญหาที่พบ/)).toHaveValue(SYMPTOMS);

  // ขั้นเครื่องจักรยังอยู่ (ย้อนกลับไปขั้น 1)
  await dismissToasts(page);
  await page.getByRole("button", { name: /ย้อนกลับ/ }).click();
  await expect(page.getByPlaceholder(/พิมพ์ชื่อ\/รหัสเครื่องจักร/)).toHaveValue(MACHINE_NAME);
  await expect(page.locator("button.cmms-option-row").first()).toHaveClass(/selected/);
});

test("ส่งแจ้งซ่อมสำเร็จแล้วร่างถูกล้าง", async ({ page }) => {
  // ไม่สร้างงานจริงในฐานข้อมูล — ตอบสำเร็จเฉพาะ POST ส่งแจ้งซ่อม
  await page.route("**/api/v1/repair.php", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, id: 987654, work_order_no: "WO-E2E-DRAFT" }),
      });
      return;
    }
    await route.continue();
  });

  await openBoundForm(page);
  await dismissToasts(page);
  await fillFormToConfirm(page);

  await expect(page.getByText(MACHINE_NAME).first()).toBeVisible();
  await expectDraftWithSymptoms(page);

  await page.getByRole("button", { name: /ยืนยัน & ส่งแจ้งซ่อม/ }).click();

  await expect(page.getByText("WO-E2E-DRAFT")).toBeVisible();
  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY), { timeout: 5_000 })
    .toBeNull();
});
