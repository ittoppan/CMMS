import { expect, test } from "@playwright/test";
import { e2eCreds, hasCreds } from "./creds";
const creds = e2eCreds();

/**
 * Sync Center (Phase 19) — หน้าเปิดได้หลัง login, จับสถานะ Connectivity
 * และ UI text (i18n) เรนเดอร์ครบ. เปิดที่ /sync-center.
 */

test.describe.configure({ mode: "serial" });

test.skip(!hasCreds(), "needs creds");

let savedStorage: string | undefined;

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel(/ชื่อผู้ใช้|Username/i).fill(creds.username!);
  await page.getByLabel(/รหัสผ่าน|Password/i).fill(creds.password!);
  await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });
  savedStorage = JSON.stringify(await ctx.storageState());
  await ctx.close();
});

test("sync-center opens and shows connectivity + stats", async ({ browser }) => {
  const ctx = await browser.newContext({
    storageState: savedStorage ? JSON.parse(savedStorage) : undefined,
  });
  const page = await ctx.newPage();
  await page.goto("/sync-center", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#cmms-splash", { state: "detached", timeout: 8_000 }).catch(() => undefined);
  await expect(page.locator("main")).toBeVisible();
  await page.waitForTimeout(2_500);

  // i18n หัวเรื่อง
  await expect(page.getByText(/ศูนย์ซิงก์|Sync Center/i).first()).toBeVisible();

  // สถานะ connectivity (อย่างน้อย 1 บรรทัดใดบรรทัดหนึ่ง) — ออนไลน์ หรือ badge คิว
  const header = await page.locator("header").first().textContent().catch(() => "");
  const hasConnUi =
    /ออนไลน์|offline|กำลังซิงก์|syncing|conflict|รอซิงก์|\d+\s*งาน/i.test((header || "") + (await page.locator("main").textContent().catch(() => "")));
  expect(hasConnUi, "expected connectivity/sync text on the page").toBeTruthy();

  // ไม่มี crash ระหว่าง hydrate
  await expect(page.locator("main")).not.toHaveText(/cannot read|is not a function|undefined is not/i);

  await ctx.close();
});