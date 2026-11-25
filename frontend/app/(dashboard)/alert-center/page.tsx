"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout";
import { Card } from "@/components/ui/card";
import AndonBadge from "@/components/AndonBadge";
import { usePageHero } from "@/lib/i18n";

type Alert = { source: string; title: string; detail: string; severity: "down" | "warn" | "idle" };

export default function AlertCenterPage() {
  const hero = usePageHero("alert-center");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const exportCsv = () => {
    const header = "source,severity,title,detail";
    const rows = alerts.map((a) =>
      [a.source, a.severity, a.title, a.detail]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob(["\ufeff" + header + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alert-center-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const all: Alert[] = [];
    Promise.allSettled([
      fetch("/api/v1/predictive_maintenance.php?horizon=30", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/v1/spare_reorder.php?limit=100", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/v1/iot.php?action=alarms", { credentials: "include" }).then((r) => r.json()),
    ]).then(([pm, sp, iot]) => {
      if (pm.status === "fulfilled") {
        (pm.value.items || []).forEach((it: any) => {
          all.push({ source: "PM", title: `${it.code} — ${it.name}`, detail: `Predicted failure ${it.predicted_failure || "—"} (${it.days_until ?? "?"}d)`, severity: it.risk === "high" || it.risk === "overdue" ? "down" : "warn" });
        });
      }
      if (sp.status === "fulfilled") {
        (sp.value.items || []).forEach((it: any) => {
          all.push({ source: "Spare", title: `${it.code} — ${it.name}`, detail: `Stock ${it.stock_qty}/${it.min_stock} ${it.unit} · suggested ${it.suggested_qty}`, severity: "warn" });
        });
      }
      if (iot.status === "fulfilled") {
        const alarms = iot.value.items || iot.value.alarms || [];
        alarms.forEach((a: any) => {
          all.push({ source: "IoT", title: a.title || a.name || a.alarm_name || "Alarm", detail: a.message || a.description || "", severity: "down" });
        });
      }
      setAlerts(all);
      setLoading(false);
    });
  }, []);

  return (
    <>
      <PageHeader eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>} title={hero.title} description={hero.desc} />
      <div className="space-y-6">
      <div className="mb-4"><button onClick={exportCsv} className="border rounded px-3 py-1 text-sm">Export CSV</button></div>
      {loading ? <p>Loading…</p> : alerts.length === 0 ? <p>No active alerts.</p> : (
        <div className="grid gap-3">
          {alerts.map((a, i) => (
            <Card key={i} className="p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">{a.source}</div>
                <div className="font-semibold">{a.title}</div>
                <div className="text-sm text-muted-foreground">{a.detail}</div>
              </div>
              <AndonBadge tone={a.severity}>{a.severity}</AndonBadge>
            </Card>
          ))}
        </div>
      )}
      </div>
    </>
  );
}
