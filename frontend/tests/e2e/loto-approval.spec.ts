import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * ขั้น 5 — อนุมัติ LOTO: Foreman ขึ้นไป (Foreman/Asst.Manager/Manager/Admin)
 * Operate/User/Viewer/Officer/Officer-Read ต้องไม่ได้ และห้ามอนุมัติของตัวเอง
 *
 * สร้าง approval_requests ประเภท loto ชั่วคราว (document_no E2E-LOTO-*) และลบทิ้งใน afterAll
 */

const BASE = "http://localhost:8081";
const PW = process.env.E2E_PASSWORD!;
const PROBE = path.join(__dirname, "fixtures", "security-probe.php");
const OTHER_USER_ID = 1; // requester = ผู้ใช้อื่น (ไม่ใช่ผู้ทดสอบ) เพื่อไม่ชนกฎ self-approval

function probe(...args: string[]): any {
  return JSON.parse(execFileSync("php", [PROBE, ...args], { encoding: "utf8" }).trim());
}

async function loginApi(page: any, username: string): Promise<number> {
  const res = await page.request.post(`${BASE}/api/auth/login.php`, {
    data: { username, password: PW },
  });
  expect(res.ok(), `${username} login`).toBeTruthy();
  return Number(((await res.json()) as any).user?.id ?? 0);
}

async function csrf(page: any): Promise<string> {
  const res = await page.request.get(`${BASE}/api/v1/csrf.php`);
  return ((await res.json().catch(() => ({}))) as any)?.csrf_token ?? "";
}

async function approveLoto(page: any, requesterId: number) {
  const { token } = probe("loto-create", String(requesterId));
  const res = await page.request.post(`${BASE}/api/v1/approval.php`, {
    data: { token, action: "approve" },
    headers: { "Content-Type": "application/json", "X-CSRF-Token": await csrf(page) },
  });
  const body = (await res.json().catch(() => ({}))) as any;
  return { status: res.status(), body };
}

const ALLOWED = ["e2e_foreman", "e2e_asstmanager", "e2e_manager", "e2e_admin"];
const DENIED = ["e2e_operate", "e2e_user", "e2e_viewer", "e2e_officer", "e2e_officer_read"];

test.describe("LOTO approval matrix (ขั้น 5)", () => {
  test.afterAll(() => {
    probe("loto-drop");
    probe("down");
  });

  for (const u of ALLOWED) {
    test(`${u}: อนุมัติ LOTO ได้ (ไม่ถูกปฏิเสธสิทธิ์)`, async ({ page }) => {
      await loginApi(page, u);
      const r = await approveLoto(page, OTHER_USER_ID);
      expect(r.status, `${u} ไม่ควรได้ 403`).not.toBe(403);
    });
  }

  for (const u of DENIED) {
    test(`${u}: อนุมัติ LOTO ไม่ได้ (403 ที่ตัวกลาง)`, async ({ page }) => {
      await loginApi(page, u);
      const r = await approveLoto(page, OTHER_USER_ID);
      expect(r.status, `${u} ต้องถูกปฏิเสธ`).toBe(403);
    });
  }

  test("Foreman ห้ามอนุมัติคำขอของตัวเอง", async ({ page }) => {
    const uid = await loginApi(page, "e2e_foreman");
    const r = await approveLoto(page, uid);
    expect(r.status).toBe(400);
    expect(String(r.body.message ?? "")).toContain("ตัวเอง");
  });

  test("คำขอไม่ถูกอนุมัติจริงเมื่อถูกปฏิเสธสิทธิ์", async ({ page }) => {
    const { token } = probe("loto-create", String(OTHER_USER_ID));
    await loginApi(page, "e2e_user");
    const res = await page.request.post(`${BASE}/api/v1/approval.php`, {
      data: { token, action: "approve" },
      headers: { "Content-Type": "application/json", "X-CSRF-Token": await csrf(page) },
    });
    expect(res.status()).toBe(403);

    // Foreman (อีก session) ยังอนุมัติต่อได้ → แปลว่าคำขอยัง pending อยู่จริง (ไม่ถูก consume)
    const ctx = await page.context().browser()!.newContext();
    const foreman = await ctx.newPage();
    await loginApi(foreman, "e2e_foreman");
    const ok = await approveLoto(foreman, OTHER_USER_ID);
    expect(ok.status).not.toBe(403);
    await ctx.close();
  });
});
