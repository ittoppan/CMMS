import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3001";
const PAGES = ["/repair", "/asset_registry", "/calibration/dashboard", "/settings", "/planning", "/supervisor"];

test.describe("axe audit - previously blocked pages", () => {
  test.beforeEach(async ({ page }) => {
    // login via API
    await page.request.post("http://localhost:8081/api/auth/login.php", {
      data: { username: "e2e_admin", password: process.env.E2E_PASSWORD! },
    });
  });

  for (const p of PAGES) {
    test(`axe ${p}`, async ({ page }) => {
      await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded" });
      // remove splash overlay if present
      await page.evaluate(() => {
        document.querySelectorAll("#cmms-splash").forEach((e) => e.remove());
      });
      await page.waitForTimeout(1500);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      console.log(`PAGE ${p}: violations=${results.violations.length} nodes=${results.violations.reduce((s,v)=>s+v.nodes.length,0)} passes=${results.passes.length}`);
      for (const v of results.violations) {
        console.log(`  - ${v.id} (${v.impact}) nodes=${v.nodes.length}: ${v.help}`);
        for (const n of v.nodes) console.log(`      target=${JSON.stringify(n.target)} html=${n.html?.slice(0,120)}`);
      }
      // store results
      (global as any).__axeResults = (global as any).__axeResults || {};
      (global as any).__axeResults[p] = {
        violations: results.violations.length,
        nodes: results.violations.reduce((s: number, v: any) => s + v.nodes.length, 0),
        passes: results.passes.length,
        details: results.violations.map((v: any) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })),
      };
    });
  }
});