import { expect, test } from "@playwright/test";

const BASE = "http://localhost:8081";
const PW = process.env.E2E_PASSWORD!;

async function loginApi(page: any, username: string) {
  const res = await page.request.post(`${BASE}/api/auth/login.php`, {
    data: { username, password: PW },
  });
  expect(res.ok(), `${username} login`).toBeTruthy();
}

const ADMIN_ONLY_KEYS = [
  "smtp_pass",
  "line_channel_secret",
  "line_channel_access_token",
  "telegram_bot_token",
  "vapid_private_key",
  "line_webhook_url",
  "public_base_url",
];

test.describe("settings security: scope", () => {
  test("unauthenticated sees only public allowlist (no admin-only keys)", async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/v1/settings.php`);
    expect(res.status()).toBe(200);
    const json = await res.json();
    const keys = (Array.isArray(json) ? json : []).map((r: any) => r.setting_key);
    for (const k of ADMIN_ONLY_KEYS) expect(keys, k).not.toContain(k);
    // secret values never present
    for (const r of json) {
      if (r.masked) expect(r.setting_value).toBe("");
    }
  });

  for (const u of ["e2e_user", "e2e_viewer", "e2e_operate", "e2e_foreman", "e2e_officer", "e2e_officer_read"]) {
    test(`${u}: GET settings returns no admin-only keys and no secret values`, async ({ page }) => {
      await loginApi(page, u);
      const res = await page.request.get(`${BASE}/api/v1/settings.php`);
      expect(res.status()).toBe(200);
      const json = await res.json();
      const keys = (Array.isArray(json) ? json : []).map((r: any) => r.setting_key);
      for (const k of ADMIN_ONLY_KEYS) expect(keys, `${u} ${k}`).not.toContain(k);
      for (const r of json) {
        if (r.masked) expect(r.setting_value, `${u} ${r.setting_key}`).toBe("");
      }
    });
  }

  test("e2e_admin: settings include is_set for secrets but no values", async ({ page }) => {
    await loginApi(page, "e2e_admin");
    const res = await page.request.get(`${BASE}/api/v1/settings.php`);
    expect(res.status()).toBe(200);
    const json = await res.json();
    const secretRows = json.filter((r: any) => r.masked);
    expect(secretRows.length).toBeGreaterThan(0);
    for (const r of secretRows) {
      expect(r.setting_value).toBe("");
      expect(typeof r.is_set).toBe("boolean");
    }
  });

  for (const u of ["e2e_user", "e2e_viewer", "e2e_foreman", "e2e_officer", "e2e_officer_read"]) {
    test(`${u}: ?id= requires admin (403)`, async ({ page }) => {
      await loginApi(page, u);
      const r1 = await page.request.get(`${BASE}/api/v1/settings.php?id=1`);
      expect([401, 403]).toContain(r1.status());
    });
    test(`${u}: ?defaults is readable with settings:view (not 403)`, async ({ page }) => {
      await loginApi(page, u);
      const r2 = await page.request.get(`${BASE}/api/v1/settings.php?defaults=1`);
      expect(r2.status()).not.toBe(403);
    });
  }
});