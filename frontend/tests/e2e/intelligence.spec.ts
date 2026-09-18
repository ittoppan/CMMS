import { expect, test } from "@playwright/test";
import { e2eCreds, hasCreds } from "./creds";
const creds = e2eCreds();

/**
 * Phase 23 — Executive Intelligence Center (/analytics/intelligence)
 * Targets the LIVE standalone server on :3001 (deploy-next.ps1 -Port 3001).
 * Auth flows self-skip unless E2E_USERNAME / E2E_PASSWORD are set.
 */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/ชื่อผู้ใช้|Username/i).fill(creds.username!);
  await page.getByLabel(/รหัสผ่าน|Password/i).fill(creds.password!);
  await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });
}

test.describe("intelligence API gates (no auth)", () => {
  test("401 without session", async ({ request }) => {
    const res = await request.get("/api/v1/intelligence.php?section=overview");
    expect(res.status()).toBe(401);
  });
});

test.describe("intelligence center (authed)", () => {
  test.skip(() => !hasCreds(), "set E2E_USERNAME/E2E_PASSWORD to run");

  test("page loads with hero + all 10 tabs + real KPIs", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource|net::ERR|favicon/.test(m.text())) errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));

    await login(page);
    await page.goto("/analytics/intelligence");

    // hero
    await expect(page.getByText("ศูนย์วิเคราะห์อัจฉริยะ", { exact: false }).first()).toBeVisible({ timeout: 15_000 });

    const tabs = ["ภาพรวมผู้บริหาร", "Reliability", "สถานะเครื่อง", "เสียซ้ำ", "Downtime", "PM", "ภาระงานช่าง", "สต็อก & อะไหล่", "ต้นทุน", "คิวงาน & ความเร่งด่วน"];
    for (const t of tabs) {
      await expect(page.getByRole("tab", { name: t })).toBeVisible();
    }

    // overview KPIs populated from REAL data (this_year has mtbf_mttr rows)
    await expect(page.getByText("MTBF", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("MTTR", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("ความพร้อม (Availability)").first()).toBeVisible();

    // refresh button works without JS errors
    await page.getByRole("button", { name: /รีเฟรช/i }).click();
    await page.getByText("MTBF", { exact: true }).first().waitFor({ timeout: 15_000 });

    expect(errors, `console errors on load`).toEqual([]);
  });

  test("reliability tab renders monthly table + method note", async ({ page }) => {
    await login(page);
    await page.goto("/analytics/intelligence");
    await page.getByRole("tab", { name: "Reliability" }).click();
    // method note (source = mtbf_mttr) renders
    await expect(page.getByText(/operating hours \+ failures/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("ตารางรายเดือน").first()).toBeVisible();
    await expect(page.getByText("Operating (ชม.)", { exact: true }).first()).toBeVisible();
  });

  test("repeat-failures drill-down opens real WO list", async ({ page }) => {
    await login(page);
    await page.goto("/analytics/intelligence");
    await page.getByRole("tab", { name: "เสียซ้ำ" }).click();
    const drill = page.getByRole("button", { name: /ดูใบงาน/i }).first();
    await expect(drill).toBeVisible({ timeout: 15_000 });
    // ensure there is real repeat data this_year
    await expect(page.getByText(/เครื่องที่ใบงานซ้ำ \(2\+ ใบ\):/i).first()).toBeVisible();
    await drill.click();
    await expect(page.getByText(/ใบงานทั้งหมดของเครื่องที่เลือก/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("filter bar applies range + search without crash", async ({ page }) => {
    await login(page);
    await page.goto("/analytics/intelligence");
    await page.getByText("MTBF", { exact: true }).first().waitFor({ timeout: 15_000 });

    // change range preset via Radix select
    await page.getByLabel("ช่วงเวลา").click();
    await page.getByRole("option", { name: "ปีก่อน" }).click();
    await page.getByRole("button", { name: /ใช้ตัวกรอง/i }).click();
    await page.getByText("MTBF", { exact: true }).first().waitFor({ timeout: 15_000 });

    // asset-health tab search box applies
    await page.getByRole("tab", { name: "สถานะเครื่อง" }).click();
    const search = page.getByLabel("ค้นหาเครื่อง");
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill("PMP");
    await page.getByRole("button", { name: /ค้นหา/i }).first().click();
    await page.getByRole("tab", { name: "ภาพรวมผู้บริหาร" }).click();
    await page.getByText("MTBF", { exact: true }).first().waitFor({ timeout: 15_000 });
  });
});