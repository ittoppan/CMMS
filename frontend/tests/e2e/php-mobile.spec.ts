import { test, expect, Page } from "@playwright/test";
import { e2eCreds, hasCreds } from "./creds";

const creds = e2eCreds();

/**
 * PHP-page mobile check (Redesign Plan § G7 / Step 12):
 * render key server-rendered pages at 360x800 and assert nothing
 * leaks past the right edge. Elements that live inside their own
 * horizontal scroll container (e.g. .table-wrap) are annotated but
 * not counted as hard failures — on mobile the plan wants tables to
 * stack (.cmms-stack-table), so unwrapped offenders are the defect.
 *
 * Authenticates through the real PHP login page (:8081/login.php,
 * same-origin session cookie) — a plain PWA-session fetch sets
 * PHPSESSID via the Next proxy, which browsers don't attach to a
 * subsequent :8081 top-level navigation.
 */
const PHP_PAGES = [
  "/index.php",
  "/pages/repair/index.php",
  "/pages/repair/view.php?id=728",
  "/pages/pm_am/index.php",
  "/pages/spare_parts/index.php",
  "/pages/users/index.php",
  "/pages/settings/departments.php",
  "/pages/settings/locations.php",
  "/pages/calibration/history.php",
  "/pages/analytics/oee.php",
];

const VIEWPORT = { width: 360, height: 800 };
const TOLERANCE = 2;

type OverflowData = {
  vw: number;
  docScrollWidth: number;
  bodyScrollWidth: number;
  overflow: number;
  total: number;
  unwrapped: number;
  offenders: {
    tag: string;
    cls: string;
    id: string;
    left: number;
    right: number;
    width: number;
    wrapped: boolean;
  }[];
};

async function collectOverflow(page: Page): Promise<OverflowData> {
  return page.evaluate((tol: number) => {
    const vw = window.innerWidth;
    const de = document.documentElement;
    const overflow = de.scrollWidth - vw;
    const clsText = (el: Element) => (el.getAttribute("class") || "").slice(0, 60);
    const wrapped = (el: Element) => {
      let n: Element | null = el.parentElement;
      while (n) {
        const st = getComputedStyle(n);
        if (st.overflowX === "auto" || st.overflowX === "scroll") return true;
        n = n.parentElement;
      }
      return false;
    };
    const offenders: OverflowData["offenders"] = [];
    if (overflow > tol) {
      const els = Array.from(document.querySelectorAll("body *"));
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + tol || r.left < -tol) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: clsText(el),
            id: el.id || "",
            left: Math.round(r.left),
            right: Math.round(r.right),
            width: Math.round(r.width),
            wrapped: wrapped(el),
          });
        }
      }
      offenders.sort((a, b) => Math.abs(b.right - vw) - Math.abs(a.right - vw));
    }
    return {
      vw,
      docScrollWidth: de.scrollWidth,
      bodyScrollWidth: document.body ? document.body.scrollWidth : 0,
      overflow,
      total: offenders.length,
      unwrapped: offenders.filter((o) => !o.wrapped).length,
      offenders: offenders.slice(0, 14),
    };
  }, TOLERANCE);
}

function brief(r: OverflowData): string {
  if (r.total === 0) return "OK (no overflow)";
  const top = r.offenders
    .slice(0, 4)
    .map((o) => `${o.tag}.${o.cls}${o.id ? "#" : ""}${o.id} right=${o.right}${o.wrapped ? " [wrapped]" : " [RAW]"}`)
    .join(" | ");
  return `overflow=${r.overflow}px unwrapped=${r.unwrapped}/${r.total} -> ${top}`;
}

test.describe.configure({ mode: "serial" });

test("php pages have no horizontal overflow at 360px", async ({ page }) => {
  test.skip(!hasCreds(), "needs creds");

  // Same test body as php-pages.spec.ts: keep auth inside one test,
  // because each Playwright test gets a fresh cookie jar.
  await page.setViewportSize(VIEWPORT);
  await page.goto("http://localhost:8081/login.php");
  await page.locator("#username").fill(creds.username!);
  await page.locator("#password").fill(creds.password!);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.toLowerCase().includes("login"), { timeout: 15_000 }),
    page.locator("#password").press("Enter"),
  ]);

  for (const p of PHP_PAGES) {
    await page.goto(`http://localhost:8081${p}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const r = await collectOverflow(page);
    const textLen = await page.evaluate(() => document.body?.innerText.length ?? 0);
    const msg = `${p}: ${brief(r)} finalURL=${page.url()} textLen=${textLen}`;
    console.log(msg);
    expect.soft(page.url(), msg).toContain("localhost:8081");
    expect.soft(page.url(), msg).toContain(p); // กัน redirect ไปเพจอื่นแบบเงียบๆ (เช่น view.php?id ไม่มี)
    expect.soft(page.url(), msg).not.toMatch(/\/login|\/err/i);
    expect.soft(textLen, msg).toBeGreaterThan(200);
    expect.soft(r.docScrollWidth, msg).toBeLessThanOrEqual(r.vw + TOLERANCE);
    expect.soft(r.unwrapped, msg).toBe(0);
  }
});