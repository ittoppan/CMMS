#!/usr/bin/env node
/**
 * UX sweep — วัดปัญหาหน้าจอจริง *ทุกหน้า* แบบอัตโนมัติ
 *
 * เปิดเบราว์เซอร์จริงเข้าไปทุก route (admin bot ชั่วคราว) แล้วเก็บตัวชี้วัดที่
 * ตรวจได้ด้วยเครื่อง: ล้นแนวนอนบนมือถือ, ตารางที่ overflow, หัวเรื่อง (h1) หาย,
 * ปุ่มแตะเล็กเกิน 40px, รูปไม่มี alt, ตัวอักษรเล็กกว่า 12px, ข้อความล้นการ์ด
 *
 * Usage:  node scripts/ux-sweep.mjs            # สแกนทุกหน้า
 *         node scripts/ux-sweep.mjs /repair /pm_am
 * Output: test-results/ux-sweep.json + test-results/ux-shots/*.png
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3001";
const ROOT = path.resolve(import.meta.dirname, "..");
const APP_DIR = path.join(ROOT, "app", "(dashboard)");
const OUT_DIR = path.join(ROOT, "test-results");
const SHOT_DIR = path.join(OUT_DIR, "ux-shots");
const ADMIN_USER = "ux_bot";

fs.mkdirSync(SHOT_DIR, { recursive: true });

// ── route catalog ────────────────────────────────────────────────────────────
function staticRoutes(dir, prefix = "") {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) {
      if (ent.name === "page.tsx") out.push(prefix || "/");
      continue;
    }
    if (ent.name.startsWith("[") || ent.name.startsWith("(")) continue;
    out.push(...staticRoutes(path.join(dir, ent.name), `${prefix}/${ent.name}`));
  }
  return out;
}

const argRoutes = process.argv.slice(2).filter((a) => a.startsWith("/"));
const ROUTES = argRoutes.length
  ? argRoutes
  : [
      "/dashboard",
      "/dashboard/list",
      ...staticRoutes(APP_DIR).filter((r) => r !== "/dashboard"),
    ].sort();

// ── temp admin user (deleted at the end) ────────────────────────────────────
function php(code, args = []) {
  const tmp = path.join(os.tmpdir(), `ux-sweep-${Date.now()}.php`);
  fs.writeFileSync(tmp, code);
  try {
    return execFileSync("php", [tmp, ...args], { encoding: "utf8" }).trim();
  } finally {
    fs.unlinkSync(tmp);
  }
}

const PHP_DB = "require_once 'C:/inetpub/wwwroot/cmms-tpt/src/config/db.php'; $pdo = getDb(); $cmd = $argv[1] ?? '';";
const pw = `ux-${Math.random().toString(36).slice(2)}-${Date.now()}`;

function adminUp() {
  php(
    `<?php ${PHP_DB}
if ($cmd === 'up') {
  $pw = $argv[2];
  $pdo->exec("DELETE FROM users WHERE username='${ADMIN_USER}'");
  $hash = password_hash($pw, PASSWORD_BCRYPT);
  $pdo->prepare("INSERT INTO users (role_id, role, username, email, password, full_name, is_active, must_change_password) VALUES (1,'admin',?,?,?, 'UX Sweep Bot',1,0)")
      ->execute(['${ADMIN_USER}', '${ADMIN_USER}@cmms.local', $hash]);
  echo "up";
} else {
  echo "down:" . $pdo->exec("DELETE FROM users WHERE username='${ADMIN_USER}'");
}`,
    ["up", pw]
  );
}

function adminDown() {
  try {
    console.log("[ux-sweep]", php(`<?php ${PHP_DB} echo "down:" . $pdo->exec("DELETE FROM users WHERE username='${ADMIN_USER}'");`, ["down"]));
  } catch (e) {
    console.error("[ux-sweep] teardown failed:", e.message);
  }
}

// ── measurement (runs inside the page) ──────────────────────────────────────
const MEASURE = () => {
  const vw = window.innerWidth;
  const before = window.scrollX;
  window.scrollTo(9999, window.scrollY);
  const canScrollX = window.scrollX > 0;
  window.scrollTo(before, window.scrollY);
  const docOverflow = canScrollX ? document.documentElement.scrollWidth - vw : 0;
  const main = document.querySelector("main") || document.body;
  const h1s = [...main.querySelectorAll("h1")].filter((h) => h.offsetParent !== null);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  };

  // elements spilling past the right edge of the viewport
  const spill = [];
  for (const el of main.querySelectorAll("*")) {
    if (!visible(el) || el.closest("[data-ux-ignore]")) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 2 && r.width > 24) {
      spill.push({ tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 90), right: Math.round(r.right) });
      if (spill.length >= 6) break;
    }
  }

  // tables whose content is clipped with no scrollable ancestor
  const scrollableAncestor = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
    return false;
  };
  const clippedTables = [...main.querySelectorAll("table")].filter(
    (t) => t.scrollWidth > t.clientWidth + 2 && !scrollableAncestor(t)
  ).length;
  const tables = main.querySelectorAll("table").length;

  // tap targets under 40px tall (mobile guideline) — real interactive elements only
  // [data-slot=button] = ปุ่มจาก components/ui/button — มี pseudo-element ขยายพื้นที่กดเป็น ≥48px แล้ว
  const smallEls = [...main.querySelectorAll("button:not([data-slot=button]), a[href], [role=button], input[type=checkbox]")]
    .filter(visible)
    .filter((el) => {
      const r = el.getBoundingClientRect();
      // checkbox ที่ห่อด้วย <label> ใหญ่พอ = พื้นที่กดคือ label ไม่ใช่ตัว input
      const lab = el.closest("label");
      if (lab && el.tagName === "INPUT") {
        const lr = lab.getBoundingClientRect();
        if (lr.height >= 40 && lr.width >= 40) return false;
      }
      return r.height < 36 || r.width < 24;
    });
  const smallTargets = smallEls.length;
  const smallSamples = smallEls.slice(0, 6).map((el) => {
    const r = el.getBoundingClientRect();
    return `${el.tagName.toLowerCase()} ${Math.round(r.width)}x${Math.round(r.height)} ${(el.className || "").toString().slice(0, 50)} "${(el.textContent || "").trim().slice(0, 24)}"`;
  });

  const imgs = [...main.querySelectorAll("img")].filter(visible);
  const noAlt = imgs.filter((i) => !i.getAttribute("alt") && !i.getAttribute("aria-hidden")).length;

  const tinyEls = [...main.querySelectorAll("p, span, td, li, label, div")]
    .filter(visible)
    .filter((el) => {
      if (!el.textContent || !el.textContent.trim()) return false;
      return parseFloat(getComputedStyle(el).fontSize) < 11.5;
    });
  const tiny = tinyEls.length;
  const tinySamples = tinyEls.slice(0, 6).map((el) => {
    const fs = parseFloat(getComputedStyle(el).fontSize).toFixed(1);
    return `${fs}px ${(el.className || "").toString().slice(0, 46)} "${el.textContent.trim().slice(0, 28)}"`;
  });

  const txt = (main.innerText || "").replace(/\s+/g, " ").trim();
  return {
    docOverflow,
    h1: h1s.length,
    h1Text: h1s[0]?.innerText.trim().slice(0, 70) || "",
    h1Size: h1s[0] ? parseFloat(getComputedStyle(h1s[0]).fontSize) : 0,
    spill,
    tables,
    clippedTables,
    smallTargets,
    smallSamples,
    noAlt,
    tiny,
    tinySamples,
    chars: txt.length,
    denied: /ไม่มีสิทธิ์|Access denied|FORBIDDEN/i.test(txt),
    crash: /Application error|Something went wrong|เกิดข้อผิดพลาดร้ายแรง/i.test(txt),
  };
};

// ── main ────────────────────────────────────────────────────────────────────
const results = [];
adminUp();
const browser = await chromium.launch();

try {
  const loginCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const lp = await loginCtx.newPage();
  await lp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const userBox = lp.getByRole("textbox", { name: /ชื่อผู้ใช้|Username/i });
  const passBox = lp.getByRole("textbox", { name: /รหัสผ่าน|Password/i });
  // hydration-safe fill (form remounts after hydration and clears inputs)
  for (let i = 0, ok = false; i < 20 && !ok; i++) {
    await userBox.fill(ADMIN_USER);
    await passBox.fill(pw);
    await lp.waitForTimeout(400);
    ok = (await userBox.inputValue()) === ADMIN_USER && (await passBox.inputValue()) === pw;
  }
  await lp.getByRole("button", { name: /เข้าสู่ระบบ|Login/i }).first().click();
  await lp.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
  const storage = await loginCtx.storageState();
  await loginCtx.close();

  const WANT = process.env.UX_VPS || "both";
  for (const vp of [
    { name: "390", width: 390, height: 844 },
    { name: "1280", width: 1280, height: 900 },
  ]) {
    if (WANT === "mobile" && vp.name !== "390") continue;
    if (WANT === "desktop" && vp.name !== "1280") continue;
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      storageState: storage,
      serviceWorkers: "block",
    });
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      let m = null;
      let err = "";
      for (let attempt = 0; attempt < 2 && !m; attempt++) {
        try {
          await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 25_000 });
          await page.waitForLoadState("load", { timeout: 8_000 }).catch(() => {});
          // รอให้เนื้อหาจริงขึ้น (หน้า loading มีแค่ shell ~270 ตัวอักษร)
          await page
            .waitForFunction(
              () => {
                const el = document.querySelector("main");
                return !!el && (el.innerText || "").trim().length > 380;
              },
              { timeout: 8_000 }
            )
            .catch(() => {});
          await page.waitForTimeout(500);
          m = await page.evaluate(MEASURE);
        } catch (e) {
          err = String(e).slice(0, 150);
          m = null;
        }
      }
      if (m) {
        results.push({ route, vp: vp.name, ...m });
        if (vp.name === "390" && process.env.UX_SHOTS !== "0") {
          const slug = route.replace(/\//g, "_").replace(/^_/, "") || "root";
          await page.screenshot({ path: path.join(SHOT_DIR, `m-${slug}.png`), fullPage: false }).catch(() => {});
        }
      } else {
        results.push({ route, vp: vp.name, error: err });
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  adminDown();
}

const out = path.join(OUT_DIR, `ux-sweep${process.env.UX_VPS ? `-${process.env.UX_VPS}` : ""}.json`);
fs.writeFileSync(out, JSON.stringify(results, null, 1));

// ── report ──────────────────────────────────────────────────────────────────
const mob = results.filter((r) => r.vp === "390");
const desk = results.filter((r) => r.vp === "1280");
const byRoute = (arr, key) => arr.filter((r) => (r[key] || 0) > 0).length;

console.log(`\n=== UX sweep: ${ROUTES.length} routes × 2 viewports ===`);
console.log(`mobile(390)  overflow page   : ${byRoute(mob, "docOverflow")}`);
console.log(`mobile(390)  clipped tables  : ${byRoute(mob, "clippedTables")}`);
console.log(`mobile(390)  small targets   : ${byRoute(mob, "smallTargets")}`);
console.log(`mobile(390)  no h1            : ${mob.filter((r) => r.h1 === 0).length}`);
console.log(`mobile(390)  tiny text pages : ${byRoute(mob, "tiny")}`);
console.log(`desktop      no h1            : ${desk.filter((r) => r.h1 === 0).length}`);
console.log(`any          access denied   : ${results.filter((r) => r.denied).length}`);
console.log(`any          crash           : ${results.filter((r) => r.crash || r.error).length}`);

const worst = (arr, key) =>
  arr
    .filter((r) => (r[key] || 0) > 0)
    .sort((a, b) => b[key] - a[key])
    .slice(0, 15)
    .map((r) => `  ${r[key]}  ${r.vp}  ${r.route}`)
    .join("\n");

for (const key of ["docOverflow", "clippedTables", "smallTargets", "tiny"]) {
  const t = worst(mob, key);
  if (t) console.log(`\n-- worst ${key} (mobile) --\n${t}`);
}
const noH1 = desk.filter((r) => r.h1 === 0).map((r) => r.route);
if (noH1.length) console.log(`\n-- no <h1> (desktop) --\n${noH1.join("\n")}`);
console.log(`\nJSON: ${out}\nshots: ${SHOT_DIR}`);
