/**
 * Route-wide a11y audit: heading-order (axe) + keyboard focusability.
 *
 * ใช้กับเซิร์ฟเวอร์ที่รันอยู่ (ค่าเริ่มต้น http://localhost:3001) และบัญชีที่ส่งมาทาง env:
 *   A11Y_USER / A11Y_PASS   (ไม่เก็บในไฟล์ — ห้าม commit รหัสผ่าน)
 *   A11Y_BASE               (default http://localhost:3001)
 *   A11Y_OUT                (default ../docs/a11y-route-audit.json)
 *
 * ผลลัพธ์: JSON {routes, issues, skips, mapping} + สรุปทาง stdout
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(__dirname, "..");
const APP = path.join(FRONTEND, "app", "(dashboard)");
const BASE = process.env.A11Y_BASE || "http://localhost:3001";
const OUT = path.resolve(process.env.A11Y_OUT || path.join(FRONTEND, "..", "docs", "a11y-route-audit.json"));
const USER = process.env.A11Y_USER;
const PASS = process.env.A11Y_PASS;
const AXE_SRC = fs.readFileSync(path.join(FRONTEND, "node_modules", "axe-core", "axe.min.js"), "utf8");
const MAX_ROUTES = Number(process.env.A11Y_MAX || 0);

if (!USER || !PASS) {
  console.error("ต้องตั้ง A11Y_USER / A11Y_PASS");
  process.exit(2);
}

/* ── 1. route inventory จากไฟล์จริง ─────────────────────────────── */
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name === "page.tsx") acc.push(p);
  }
  return acc;
}
const routes = walk(APP)
  .map((f) => "/" + path.relative(APP, path.dirname(f)).replace(/\\/g, "/"))
  .map((r) => (r === "/." ? "/dashboard" : r))
  .sort();

/* ── 2. ตัวช่วยในหน้าเว็บ ──────────────────────────────────────── */
const KEYBOARD_PROBE = () => {
  const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]';
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const isFocusable = (el) => {
    if (!visible(el)) return false;
    if (el.matches(FOCUSABLE)) {
      const ti = el.getAttribute("tabindex");
      if (ti !== null && Number(ti) < 0) return false;
      if (el.tagName === "A" && !el.getAttribute("href")) return false;
      return true;
    }
    return false;
  };
  const cssPath = (el) => {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 6) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(s + "#" + n.id); break; }
      const cls = (n.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) s += "." + cls.join(".");
      const parent = n.parentElement;
      if (parent) {
        const sibs = [...parent.children].filter((c) => c.tagName === n.tagName);
        if (sibs.length > 1) s += `:nth-of-type(${sibs.indexOf(n) + 1})`;
      }
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(" > ");
  };
  const text = (el) => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
  const out = [];
  const seen = new Set();
  const push = (el, reason) => {
    if (seen.has(el)) return;
    seen.add(el);
    out.push({ reason, selector: cssPath(el), html: el.outerHTML.slice(0, 200), text: text(el) });
  };

  // ก) role ที่ต้องโฟกัสได้ แต่ไม่มี tabindex / เป็น element ที่โฟกัสไม่ได้
  //    ข้าม: aria-disabled (ตั้งใจไม่ให้โต้ตอบ), roving tabindex ของ tablist, tabindex="-1" (โฟกัสด้วยโปรแกรม)
  for (const el of document.querySelectorAll('[role="button"],[role="tab"],[role="menuitem"],[role="link"],[role="checkbox"],[role="switch"],[role="option"]')) {
    if (!visible(el)) continue;
    if (el.getAttribute("aria-disabled") === "true") continue;
    if (el.getAttribute("aria-current")) continue;
    if (el.getAttribute("role") === "tab" && el.closest('[role="tablist"]')) continue;
    if (el.getAttribute("tabindex") === "-1") continue;
    if (!isFocusable(el)) push(el, "role-interactive-not-focusable");
  }
  // ข) <a> ไม่มี href แต่คลิกได้
  for (const el of document.querySelectorAll("a:not([href])")) if (visible(el)) push(el, "anchor-without-href");
  // ค) tabindex > 0 (ลำดับโฟกัสผิดธรรมชาติ)
  for (const el of document.querySelectorAll('[tabindex]')) {
    const v = Number(el.getAttribute("tabindex"));
    if (v > 0 && visible(el)) push(el, "positive-tabindex");
  }
  // ง) โฟกัสได้แต่ถูกซ่อนจาก screen reader (aria-hidden)
  for (const el of document.querySelectorAll('[aria-hidden="true"]')) {
    if (!visible(el)) continue;
    for (const f of el.querySelectorAll(FOCUSABLE)) if (isFocusable(f)) push(f, "focusable-inside-aria-hidden");
  }
  // จ) ตัวที่ Tailwind ทำให้ดูคลิกได้ (cursor-pointer) แต่โฟกัสไม่ได้และไม่มี role
  const natives = new Set(["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"]);
  for (const el of document.querySelectorAll("div,tr,li,article,section")) {
    if (el.closest("button,a,label")) continue;
    if (el.getAttribute("role")) continue;
    if (natives.has(el.tagName)) continue;
    // ข้ามถ้าอยู่ใต้ ancestor ที่โฟกัสได้/มี role (แถวที่ทำ role=button แล้ว ลูก ๆ จะ inheriting cursor อยู่แล้ว)
    if (el.parentElement && el.parentElement.closest('[role],[tabindex],button,a,label')) continue;
    if (getComputedStyle(el).cursor !== "pointer") continue;
    if (!visible(el)) continue;
    if (!text(el)) continue;
    // เอาเฉพาะ "ใบ" ที่ไม่มีลูกซึ่ง cursor pointer เหมือนกัน (ลด noise จาก parent)
    if ([...el.children].some((c) => getComputedStyle(c).cursor === "pointer" && (c.textContent || "").trim())) continue;
    // ข้ามถ้ามี overlay link/button ที่โฟกัสได้คลุมทั้งการ์ด (เช่น .tower-kpi-hit ของ KPI tile)
    const covers = (host) => {
      const r = host.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      return [...host.querySelectorAll(FOCUSABLE)].some((f) => {
        if (!isFocusable(f)) return false;
        const fr = f.getBoundingClientRect();
        return fr.width * fr.height >= 0.8 * r.width * r.height;
      });
    };
    let host = el;
    let covered = false;
    for (let hop = 0; hop < 3 && host && host !== document.body; hop++) {
      if (covers(host)) { covered = true; break; }
      host = host.parentElement;
    }
    if (covered) continue;
    push(el, "cursor-pointer-not-focusable");
  }
  // ฉ) skip link: มีลิงก์ #... ที่ชี้ไปยัง element จริง (ซ่อนด้วย clip ได้ ถือว่าใช้ได้)
  const skipEl = [...document.querySelectorAll('a[href^="#"]')].find((a) => a.getAttribute("href").length > 1 && document.querySelector(a.getAttribute("href")));
  const skip = Boolean(skipEl);
  // ช) heading outline
  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading]")].map((h) => ({
    level: Number(h.getAttribute("aria-level") || h.tagName.slice(1)),
    text: (h.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70),
    selector: cssPath(h),
    hidden: h.closest('[aria-hidden="true"]') ? true : false,
  }));
  return { issues: out, skipLink: Boolean(skip), headings, mainId: Boolean(document.querySelector("main[id]")) };
};

/* ── 3. ตัวช่วยนอกหน้าเว็บ ─────────────────────────────────────── */
const slug = (r) => r.replace(/\[[^\]]+\]/g, "…");
const parentOf = (r) => r.replace(/\/\[[^\]]+\]$/, "");

function sampleCandidates({ parent, pattern, exclude }) {
  // เก็บลิงก์ที่อยู่ใต้ parent และมีจำนวน segment ตรงกับ pattern
  const want = pattern.split("/").filter(Boolean).length;
  const skip = new Set(exclude || []);
  const out = [];
  for (const a of document.querySelectorAll("a[href]")) {
    let p;
    try { p = new URL(a.getAttribute("href"), location.origin).pathname; } catch { continue; }
    if (!p.startsWith(parent + "/")) continue;
    if (p.split("/").filter(Boolean).length !== want) continue;
    if (/\/(create|edit|new|designer|builder|run)$/.test(p)) continue;
    if (skip.has(p)) continue; // หน้านิ่งที่อยู่ระดับเดียวกัน ไม่ใช่ id จริง
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/* ── 4. source mapping (file:line) ─────────────────────────────── */
const SRC_FILES = [
  ...walkTsx(path.join(FRONTEND, "app")),
  ...walkTsx(path.join(FRONTEND, "components")),
];
function walkTsx(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) walkTsx(p, acc); }
    else if (e.name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}
const SRC_CACHE = new Map();
function srcLines(f) {
  if (!SRC_CACHE.has(f)) SRC_CACHE.set(f, fs.readFileSync(f, "utf8").split("\n"));
  return SRC_CACHE.get(f);
}
function findInSource(text, route = "") {
  // ลำดับความน่าเชื่อถือ: ไฟล์ page ของ route เอง -> ไฟล์ในโฟลเดอร์เดียวกัน -> ทั้ง repo
  const routeFile = path.join(APP, route.replace(/^\//, ""), "page.tsx");
  const routeDir = path.dirname(routeFile);
  const scoped = [
    ...(fs.existsSync(routeFile) ? [routeFile] : []),
    ...SRC_FILES.filter((f) => path.dirname(f) === routeDir),
  ];
  const order = [...new Set([...scoped, ...SRC_FILES])];
  const needles = [];
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length >= 8) needles.push(clean.slice(0, 40));
  if (clean.length >= 24) needles.push(clean.slice(0, 24));
  if (clean.length >= 14) needles.push(clean.slice(0, 14));
  for (const n of needles) {
    for (const f of order) {
      const lines = srcLines(f);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(n)) {
          return { file: path.relative(path.join(FRONTEND, ".."), f).replace(/\\/g, "/"), line: i + 1, match: n };
        }
      }
    }
  }
  return null;
}

/* ── 5. วิ่ง ────────────────────────────────────────────────────── */
const report = { base: BASE, startedAt: new Date().toISOString(), routes: [], issues: [], skips: [], pages: [] };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
const page = await context.newPage();

const login = await page.request.post(`${BASE}/api/login`, { data: { username: USER, password: PASS } });
const loginJson = await login.json().catch(() => ({}));
if (!loginJson.success) {
  console.error("login failed", login.status(), JSON.stringify(loginJson).slice(0, 300));
  process.exit(3);
}
console.log(`[a11y] logged in as ${loginJson.user?.username} role=${loginJson.user?.role_name}`);

const STATIC_ROUTES = routes.filter((r) => !r.includes("["));
const ONLY = (process.env.A11Y_ROUTES || "").split(",").map((s) => s.trim()).filter(Boolean);
const queue = ONLY.length ? routes.filter((r) => ONLY.some((o) => r === o || r.startsWith(o))) : MAX_ROUTES ? routes.slice(0, MAX_ROUTES) : routes.slice();
const done = new Set();

async function auditUrl(url, route, extra = {}) {
  const row = { route, url, ...extra };
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.evaluate(() => document.querySelectorAll("#cmms-splash").forEach((e) => e.remove()));
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(350);
    const finalPath = new URL(page.url()).pathname;
    if (finalPath !== route && !route.includes("[")) {
      row.redirectedTo = finalPath;
      report.skips.push({ route, url, reason: "redirected", to: finalPath });
    }
    await page.addScriptTag({ content: AXE_SRC });
    const axe = await page.evaluate(async () => {
      const r = await window.axe.run(document, {
        runOnly: { type: "rule", values: ["heading-order", "tabindex", "nested-interactive", "aria-hidden-focus"] },
      });
      return r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.map((n) => ({ target: n.target.join(" "), html: n.html, failure: n.failureSummary })),
      }));
    });
    const probe = await page.evaluate(KEYBOARD_PROBE);
    const hasH1 = probe.headings.some((h) => h.level === 1);
    row.status = resp ? resp.status() : 0;
    row.headingViolations = axe.filter((v) => v.id === "heading-order");
    row.otherViolations = axe.filter((v) => v.id !== "heading-order");
    row.keyboard = probe.issues;
    row.headingCount = probe.headings.length;
    row.hasH1 = hasH1;
    row.skipLink = probe.skipLink;
    row.headings = probe.headings;
    report.pages.push({ route, url, status: row.status, hasH1, skipLink: probe.skipLink, headings: probe.headings });

    for (const v of row.headingViolations) {
      for (const n of v.nodes) {
        const text = (n.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        report.issues.push({ kind: "heading-order", route, url, target: n.target, html: n.html, text, failure: n.failure });
      }
    }
    for (const v of row.otherViolations) {
      for (const n of v.nodes) {
        report.issues.push({ kind: `axe:${v.id}`, route, url, target: n.target, html: n.html, text: (n.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), failure: n.failure });
      }
    }
    for (const k of probe.issues) {
      report.issues.push({ kind: k.reason, route, url, target: k.selector, html: k.html, text: k.text });
    }
    if (!hasH1) report.issues.push({ kind: "no-h1", route, url, target: "document", text: "", html: "" });
    if (!probe.skipLink) report.issues.push({ kind: "no-skip-link", route, url, target: "document", text: "", html: "" });
    console.log(`[a11y] ${route} -> ${axe.length} axe / ${probe.issues.length} kbd / h1=${hasH1}${row.redirectedTo ? " -> " + row.redirectedTo : ""}`);
  } catch (e) {
    row.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
    report.skips.push({ route, url, reason: "error", detail: row.error });
    console.log(`[a11y] ${route} -> ERROR ${row.error}`);
  }
  report.routes.push(row);
  done.add(route);
}

for (const route of queue) {
  if (route.includes("[")) continue;
  await auditUrl(`${BASE}${route === "/dashboard" ? "/dashboard" : route}`, route);
}

// dynamic: เปิดหน้ารายการพ่อ แล้วหยิบลิงก์ตัวอย่าง
for (const route of queue.filter((r) => r.includes("["))) {
  const parent = parentOf(route);
  const listing = fs.existsSync(path.join(APP, parent.replace(/^\//, ""), "page.tsx")) ? parent : parentOf(parent);
  try {
    await page.goto(`${BASE}${listing}`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    const cands = await page.evaluate(sampleCandidates, { parent: listing, pattern: route, exclude: STATIC_ROUTES });
    if (!cands.length) {
      report.skips.push({ route, url: `${BASE}${parent}`, reason: "no-sample-link" });
      console.log(`[a11y] ${route} -> SKIP (no sample link on ${parent})`);
      report.routes.push({ route, url: `${BASE}${parent}`, skipped: "no-sample-link" });
      continue;
    }
    await auditUrl(`${BASE}${cands[0]}`, route, { sampledUrl: cands[0], candidates: cands.slice(0, 5) });
  } catch (e) {
    report.skips.push({ route, reason: "sampling-error", detail: e instanceof Error ? e.message.slice(0, 150) : String(e) });
  }
}

/* ── 6. mapping file:line ─────────────────────────────────────── */
for (const issue of report.issues) {
  if (!issue.text || issue.text === "—") continue;
  const hit = findInSource(issue.text, issue.route);
  if (hit) issue.source = hit;
}
report.finishedAt = new Date().toISOString();
report.summary = {
  routes: report.routes.length,
  audited: report.routes.filter((r) => !r.skipped).length,
  skipped: report.skips.length,
  issues: report.issues.length,
  byKind: report.issues.reduce((m, i) => ((m[i.kind] = (m[i.kind] || 0) + 1), m), {}),
  routesWithHeadingIssues: [...new Set(report.issues.filter((i) => i.kind === "heading-order").map((i) => i.route))].length,
  routesWithKeyboardIssues: [...new Set(report.issues.filter((i) => !i.kind.startsWith("heading") && !i.kind.startsWith("axe") && i.kind !== "no-h1" && i.kind !== "no-skip-link").map((i) => i.route))].length,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(report.summary, null, 1));
console.log(`report: ${OUT}`);
await browser.close();
