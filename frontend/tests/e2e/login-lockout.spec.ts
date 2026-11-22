import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * ขั้น 4 — lockout เมื่อทุกคำขอผ่าน loopback/IIS proxy (ระบุ IP ผู้ใช้จริงไม่ได้)
 *
 * กติกาที่ตรวจ:
 *  - ผิดซ้ำจาก IP ที่ยืนยันไม่ได้ → หน่วงเวลาแบบทวีคูณ (1,2,4,… สูงสุด 60 วิ) ต่อ username
 *    ไม่ล็อกเต็ม 15 นาที (ไม่มี retry_after_min)
 *  - บัญชีที่ไม่มีอยู่จริงถูกนับและตอบเหมือนบัญชีจริง
 *  - ล็อกอินสำเร็จล้างตัวนับ
 *  - Admin ยังเข้าได้ภายในเวลาหน่วงที่จำกัด (ไม่ถูกล็อกเต็ม)
 */

const BASE = "http://localhost:8081";
const PW = process.env.E2E_PASSWORD!;
const PROBE = path.join(__dirname, "fixtures", "security-probe.php");
const GHOST = "e2e_probe_ghost";

function probe(...args: string[]): any {
  return JSON.parse(execFileSync("php", [PROBE, ...args], { encoding: "utf8" }).trim());
}

async function attempt(page: any, username: string, password: string) {
  const res = await page.request.post(`${BASE}/api/auth/login.php`, { data: { username, password } });
  return { status: res.status(), body: (await res.json().catch(() => ({}))) as any };
}

test.describe("login lockout ผ่าน proxy/loopback (ขั้น 4)", () => {
  test.beforeEach(() => {
    probe("unlock", GHOST);
    probe("unlock", "e2e_admin");
  });
  test.afterAll(() => {
    probe("unlock", GHOST);
    probe("unlock", "e2e_admin");
    probe("down");
  });

  test("ผิดซ้ำเกินกำหนด → หน่วงเวลาแบบทวีคูณ ไม่ใช่ล็อกเต็ม 15 นาที", async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      const r = await attempt(page, GHOST, "definitely-wrong-password");
      expect(r.status, `attempt ${i + 1}`).toBe(401);
      expect(r.body.code).toBe("INVALID_CREDENTIALS");
    }

    const sixth = await attempt(page, GHOST, "definitely-wrong-password");
    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe("ACCOUNT_DELAYED");
    expect(Number(sixth.body.retry_after_sec)).toBeGreaterThanOrEqual(1);
    expect(Number(sixth.body.retry_after_sec)).toBeLessThanOrEqual(60);
    expect(sixth.body.retry_after_min).toBeUndefined();

    // รอให้พ้นหน่วงแรก (1 วิ) แล้วยิงผิดอีกครั้ง → ผ่านไปเป็น 401 แล้วหน่วงเพิ่มเป็น 2 วิ
    await new Promise((r) => setTimeout(r, 1300));
    const seventh = await attempt(page, GHOST, "definitely-wrong-password");
    expect(seventh.status).toBe(401);
    const eighth = await attempt(page, GHOST, "definitely-wrong-password");
    expect(eighth.status).toBe(429);
    expect(eighth.body.code).toBe("ACCOUNT_DELAYED");
    expect(Number(eighth.body.retry_after_sec)).toBeGreaterThanOrEqual(1);
  });

  test("บัญชีที่ไม่มีอยู่จริงตอบเหมือนบัญชีจริง (ข้อความ/รหัสเดียวกัน)", async ({ page }) => {
    const ghost = await attempt(page, GHOST, "definitely-wrong-password");
    const real = await attempt(page, "e2e_user", "definitely-wrong-password");
    expect(ghost.status).toBe(401);
    expect(real.status).toBe(401);
    expect(ghost.body).toEqual(real.body);
  });

  test("การหน่วงเป็นราย username — บัญชีอื่นยังเข้าได้ และ admin เข้าได้ภายในเวลาจำกัด", async ({ page }) => {
    for (let i = 0; i < 6; i++) await attempt(page, GHOST, "definitely-wrong-password");
    const locked = await attempt(page, GHOST, "definitely-wrong-password");
    expect(locked.status).toBe(429);

    const started = Date.now();
    const r = await attempt(page, "e2e_admin", PW);
    expect(r.status, "admin ที่รหัสถูกต้องต้องไม่ถูกบล็อกเพราะบัญชีอื่น").toBe(200);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  test("admin ใส่รหัสผิดซ้ำแล้วยังเข้าได้หลังพ้นหน่วงที่จำกัด", async ({ page }) => {
    for (let i = 0; i < 5; i++) await attempt(page, "e2e_admin", "definitely-wrong-password");
    const delayed = await attempt(page, "e2e_admin", "definitely-wrong-password");
    expect(delayed.status).toBe(429);
    expect(delayed.body.code).toBe("ACCOUNT_DELAYED");

    const started = Date.now();
    let ok = false;
    for (let i = 0; i < 5 && !ok; i++) {
      const wait = Number(delayed.body.retry_after_sec ?? 2) * 1000 + 300;
      await new Promise((r) => setTimeout(r, wait));
      const r = await attempt(page, "e2e_admin", PW);
      if (r.status === 200) ok = true;
    }
    expect(ok, "admin ต้องเข้าได้ภายในเวลาหน่วงที่จำกัด").toBe(true);
    expect(Date.now() - started).toBeLessThan(30_000);
  });

  test("ล็อกอินสำเร็จล้างตัวนับ (ผิดอีกครั้งได้ 401 ไม่ใช่ 429)", async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      expect((await attempt(page, "e2e_admin", "definitely-wrong-password")).status).toBe(401);
    }
    await new Promise((r) => setTimeout(r, 1300));
    expect((await attempt(page, "e2e_admin", PW)).status, "สำเร็จหลังพ้นหน่วง").toBe(200);

    // ตัวนับถูกล้างแล้ว → ผิดอีกครั้งต้องได้ 401 (ถ้าไม่ล้างจะได้ 429 ทันที)
    expect((await attempt(page, "e2e_admin", "definitely-wrong-password")).status).toBe(401);
    expect((await attempt(page, "e2e_admin", PW)).status).toBe(200);
  });
});
