import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { e2eCreds, hasCreds } from "./creds";

const creds = e2eCreds();

/**
 * Phase 25 — Advanced Maintenance Planning & Scheduling
 * Targets the LIVE standalone server on :3001 (deploy-next.ps1 -Port 3001).
 * Auth flows self-skip unless E2E_USERNAME / E2E_PASSWORD are set.
 * The fixture user e2e_bot is role_id=2 (Manager) -> canPlanWork() = planner.
 * Only DB mutation is a uniquely-named skill row, removed in afterAll.
 */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/ชื่อผู้ใช้|Username/i).fill(creds.username!);
  await page.getByLabel(/รหัสผ่าน|Password/i).fill(creds.password!);
  await page.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });
}

test.describe("planning API gates (no auth)", () => {
  for (const a of ["center", "queue", "calendar", "conflicts", "kpis", "my_plan"]) {
    test(`GET action=${a} -> 401 without session`, async ({ request }) => {
      const res = await request.get(`/api/v1/planning.php?action=${a}`);
      expect(res.status()).toBe(401);
    });
  }
  test("PUT schedule without session -> rejected (CSRF gate before auth)", async ({ request }) => {
    const res = await request.put("/api/v1/planning.php?action=schedule", {
      data: { id: 1, planned_start_at: "2026-01-01 09:00:00", planned_end_at: "2026-01-01 10:00:00" },
    });
    // requireLogin() runs enforceCsrf() for non-GET first -> 403 (no token), or 401 (no session)
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("planning center (authed planner)", () => {
  test.skip(() => !hasCreds(), "set E2E_USERNAME/E2E_PASSWORD to run");
  test.describe.configure({ mode: "serial" });

  test("page loads with hero, KPI chips and queue card", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource|net::ERR|favicon/.test(m.text())) errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));

    await login(page);
    await page.goto("/planning");

    await expect(page.getByText("ศูนย์วางแผนซ่อมบำรุง", { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    for (const chip of ["งานเปิดทั้งหมด (open)", "ยังไม่มีรอบเวลา", "พร้อมเริ่ม (readiness)", "สัญญาณขัดแย้ง (conflicts)"]) {
      await expect(page.getByText(chip).first()).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: /คิวงานวางแผน/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("ภาระงานของช่าง").first()).toBeVisible();

    expect(errors, `console errors on load`).toEqual([]);
  });

  test("new-request group + review link rendered (maintenance_requests merged into queue)", async ({ page }) => {
    await login(page);
    await page.goto("/planning");
    await expect(page.getByRole("heading", { name: /คิวงานวางแผน/i })).toBeVisible({ timeout: 15_000 });

    const reqBtn = page.getByRole("button", { name: /^คำขอใหม่ \d+$/ });
    await expect(reqBtn.first()).toBeVisible({ timeout: 15_000 });

    const rows = page.locator("tbody tr");
    const requestRow = rows.filter({ hasText: "ผู้แจ้ง:" }).first();
    if ((await requestRow.count()) > 0) {
      const reviewLink = requestRow.getByRole("link", { name: /ทบทวนคำขอ/i });
      await expect(reviewLink).toBeVisible();
      const href = (await reviewLink.getAttribute("href")) || "";
      expect(href).toMatch(/^\/supervisor\/review\?id=\d+/);
      // request rows must not be bulk-selectable
      const sel = requestRow.getByRole("checkbox");
      await expect(sel).toHaveCount(0);
    }
  });

  test("bulk preview (dry_run) opens after selecting a workorder", async ({ page }) => {
    await login(page);
    await page.goto("/planning");
    await expect(page.getByRole("heading", { name: /คิวงานวางแผน/i })).toBeVisible({ timeout: 15_000 });

    const sel = page.locator('tbody input[type="checkbox"]').first();
    await sel.check({ timeout: 15_000 });
    await page.getByRole("button", { name: /ดูตัวอย่างวางแผนกลุ่ม \(1\)/ }).click();

    await expect(page.getByText("วางแผนแบบกลุ่ม — ตัวอย่างผลลัพธ์", { exact: false }).first()).toBeVisible();
    await page.getByRole("button", { name: "ปิด" }).last().click();
  });

  test("skills dialog adds + persists a skill on the e2e technician (then cleaned up)", async ({ page }) => {
    const skillName = `e2e-skill-${Date.now()}`;
    test.info().annotations.push({ type: "cleanup", description: `technician_skills ${skillName} removed in afterAll` });

    await login(page);
    await page.goto("/planning");

    const wrench = page.getByRole("button", { name: "ทักษะของ E2E Visual Bot" }).first();
    await wrench.click({ timeout: 15_000 });
    await expect(page.getByText(/Skill matrix/).first()).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder("เช่น ไฟฟ้า, กลไก, PLC").fill(skillName);
    await page.getByRole("button", { name: /บันทึกทักษะ/i }).click();
    await expect(page.getByText("บันทึกทักษะแล้ว").first()).toBeVisible({ timeout: 15_000 });

    // persistence: close & reopen -> fresh list from API contains the new skill
    await page.getByRole("button", { name: "ปิด" }).last().click();
    await page.getByRole("button", { name: "ทักษะของ E2E Visual Bot" }).first().click();
    await expect(page.getByText(skillName, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("planning calendar + my plan (authed)", () => {
  test.skip(() => !hasCreds(), "set E2E_USERNAME/E2E_PASSWORD to run");

  test("calendar page renders timeline hero", async ({ page }) => {
    await login(page);
    await page.goto("/planning/calendar");
    await expect(page.getByText("ตารางวางแผนงาน", { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("field/plan (My Plan) renders for planner", async ({ page }) => {
    await login(page);
    await page.goto("/field/plan");
    await expect(page.getByText("แผนงานของฉัน", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  });
});

test.afterAll(async () => {
  if (process.env.E2E_NO_FIXTURE === "1" || process.env.E2E_USERNAME) return;
  const tmp = path.join(process.env.TEMP || "/tmp", `e2e-skill-cleanup-${Date.now()}.php`);
  fs.writeFileSync(
    tmp,
    `<?php
require_once 'C:/inetpub/wwwroot/cmms-tpt/src/config/db.php';
$pdo = getDb();
echo "deleted:" . $pdo->exec("DELETE FROM technician_skills WHERE skill_name LIKE 'e2e-skill-%'");
`
  );
  try {
    console.log("[planning spec]", execFileSync("php", [tmp], { encoding: "utf8" }).trim());
  } finally {
    fs.unlinkSync(tmp);
  }
});