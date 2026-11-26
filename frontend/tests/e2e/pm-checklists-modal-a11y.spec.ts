import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * pm_am/checklists — a11y ของ modal 2 ตัว (สร้าง Template / เพิ่มรายการตรวจ)
 *
 * ทุกเคสตรวจด้วยเบราว์เซอร์จริง (Chromium) กับเซิร์ฟเวอร์ standalone บน :3001:
 *   1) เปิดแล้วโฟกัสเข้าไปในกล่อง dialog
 *   2) Tab วนอยู่เฉพาะในกล่อง แล้วกลับไปตัวแรก
 *   3) Shift+Tab วนย้อนไปตัวสุดท้ายในกล่อง
 *   4) Escape ปิดกล่อง และโฟกัสกลับไปที่ปุ่มที่ใช้เปิด
 *
 * ใช้บัญชีชั่วคราว role admin (perm inspection.create) ที่ fixture สร้าง/ลบให้
 */

const root = path.resolve(__dirname, "..", "..");
const FIX = path.join(root, "tests", "e2e", "fixtures", "tpl-admin-fixture.php");
const USER = "e2e_tpl_a11y";
const PW = "E2eTplA11y!2026";
const CODE = `E2E-A11Y-${Date.now().toString().slice(-6)}`;

test.use({ serviceWorkers: "block" });
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  execFileSync("php", [FIX, "up", USER, PW], { encoding: "utf8" });
  const login = await request.post("/api/login", {
    data: { username: USER, password: PW },
    headers: { "Content-Type": "application/json" },
  });
  expect((await login.json()).success, "temp admin login").toBe(true);
  // POST ต้องมี CSRF token ของ session นี้ (เหมือนที่ frontend/lib/api.ts ทำ)
  const csrfToken = (await (await request.get("/api/v1/csrf.php")).json()).csrf_token as string;
  const created = await request.post("/api/v1/checklist_templates.php", {
    data: { code: CODE, name: "E2E a11y template", category: "pm_am", is_active: 1 },
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
  });
  const body = await created.json();
  expect(created.status(), `create template: ${JSON.stringify(body)}`).toBe(200);
  expect(body.id, "template id").toBeGreaterThan(0);
  console.log(`[setup] user=${USER} (role admin) template=${CODE} id=${body.id}`);
});

test.afterAll(() => {
  try {
    const out = execFileSync("php", [FIX, "down", USER, CODE], { encoding: "utf8" });
    console.log(`[teardown] ${out}`);
  } catch (e) {
    console.log(`[teardown] failed: ${String(e)}`);
  }
});

async function login(page: Page) {
  const res = await page.request.post("/api/login", {
    data: { username: USER, password: PW },
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!data.success) throw new Error(`API login failed: ${JSON.stringify(data)}`);
  const cookies = res.headers()["set-cookie"];
  if (cookies) {
    const list = Array.isArray(cookies) ? cookies : [cookies];
    for (const c of list) {
      const [pair] = c.split(";");
      const [name, value] = pair.split("=");
      await page.context().addCookies([{ name: name.trim(), value: value.trim(), domain: "localhost", path: "/" }]);
    }
  }
  await page.goto("/pm_am/checklists");
  await page.waitForLoadState("networkidle");
}

async function focusedInfo(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
    const active = document.activeElement as HTMLElement | null;
    return {
      dialogOpen: !!dialog,
      inside: !!(dialog && active && dialog.contains(active)),
      tag: active ? active.tagName.toLowerCase() : "",
      placeholder: active?.getAttribute("placeholder") ?? "",
      text: (active?.innerText ?? "").trim().slice(0, 40),
      labelledby: dialog?.getAttribute("aria-labelledby") ?? "",
      triggerStillFocused: active?.getAttribute("data-a11y-trigger") === "1",
    };
  });
}

/** ติด index ให้ focusable ใน dialog (ตาม selector เดียวกับ lib/use-dialog-a11y.ts) */
async function markFocusables(page: Page) {
  return page.evaluate(() => {
    const sel = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled]):not([type='hidden'])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const els = Array.from(dialog.querySelectorAll<HTMLElement>(sel));
    els.forEach((el, i) => el.setAttribute("data-a11y-i", String(i)));
    return els.length;
  });
}

async function activeIndex(page: Page) {
  return page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("data-a11y-i") ?? null);
}

async function openTemplateDialog(page: Page) {
  await login(page);
  const trigger = page.getByRole("button", { name: /สร้าง Template ใหม่/ });
  await trigger.focus();
  await page.evaluate(() => document.activeElement?.setAttribute("data-a11y-trigger", "1"));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(200);
  return page.getByRole("dialog");
}

async function openItemDialog(page: Page) {
  await login(page);
  const tplButton = page.locator("button").filter({ hasText: CODE }).first();
  await tplButton.click();
  const trigger = page.getByRole("button", { name: /เพิ่มรายการตรวจ/ });
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.evaluate(() => document.activeElement?.setAttribute("data-a11y-trigger", "1"));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(200);
  return page.getByRole("dialog");
}

// ── Modal 1: สร้าง Template ────────────────────────────────────────────────
test("modal 1 · เคส 1: เปิดแล้วโฟกัสเข้าในกล่อง", async ({ page }) => {
  await openTemplateDialog(page);
  const f = await focusedInfo(page);
  expect(f.inside, "activeElement ต้องอยู่ใน dialog").toBe(true);
  expect(f.triggerStillFocused, "โฟกัสต้องหลุดจากปุ่มเปิด").toBe(false);
  expect(f.tag).toBe("input");
  expect(f.placeholder).toContain("CHK-PUMP-01");
  console.log(`[CASE 1 PASS] modal=สร้าง Template label=${f.labelledby} focus=<${f.tag} ${f.placeholder}> inside=true`);
});

test("modal 1 · เคส 2: Tab วนในกล่องแล้วกลับตัวแรก", async ({ page }) => {
  await openTemplateDialog(page);
  const n = await markFocusables(page);
  expect(n).toBeGreaterThan(2);
  expect(await activeIndex(page)).toBe("0");
  for (let i = 1; i <= n; i++) {
    await page.keyboard.press("Tab");
    const idx = await activeIndex(page);
    const f = await focusedInfo(page);
    expect(f.inside, `Tab ครั้งที่ ${i}: โฟกัสต้องยังอยู่ใน dialog`).toBe(true);
    expect(idx, `Tab ครั้งที่ ${i}: index`).toBe(String(i % n));
  }
  console.log(`[CASE 2 PASS] modal=สร้าง Template focusables=${n} Tab ${n} ครั้ง → วนครบและกลับตัวแรก (index 0)`);
});

test("modal 1 · เคส 3: Shift+Tab วนย้อนไปตัวสุดท้าย", async ({ page }) => {
  await openTemplateDialog(page);
  const n = await markFocusables(page);
  expect(await activeIndex(page)).toBe("0");
  await page.keyboard.press("Shift+Tab");
  expect(await activeIndex(page), "Shift+Tab จากตัวแรก → ตัวสุดท้าย").toBe(String(n - 1));
  expect((await focusedInfo(page)).inside).toBe(true);
  await page.keyboard.press("Shift+Tab");
  expect(await activeIndex(page)).toBe(String(n - 2));
  console.log(`[CASE 3 PASS] modal=สร้าง Template Shift+Tab: 0 → ${n - 1} → ${n - 2} (focusables=${n})`);
});

test("modal 1 · เคส 4: Escape ปิดกล่องและคืนโฟกัสปุ่มเดิม", async ({ page }) => {
  await openTemplateDialog(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.waitForTimeout(100);
  const f = await focusedInfo(page);
  expect(f.dialogOpen, "dialog ต้องถูกปิด").toBe(false);
  expect(f.triggerStillFocused, "โฟกัสต้องกลับไปที่ปุ่ม 'สร้าง Template ใหม่'").toBe(true);
  console.log(`[CASE 4 PASS] modal=สร้าง Template Escape → dialog ปิด, focus กลับปุ่มเดิม (${f.text || "<เดิม>"})`);
});

// ── Modal 2: เพิ่มรายการตรวจ ───────────────────────────────────────────────
test("modal 2 · เคส 1: เปิดแล้วโฟกัสเข้าในกล่อง", async ({ page }) => {
  await openItemDialog(page);
  const f = await focusedInfo(page);
  expect(f.inside, "activeElement ต้องอยู่ใน dialog").toBe(true);
  expect(f.triggerStillFocused).toBe(false);
  expect(f.tag).toBe("input");
  expect(f.placeholder).toContain("เช็ครอยรั่วของวาล์ว");
  console.log(`[CASE 5 PASS] modal=เพิ่มรายการตรวจ label=${f.labelledby} focus=<${f.tag} ${f.placeholder}> inside=true`);
});

test("modal 2 · เคส 2: Tab วนในกล่องแล้วกลับตัวแรก", async ({ page }) => {
  await openItemDialog(page);
  const n = await markFocusables(page);
  expect(n).toBeGreaterThan(2);
  expect(await activeIndex(page)).toBe("0");
  for (let i = 1; i <= n; i++) {
    await page.keyboard.press("Tab");
    const idx = await activeIndex(page);
    const f = await focusedInfo(page);
    expect(f.inside, `Tab ครั้งที่ ${i}: โฟกัสต้องยังอยู่ใน dialog`).toBe(true);
    expect(idx, `Tab ครั้งที่ ${i}: index`).toBe(String(i % n));
  }
  console.log(`[CASE 6 PASS] modal=เพิ่มรายการตรวจ focusables=${n} Tab ${n} ครั้ง → วนครบและกลับตัวแรก (index 0)`);
});

test("modal 2 · เคส 3: Shift+Tab วนย้อนไปตัวสุดท้าย", async ({ page }) => {
  await openItemDialog(page);
  const n = await markFocusables(page);
  expect(await activeIndex(page)).toBe("0");
  await page.keyboard.press("Shift+Tab");
  expect(await activeIndex(page), "Shift+Tab จากตัวแรก → ตัวสุดท้าย").toBe(String(n - 1));
  expect((await focusedInfo(page)).inside).toBe(true);
  await page.keyboard.press("Shift+Tab");
  expect(await activeIndex(page)).toBe(String(n - 2));
  console.log(`[CASE 7 PASS] modal=เพิ่มรายการตรวจ Shift+Tab: 0 → ${n - 1} → ${n - 2} (focusables=${n})`);
});

test("modal 2 · เคส 4: Escape ปิดกล่องและคืนโฟกัสปุ่มเดิม", async ({ page }) => {
  await openItemDialog(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.waitForTimeout(100);
  const f = await focusedInfo(page);
  expect(f.dialogOpen, "dialog ต้องถูกปิด").toBe(false);
  expect(f.triggerStillFocused, "โฟกัสต้องกลับไปที่ปุ่ม 'เพิ่มรายการตรวจ'").toBe(true);
  console.log(`[CASE 8 PASS] modal=เพิ่มรายการตรวจ Escape → dialog ปิด, focus กลับปุ่มเดิม (${f.text || "<เดิม>"})`);
});
