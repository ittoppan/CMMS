import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

const BASE = "http://localhost:8081";

const ROLES = [
  { name: "Admin", username: "e2e_admin", password: "Test@Cmms2026" },
  { name: "Manager", username: "e2e_manager", password: "Test@Cmms2026" },
  { name: "Asst.Manager", username: "e2e_asstmanager", password: "Test@Cmms2026" },
  { name: "Foreman", username: "e2e_foreman", password: "Test@Cmms2026" },
  { name: "Operate", username: "e2e_operate", password: "Test@Cmms2026" },
  { name: "User", username: "e2e_user", password: "Test@Cmms2026" },
  { name: "Viewer", username: "e2e_viewer", password: "Test@Cmms2026" },
  { name: "Officer", username: "e2e_officer", password: "Test@Cmms2026" },
  { name: "Officer-Read", username: "e2e_officer_read", password: "Test@Cmms2026" },
];

const ENDPOINTS = [
  "repair.php", "spare_parts.php", "spare_issue_request.php", "stock_take.php",
  "inspections.php", "checklist_templates.php", "form_templates.php", "forms.php",
  "planning.php", "supervisor.php", "approval.php", "sage_shipments.php",
  "permission_diff.php",
];

test.describe("phase6 matrix", () => {
  test("measure", async ({ request }) => {
    const results: Record<string, Record<string, { get: number; post: number }>> = {};
    for (const r of ROLES) {
      results[r.name] = {};
      await request.post(`${BASE}/api/auth/login.php`, { data: { username: r.username, password: r.password } });
      const csrfRes = await request.get(`${BASE}/api/v1/csrf.php`);
      const csrfJson = await csrfRes.json().catch(() => ({}));
      const csrf = csrfJson?.csrf_token ?? "";
      for (const ep of ENDPOINTS) {
        const url = `${BASE}/api/v1/${ep}`;
        let gStatus = 0, pStatus = 0;
        try { const g = await request.get(url, { timeout: 10000 }); gStatus = g.status(); } catch (e) { gStatus = -1; }
        try { const p = await request.post(url, { data: {}, headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, timeout: 10000 }); pStatus = p.status(); } catch (e) { pStatus = -1; }
        results[r.name][ep] = { get: gStatus, post: pStatus };
      }
    }
    const out = path.join(process.cwd(), "..", "docs", "security_matrix_raw.json");
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
  });
});