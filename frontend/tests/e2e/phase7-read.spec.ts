import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

const BASE = "http://localhost:8081";
const ROLES = [
  { name: "Admin", username: "e2e_admin" },
  { name: "Manager", username: "e2e_manager" },
  { name: "Asst.Manager", username: "e2e_asstmanager" },
  { name: "Foreman", username: "e2e_foreman" },
  { name: "Operate", username: "e2e_operate" },
  { name: "User", username: "e2e_user" },
  { name: "Viewer", username: "e2e_viewer" },
  { name: "Officer", username: "e2e_officer" },
  { name: "Officer-Read", username: "e2e_officer_read" },
];

// endpoint -> GET url with optional query
const EPS: { ep: string; url: string }[] = [
  { ep: "cost", url: "/api/v1/cost.php" },
  { ep: "kpi_dashboard", url: "/api/v1/kpi_dashboard.php" },
  { ep: "analytics_advanced", url: "/api/v1/analytics_advanced.php" },
  { ep: "analytics_monthly", url: "/api/v1/analytics_monthly.php" },
  { ep: "reports", url: "/api/v1/reports.php" },
  { ep: "workload", url: "/api/v1/workload.php" },
  { ep: "notifications_log", url: "/api/v1/notifications_log.php" },
  { ep: "global_search", url: "/api/v1/global_search.php?q=a" },
  { ep: "dashboard", url: "/api/v1/dashboard.php" },
  { ep: "intelligence", url: "/api/v1/intelligence.php" },
  { ep: "predictive_maintenance", url: "/api/v1/predictive_maintenance.php" },
  { ep: "pm_reminders", url: "/api/v1/pm_reminders.php" },
  { ep: "pm_ical", url: "/api/v1/pm_ical.php" },
  { ep: "inspection_dashboard", url: "/api/v1/inspection_dashboard.php" },
  { ep: "inspection_history", url: "/api/v1/inspection_history.php" },
  { ep: "spare_usage", url: "/api/v1/spare_usage.php" },
  { ep: "asset_stats", url: "/api/v1/asset_stats.php" },
  { ep: "report_schedule", url: "/api/v1/report_schedule.php" },
  { ep: "feedback", url: "/api/v1/feedback.php" },
  { ep: "departments", url: "/api/v1/departments.php" },
  { ep: "machine_bom", url: "/api/v1/machine_bom.php" },
  { ep: "sage_items", url: "/api/v1/sage_items.php" },
  { ep: "iot", url: "/api/v1/iot.php" },
  { ep: "repair_options", url: "/api/v1/repair_options.php" },
  { ep: "asset_hub", url: "/api/v1/asset_hub.php" },
];

test.describe("phase7 read", () => {
  test("measure", async ({ request }) => {
    const results: any = {};
    for (const r of ROLES) {
      results[r.name] = {};
      await request.post(`${BASE}/api/auth/login.php`, { data: { username: r.username, password: process.env.E2E_PASSWORD! } });
      for (const e of EPS) {
        let status = 0, size = 0;
        try {
          const res = await request.get(`${BASE}${e.url}`, { timeout: 15000 });
          status = res.status();
          const txt = await res.text();
          size = txt.length;
        } catch (err) { status = -1; }
        results[r.name][e.ep] = { status, size };
      }
    }
    fs.writeFileSync(path.join(process.cwd(), "..", "docs", "phase7_read_raw.json"), JSON.stringify(results, null, 2));
  });
});
