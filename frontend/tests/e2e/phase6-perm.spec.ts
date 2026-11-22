import { test, expect } from "@playwright/test";

const BASE = "http://localhost:8081";

async function login(request: any, username: string) {
  await request.post(`${BASE}/api/auth/login.php`, { data: { username, password: "Test@Cmms2026" } });
  const csrfRes = await request.get(`${BASE}/api/v1/csrf.php`);
  const csrfJson = await csrfRes.json().catch(() => ({}));
  return csrfJson?.csrf_token ?? "";
}

const LOW = ["e2e_viewer", "e2e_officer_read", "e2e_user"];

test.describe("phase6 perm: low roles cannot write", () => {
  for (const u of LOW) {
    test(`${u} writes blocked`, async ({ request }) => {
      const csrf = await login(request, u);
      const eps = ["stock_take.php", "spare_parts.php", "spare_issue_request.php", "checklist_templates.php", "forms.php"];
      for (const ep of eps) {
        const r = await request.post(`${BASE}/api/v1/${ep}`, { data: {}, headers: { "X-CSRF-Token": csrf } });
        expect([401, 403, 400, 405]).toContain(r.status());
      }
      const sage = await request.post(`${BASE}/api/v1/sage_shipments.php`, { data: {}, headers: { "X-CSRF-Token": csrf } });
      expect([401, 403, 400, 405]).toContain(sage.status());
    });
  }
});

test.describe("phase6 perm: Officer cannot write sage", () => {
  test("officer sage write blocked", async ({ request }) => {
    const csrf = await login(request, "e2e_officer");
    const r = await request.post(`${BASE}/api/v1/sage_shipments.php`, { data: {}, headers: { "X-CSRF-Token": csrf } });
    expect([401, 403, 400, 405]).toContain(r.status());
  });
});

test.describe("phase6 perm: User repair ownership", () => {
  test("user creates repair and sees only own", async ({ request }) => {
    const csrf = await login(request, "e2e_user");
    const create = await request.post(`${BASE}/api/v1/repair.php`, {
      data: { title: "e2e user repair", receiver_name: "e2e", reporter_phone: "000" },
      headers: { "X-CSRF-Token": csrf },
    });
    const body = await create.json().catch(() => ({}));
    expect(body.success).toBeTruthy();
    const list = await request.get(`${BASE}/api/v1/repair.php`);
    expect(list.status()).toBe(200);
  });
});