"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Card } from "@/components/ui/card";
import AndonBadge from "@/components/AndonBadge";
import { usePageHero } from "@/lib/i18n";

type Item = {
  asset_id: number;
  code: string;
  name: string;
  last_failure: string | null;
  mtbf_hours: number | null;
  predicted_failure: string | null;
  days_until: number | null;
  risk: string;
};

export default function PredictiveMaintenancePage() {
  const hero = usePageHero("predictive-maintenance");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState(30);

  const exportCsv = () => {
    const header = "code,name,risk,days_until,predicted_failure,last_failure,mtbf_hours";
    const rows = items.map((it) =>
      [it.code, it.name, it.risk, it.days_until ?? "", it.predicted_failure ?? "", it.last_failure ?? "", it.mtbf_hours ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob(["\ufeff" + header + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `predictive-maintenance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    setLoading(true);
    fetch(`/api/v1/predictive_maintenance.php?horizon=${horizon}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [horizon]);

  const riskStatus = (r: string): "ok" | "warn" | "down" | "idle" => {
    if (r === "high" || r === "overdue") return "down";
    if (r === "medium") return "warn";
    return "idle";
  };

  return (
    <PageShell eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>} title={hero.title} description={hero.desc}>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm">Horizon (days)</label>
        <input type="number" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className="border rounded px-2 py-1 w-20" />
        <button onClick={exportCsv} className="border rounded px-3 py-1 text-sm">Export CSV</button>
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : items.length === 0 ? (
        <p>No at-risk assets within horizon.</p>
      ) : (
        <div className="grid gap-3">
          {items.map((it) => (
            <Card key={it.asset_id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold">{it.code} — {it.name}</div>
                <div className="text-sm text-muted-foreground">
                  Last failure: {it.last_failure || "—"} · MTBF: {it.mtbf_hours ?? "—"}h · Predicted: {it.predicted_failure || "—"}
                </div>
              </div>
              <AndonBadge tone={riskStatus(it.risk)}>{it.risk} {it.days_until !== null ? `(${it.days_until}d)` : ""}</AndonBadge>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
