import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { e2eCreds, hasCreds } from "./creds";

const creds = e2eCreds();
const root = path.resolve(__dirname, "..", "..");

/**
 * Phase 26 - Maintenance Cost & Budget
 * Targets a fresh-build standalone server: run with
 *   $env:E2E_BASE_URL="http://127.0.0.1:3011"; npm run test:e2e -- cost
 * Auth flows self-skip unless E2E_USERNAME / E2E_PASSWORD are set.
 * The fixture user e2e_bot is role_id=2 (Manager) -> kpi_can_see_cost() AND
 * cost_can_manage_budget() both true.
 * DB mutation: one budget_plan row (year 2031, month 1) created via PHP CLI,
 * then submitted/approved/adjusted/closed in the real API flow, deleted in afterAll.
 */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/Username|ชื่อผู้ใช้/i).fill(creds.username!);
  await page.getByLabel(/Password|รหัสผ่าน/i).fill(creds.password!);
  await page.getByRole("button", { name: /Login|เข้าสู่ระบบ/i }).first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });
}

async function loginAs(page: import("@playwright/test").Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/Username|ชื่อผู้ใช้/i).fill(username);
  await page.getByLabel(/Password|รหัสผ่าน/i).fill(password);
  await page.getByRole("button", { name: /Login|เข้าสู่ระบบ/i }).first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 });
}

test.describe("cost API gates (no auth)", () => {
  for (const a of ["settings", "summary", "budget", "budget-vs-actual", "forecast"]) {
    test(`GET action=${a} -> 401 without session`, async ({ request }) => {
      const res = await request.get(`/api/v1/cost.php?action=${a}`);
      expect(res.status()).toBe(401);
    });
  }
  test("POST budget/create without session -> rejected (CSRF before auth)", async ({ request }) => {
    const res = await request.post("/api/v1/cost.php?action=budget/create", {
      data: { year: 2031, month: 1, allocated_budget: 10 },
    });
    expect([401, 403]).toContain(res.status());
  });
});

const ORIGIN = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3011";

function reqErrors(): { errors: string[]; attach: (p: import("@playwright/test").Page) => void } {
  const errors: string[] = [];
  return {
    errors,
    attach: (p) => {
      p.on("console", (m) => {
        if (m.type() === "error" && !/Failed to load resource|net::ERR|favicon|bad http response code/i.test(m.text())) errors.push(m.text());
      });
      p.on("pageerror", (e) => errors.push(String(e)));
    },
  };
}

test.describe("cost & budget pages (authed manager)", () => {
  test.skip(() => !hasCreds(), "set E2E_USERNAME/E2E_PASSWORD to run");
  test.describe.configure({ mode: "serial" });

  test("GET cost.php?action=summary returns shaped payload", async ({ page }) => {
    await login(page);
    const res = await page.request.get("/api/v1/cost.php?action=summary&range=year");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.summary).toBeDefined();
    expect(body.summary.total).toBeDefined();
  });

  test("GET cost.php?action=budget returns alerts + can_manage=true", async ({ page }) => {
    await login(page);
    const res = await page.request.get("/api/v1/cost.php?action=budget&year=2026");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.can_manage).toBe(true);
    expect(body.alerts).toBeDefined();
    expect(body.config.warning_pct).toBeDefined();
  });

  test("/cost page renders hero, KPIs and tabs", async ({ page }) => {
    const { errors, attach } = reqErrors();
    attach(page);

    await login(page);
    await page.goto("/cost");
    await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.getByRole("tab").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Not Available", { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("/budget page renders table + chart", async ({ page }) => {
    await login(page);
    await page.goto("/budget");
    await expect(page.locator("main h1")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("main h1").filter({ hasText: "จัดการงบประมาณ" })).toBeVisible();
    await expect(page.locator(".cmms-ui-table").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("combobox").first()).toBeVisible();
  });

  test("dashboard shows budget widget", async ({ page }) => {
    const mgr = path.join(root, "tests", "e2e", "fixtures", "mgr-fixture.php");
    const pw = `mgr-${Date.now()}`;
    try {
      execFileSync("php", [mgr, "up", pw], { encoding: "utf8" });
      await loginAs(page, "e2e_mgr", pw);
      await page.goto("/dashboard");
      await expect(page.getByText("งบประมาณบำรุงรักษา").first()).toBeVisible({ timeout: 20_000 });
    } finally {
      try { execFileSync("php", [mgr, "down"], { encoding: "utf8" }); } catch { /* noop */ }
    }
  });
});

test.describe("budget CRUD workflow (authed manager, serial)", () => {
  test.skip(() => !hasCreds(), "set E2E_USERNAME/E2E_PASSWORD to run");
  test.describe.configure({ mode: "serial" });

  let id = 0;

  const call = async (page: import("@playwright/test").Page, action: string, data: object) => {
    const res = await page.request.post(`/api/v1/cost.php?action=${action}`, {
      data,
      headers: { Origin: ORIGIN },
    });
    return { status: res.status(), body: await res.json() as any };
  };

  const clean = () => {
    try {
      execFileSync("php", [path.join(root, "tests", "e2e", "fixtures", "budget-teardown.php")], { encoding: "utf8" });
    } catch { /* noop */ }
  };

  test("create -> submit -> approve -> adjust -> close", async ({ page }) => {
    await login(page);
    clean();

    const year = 2031, month = 1, dept = null;

    const c = await call(page, "budget/create", {
      year, month, department_id: dept, allocated_budget: 100000, notes: "e2e phase26",
    });
    expect(c.status).toBe(200);
    expect(c.body.success).toBe(true);
    id = c.body.id;
    expect(Number(id)).toBeGreaterThan(0);

    const sub = await call(page, "budget/submit", { id });
    expect(sub.status).toBe(200);
    expect(sub.body.success).toBe(true);

    const app = await call(page, "budget/approve", { id });
    expect(app.status).toBe(200);
    expect(app.body.success).toBe(true);

    const adj = await call(page, "budget/adjust", { id, adjustment_amount: -10000, reason: "e2e adjust" });
    expect(adj.status).toBe(200);
    expect(adj.body.success).toBe(true);
    expect(adj.body.effective_budget).toBe(90000);

    const cls = await call(page, "budget/close", { id });
    expect(cls.status).toBe(200);
    expect(cls.body.success).toBe(true);

    const list = await page.request.get(`/api/v1/cost.php?action=budget&year=${year}`);
    expect(list.status()).toBe(200);
    const lb = await list.json();
    const found = lb.items.find((i: any) => i.id === id);
    expect(found).toBeTruthy();
    expect(found.status).toBe("closed");
    expect(found.effective_budget).toBe(90000);
  });

  test.afterAll(clean);
});