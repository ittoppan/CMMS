import { expect, test } from "@playwright/test";

const BASE = "http://localhost:8081";
const PW = process.env.E2E_PASSWORD!;

async function loginApi(page: any, username: string) {
  const res = await page.request.post(`${BASE}/api/auth/login.php`, {
    data: { username, password: PW },
  });
  expect(res.ok()).toBeTruthy();
}

test.describe("asset detail: API perms", () => {
  test("Operate gets 200 on asset_registry/machine_bom/pm_plans/inspections/measurements/meters", async ({ page }) => {
    await loginApi(page, "e2e_operate");
    for (const url of [
      "/api/v1/asset_registry.php?id=91",
      "/api/v1/machine_bom.php?asset_id=91",
      "/api/v1/pm_plans.php?asset_id=91",
      "/api/v1/inspections.php?schedules=1&asset_id=91",
      "/api/v1/asset_measurements.php?asset_id=91",
      "/api/v1/asset_meters.php?asset_id=91",
    ]) {
      const r = await page.request.get(`${BASE}${url}`);
      expect(r.status(), url).toBe(200);
    }
  });

  test("Foreman gets 200 on machine_bom after fix", async ({ page }) => {
    await loginApi(page, "e2e_foreman");
    const r = await page.request.get(`${BASE}/api/v1/machine_bom.php?asset_id=91`);
    expect(r.status()).toBe(200);
  });

  test("Viewer gets 403 on asset_registry.php?id= and machine_bom", async ({ page }) => {
    await loginApi(page, "e2e_viewer");
    for (const url of ["/api/v1/asset_registry.php?id=91", "/api/v1/machine_bom.php?asset_id=91"]) {
      const r = await page.request.get(`${BASE}${url}`);
      expect(r.status(), url).toBe(403);
    }
  });

  test("User gets 403 on asset_registry.php?id=, machine_bom, pm_plans", async ({ page }) => {
    await loginApi(page, "e2e_user");
    for (const url of [
      "/api/v1/asset_registry.php?id=91",
      "/api/v1/machine_bom.php?asset_id=91",
      "/api/v1/pm_plans.php?asset_id=91",
    ]) {
      const r = await page.request.get(`${BASE}${url}`);
      expect(r.status(), url).toBe(403);
    }
  });

  test("User QR scan returns minimal asset fields (no BOM/cost)", async ({ page }) => {
    await loginApi(page, "e2e_user");
    const r = await page.request.get(`${BASE}/api/v1/scan.php?code=A-BM06`);
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.type).toBe("asset");
    const keys = Object.keys(j.data.asset);
    for (const k of ["id", "code", "name", "status", "location"]) expect(keys).toContain(k);
    for (const k of ["bom", "cost", "measurements"]) expect(keys).not.toContain(k);
  });

  test("asset_hub for User returns minimal asset + no closed history", async ({ page }) => {
    await loginApi(page, "e2e_user");
    const r = await page.request.get(`${BASE}/api/v1/asset_hub.php?code=A-BM06`);
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(Object.keys(j.asset)).toEqual(expect.arrayContaining(["id", "code", "name", "status"]));
    expect(j.history == null ? [] : j.history).toEqual([]);
  });
});
