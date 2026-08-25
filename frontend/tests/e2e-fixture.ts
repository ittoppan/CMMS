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

function php(script: string, args: string[] = []): string {
  return execFileSync("php", [script, ...args], { encoding: "utf8" });
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
  $pdo->exec("DELETE FROM users WHERE username='e2e_bot'");
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
  } finally {
    fs.unlinkSync(tmp);
  }
}

async function globalTeardown(): Promise<void> {
  if (process.env.E2E_USERNAME || process.env.E2E_NO_FIXTURE === "1") return;
  if (!fs.existsSync(AUTH_FILE)) return;
  const tmp = path.join(process.env.TEMP || "/tmp", `e2e-fixture-${Date.now()}.php`);
  fs.writeFileSync(tmp, `<?php
require_once 'C:/inetpub/wwwroot/cmms-tpt/src/config/db.php';
$pdo = getDb();
echo "deleted:" . $pdo->exec("DELETE FROM users WHERE username='e2e_bot'");
`);
  try {
    console.log("[e2e-fixture]", php(tmp, ["down"]).trim());
    fs.unlinkSync(AUTH_FILE);
  } finally {
    fs.unlinkSync(tmp);
  }
}

export default globalSetup;
export { globalTeardown };
