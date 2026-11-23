import { chromium, type FullConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * E2E auth fixture — creates a transient `e2e_bot` user in the local DB
 * (via PHP CLI) and stores its credentials in .e2e-auth.json, which
 * specs read instead of requiring manual E2E_USERNAME/E2E_PASSWORD.
 *
 * The account is DELETED in teardown. Nothing is committed.
 * Opt out by setting E2E_USERNAME/E2E_PASSWORD explicitly.
 */

const AUTH_FILE = path.join(__dirname, "..", ".e2e-auth.json");
const SEED_SCRIPT = path.join(__dirname, "e2e", "fixtures", "seed-data.php");
const CLEANUP_SCRIPT = path.join(__dirname, "e2e", "fixtures", "cleanup-e2e.php");
const VERIFY_SCRIPT = path.join(__dirname, "e2e", "fixtures", "verify-e2e-residue.php");

function php(script: string, args: string[] = []): string {
  return execFileSync("php", [script, ...args], { encoding: "utf8" });
}

/** เติมข้อมูลขั้นต่ำที่หน้า/test ต้องใช้ (ลบทิ้งใน teardown)
 *  seed-data.php ทำทั้ง pm/ใบเบิก และ work order + failure history + operating hours
 *  + mtbf_mttr + failure taxonomy แล้ว log จำนวนแถวที่ใส่/ลบออกมาให้ fixture พ่นต่อ
 */
function seed(cmd: "up" | "down"): void {
  if (!fs.existsSync(SEED_SCRIPT)) return;
  try {
    console.log(`[e2e-seed] ${cmd} ->`, php(SEED_SCRIPT, [cmd]).trim());
  } catch (e) {
    console.log(`[e2e-seed] ${cmd} failed:`, e instanceof Error ? e.message : String(e));
  }
}

async function globalSetup(_config: FullConfig): Promise<void> {
  if (process.env.E2E_USERNAME && process.env.E2E_PASSWORD) return; // manual mode
  if (process.env.E2E_NO_FIXTURE === "1") return;

  const tmp = path.join(process.env.TEMP || "/tmp", `e2e-fixture-${Date.now()}.php`);
  const script = `<?php
require_once 'C:/inetpub/wwwroot/cmms-tpt/src/config/db.php';
$pdo = getDb();
$cmd = $argv[1] ?? '';
if ($cmd === 'up') {
  $pw = $argv[2];
  // suite นี้ล็อกอิน 100+ ครั้งต่อรอบ — เคลียร์ตัวนับล็อกอินของเครื่องทดสอบก่อนเริ่ม
  // (ตัวนับต่อ username ของบัญชีจริงยังทำงานตามปกติ; ที่ล้างคือ IP loopback ที่ทุก test ใช้ร่วมกัน)
  $pdo->exec("DELETE FROM iot_rate_limits WHERE scope_key = 'login_user:e2e_bot' OR scope_key LIKE 'login_ip:%'");
  $pdo->exec("DELETE FROM users WHERE username='e2e_bot'");
  // เปิดใช้งานบัญชีทดสอบ e2e_* ระหว่างรันเทส
  $pdo->exec("UPDATE users SET is_active=1 WHERE username LIKE 'e2e_%'");
  $hash = password_hash($pw, PASSWORD_BCRYPT);
  $pdo->prepare("INSERT INTO users (role_id, role, username, email, password, full_name, is_active, must_change_password) VALUES (2,'engineer','e2e_bot','e2e_bot@cmms.local',?,'E2E Visual Bot',1,0)")->execute([$hash]);
  echo "ok";
} elseif ($cmd === 'down') {
  echo "deleted:" . $pdo->exec("DELETE FROM users WHERE username='e2e_bot'");
}
`;
  const pw = `e2e-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  fs.writeFileSync(tmp, script);
  try {
    php(tmp, ["up", pw]);
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ username: "e2e_bot", password: pw }, null, 2));
    console.log("[e2e-fixture] created");
    seed("up");
  } finally {
    fs.unlinkSync(tmp);
  }
}

async function globalTeardown(): Promise<void> {
  if (process.env.E2E_USERNAME || process.env.E2E_NO_FIXTURE === "1") return;
  // ลบข้อมูลที่เทสสร้างผ่านบัญชี e2e_* ทั้งหมดก่อน (ทุกตารางที่มีคอลัมน์ e2e-user)
  console.log("[e2e-cleanup]", php(CLEANUP_SCRIPT).trim());
  // ลบ seed ก่อนเสมอ แม้ AUTH_FILE หาย (suite ถูก interrupt) — แถวที่ seed ไว้ลบตัวเองได้
  seed("down");
  if (!fs.existsSync(AUTH_FILE)) {
    console.log("[e2e-verify]", php(VERIFY_SCRIPT).trim());
    return;
  }
  const tmp = path.join(process.env.TEMP || "/tmp", `e2e-fixture-${Date.now()}.php`);
  fs.writeFileSync(tmp, `<?php
require_once 'C:/inetpub/wwwroot/cmms-tpt/src/config/db.php';
$pdo = getDb();
$pdo->exec("UPDATE users SET is_active=0 WHERE username LIKE 'e2e_%'");
echo "deleted:" . $pdo->exec("DELETE FROM users WHERE username='e2e_bot'");
`);
  try {
    console.log("[e2e-fixture]", php(tmp, ["down"]).trim());
    fs.unlinkSync(AUTH_FILE);
  } finally {
    fs.unlinkSync(tmp);
  }
  // ตรวจซ้ำว่าไม่มีแถว e2e_* เหลือ (ถ้ามี ให้เทสล้ม)
  console.log("[e2e-verify]", php(VERIFY_SCRIPT).trim());
}

export default globalSetup;
export { globalTeardown };
