import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * ขั้น 2 + 3 — allowlist ของ settings และการเขียนค่า secret ผ่านหน้าตั้งค่า
 *
 * ใช้เฉพาะ key ทดสอบที่ขึ้นต้นด้วย e2e_probe_/e2e_allow_ (สร้างและลบด้วย fixture PHP)
 * ไม่แตะ secret จริง และไม่พิมพ์ค่า secret ลง log/ผลเทส
 */

const BASE = "http://localhost:8081";
const PW = process.env.E2E_PASSWORD!;
const PROBE = path.join(__dirname, "fixtures", "security-probe.php");
const SECRET_KEY = "e2e_probe_secret_token";
const ALLOW_KEY = "e2e_allow_probe_feature";
const MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

function probe(...args: string[]): any {
  const out = execFileSync("php", [PROBE, ...args], { encoding: "utf8" }).trim();
  return JSON.parse(out);
}

async function loginApi(page: any, username: string) {
  const res = await page.request.post(`${BASE}/api/auth/login.php`, {
    data: { username, password: PW },
  });
  expect(res.ok(), `${username} login`).toBeTruthy();
  return ((await res.json()) as any).user?.id as number;
}

async function csrf(page: any): Promise<string> {
  const res = await page.request.get(`${BASE}/api/v1/csrf.php`);
  return ((await res.json().catch(() => ({}))) as any)?.csrf_token ?? "";
}

async function settingId(page: any, key: string): Promise<number> {
  const res = await page.request.get(`${BASE}/api/v1/settings.php`);
  const rows = (await res.json()) as any[];
  const row = rows.find((r) => r.setting_key === key);
  expect(row, `setting row ${key}`).toBeTruthy();
  return Number(row.id);
}

test.describe("settings allowlist (ขั้น 2)", () => {
  test.beforeAll(() => {
    probe("secret-set", ALLOW_KEY, "1");
  });
  test.afterAll(() => {
    probe("down");
  });

  test("key ที่ไม่อยู่ใน allowlist ถูกซ่อนจาก Operate/Foreman/Manager และเห็นเฉพาะ Admin", async ({ page }) => {
    await loginApi(page, "e2e_admin");
    const adminRows = (await (await page.request.get(`${BASE}/api/v1/settings.php`)).json()) as any[];
    expect(adminRows.map((r) => r.setting_key)).toContain(ALLOW_KEY);
    await page.request.post(`${BASE}/api/auth/logout.php`).catch(() => null);

    for (const u of ["e2e_operate", "e2e_foreman", "e2e_manager", "e2e_user", "e2e_viewer"]) {
      const ctx = await page.context().browser()!.newContext();
      const p = await ctx.newPage();
      await loginApi(p, u);
      const res = await p.request.get(`${BASE}/api/v1/settings.php`);
      expect(res.status(), u).toBe(200);
      const keys = ((await res.json()) as any[]).map((r) => r.setting_key);
      expect(keys, `${u} ไม่ควรเห็น key ที่ไม่อยู่ใน allowlist`).not.toContain(ALLOW_KEY);
      await ctx.close();
    }
  });

  test("Operate อ่านค่าที่ฟีเจอร์ใช้จริงได้ (SLA / สกุลเงิน / Andon / RCA)", async ({ page }) => {
    await loginApi(page, "e2e_operate");
    const rows = (await (await page.request.get(`${BASE}/api/v1/settings.php`)).json()) as any[];
    const keys = rows.map((r) => r.setting_key);
    for (const k of [
      "planning_sla_risk_hours",
      "currency_symbol",
      "andon_refresh_sec",
      "require_root_cause",
      "sla_hours_critical",
      "date_format",
    ]) {
      expect(keys, `Operate ต้องอ่าน ${k} ได้เพื่อให้ฟีเจอร์ทำงาน`).toContain(k);
    }
    // ฟีเจอร์ที่พึ่งค่าเหล่านี้ยังตอบ 200 สำหรับ Operate
    const repairs = await page.request.get(`${BASE}/api/v1/repair.php?limit=5`);
    expect(repairs.status()).toBe(200);
  });
});

test.describe("settings secret write (ขั้น 3)", () => {
  test.beforeAll(() => {
    probe("secret-set", SECRET_KEY, "probe-initial-value");
  });
  test.afterAll(() => {
    probe("down");
  });

  test("(ก) Admin ตั้งค่า secret ใหม่ได้ และ is_set เปลี่ยนเป็น true", async ({ page }) => {
    await loginApi(page, "e2e_admin");
    const id = await settingId(page, SECRET_KEY);
    const token = await csrf(page);

    // ค่าเริ่มต้นถูกมองเป็น secret (มีคำว่า secret ในชื่อ key)
    expect(probe("get", SECRET_KEY).is_set).toBe(true);

    const res = await page.request.put(`${BASE}/api/v1/settings.php?id=${id}`, {
      data: { setting_value: "probe-rotated-value" },
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
    });
    expect(res.status()).toBe(200);
    expect(probe("get", SECRET_KEY)).toEqual({ value: "probe-rotated-value", is_set: true });
  });

  test("(ข) บันทึกโดยไม่ส่งค่าใหม่ / ส่งค่าว่าง / ส่ง mask ต้องไม่ทับค่าเดิม", async ({ page }) => {
    await loginApi(page, "e2e_admin");
    const id = await settingId(page, SECRET_KEY);
    const token = await csrf(page);
    const header = { "Content-Type": "application/json", "X-CSRF-Token": token };
    const before = probe("get", SECRET_KEY).value;

    // ไม่ส่ง setting_value เลย
    let res = await page.request.put(`${BASE}/api/v1/settings.php?id=${id}`, {
      data: { description: "E2E probe (ลบอัตโนมัติ)" },
      headers: header,
    });
    expect(res.status()).toBe(200);
    expect(probe("get", SECRET_KEY).value).toBe(before);

    // ส่งค่าว่าง
    res = await page.request.put(`${BASE}/api/v1/settings.php?id=${id}`, {
      data: { setting_value: "" },
      headers: header,
    });
    expect(res.status()).toBe(200);
    expect(probe("get", SECRET_KEY).value, "ค่าว่างต้องไม่ล้าง secret เดิม").toBe(before);

    // ส่งค่า mask กลับมา (พฤติกรรมของ UI ที่โหลดค่า masked)
    res = await page.request.put(`${BASE}/api/v1/settings.php?id=${id}`, {
      data: { setting_value: MASK },
      headers: header,
    });
    expect(res.status()).toBe(200);
    expect(probe("get", SECRET_KEY).value, "mask ต้องไม่ถูกเขียนทับค่าจริง").toBe(before);
  });

  test("(ค) ไม่มีการลบค่าจากการบันทึกปกติ (settings ไม่รับ DELETE)", async ({ page }) => {
    await loginApi(page, "e2e_admin");
    const id = await settingId(page, SECRET_KEY);
    const token = await csrf(page);
    const before = probe("get", SECRET_KEY);

    const res = await page.request.delete(`${BASE}/api/v1/settings.php?id=${id}`, {
      headers: { "X-CSRF-Token": token },
    });
    expect(res.status()).toBe(405);
    expect(probe("get", SECRET_KEY)).toEqual(before);
  });

  test("(ง) audit log บันทึกการเปลี่ยน secret โดยไม่เก็บค่าเก่า/ใหม่", async ({ page }) => {
    await loginApi(page, "e2e_admin");
    const id = await settingId(page, SECRET_KEY);
    const token = await csrf(page);
    const res = await page.request.put(`${BASE}/api/v1/settings.php?id=${id}`, {
      data: { setting_value: "probe-audit-value" },
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
    });
    expect(res.status()).toBe(200);

    const row = probe("audit", SECRET_KEY).row;
    expect(row, "ต้องมีแถว audit ของ key นี้").toBeTruthy();
    expect(row.old_value).toBe(MASK);
    expect(row.new_value).toBe(MASK);
    expect(JSON.stringify(row)).not.toContain("probe-audit-value");
    expect(JSON.stringify(row)).not.toContain("probe-initial-value");
  });

  test("API ไม่คืนค่า secret จริงให้ client (mask เท่านั้น)", async ({ page }) => {
    await loginApi(page, "e2e_admin");
    const rows = (await (await page.request.get(`${BASE}/api/v1/settings.php`)).json()) as any[];
    const row = rows.find((r) => r.setting_key === SECRET_KEY);
    expect(row).toBeTruthy();
    expect(row.masked).toBe(true);
    expect(row.setting_value).toBe("");
    expect(typeof row.is_set).toBe("boolean");
  });

  test("หน้าตั้งค่าการแจ้งเตือน: บันทึกซ้ำด้วยค่า mask ไม่ทำให้ secret จริงหาย", async ({ page }) => {
    await loginApi(page, "e2e_admin");
    const token = await csrf(page);

    const before = (await (await page.request.get(`${BASE}/api/v1/line_notify.php`)).json()) as any;
    const wasSet = Object.entries(before.settings as Record<string, string>)
      .filter(([k]) => /secret|token/.test(k))
      .map(([k, v]) => [k, v === MASK] as [string, boolean]);

    // ส่งกลับเฉพาะค่า mask (ไม่ส่งค่าใหม่) + ค่าไม่ลับหนึ่งตัว — ต้องไม่แตะ secret
    const payloadSettings: Record<string, string> = {};
    for (const [k, isMasked] of wasSet) {
      if (isMasked) payloadSettings[k] = MASK;
    }
    payloadSettings.ntfy_priority = String((before.settings as any)?.ntfy_priority ?? "");
    const res = await page.request.put(`${BASE}/api/v1/line_notify.php`, {
      data: { settings: payloadSettings },
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
    });
    expect(res.status()).toBe(200);

    const after = (await (await page.request.get(`${BASE}/api/v1/line_notify.php`)).json()) as any;
    for (const [k, isMasked] of wasSet) {
      if (isMasked) expect(after.settings[k], `${k} ต้องยังถูกตั้งค่าไว้`).toBe(MASK);
    }
  });
});
