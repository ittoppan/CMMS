"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePageHero } from "@/lib/i18n";

type Item = {
  spare_part_id: number;
  code: string;
  name: string;
  category: string;
  stock_qty: number;
  min_stock: number;
  max_stock: number;
  unit: string;
  unit_price: number;
  supplier_id: number | null;
  location: string;
  shortage: number;
  suggested_qty: number;
  estimated_cost: number;
};

export default function SpareReorderPage() {
  const hero = usePageHero("spare-reorder");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch("/api/v1/spare_reorder.php?limit=500", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { setItems(d.items || []); setTotal(d.total_estimated_cost || 0); })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>} title={hero.title} description={hero.desc}>
      <div className="mb-4 text-sm">Estimated total cost: {total.toLocaleString()} ฿ · {items.length} items</div>
      {loading ? (
        <p>Loading...</p>
      ) : items.length === 0 ? (
        <p>No parts below min stock.</p>
      ) : (
        <div className="grid gap-3">
          {items.map((it) => (
            <Card key={it.spare_part_id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold">{it.code} — {it.name}</div>
                <div className="text-sm text-muted-foreground">
                  Stock: {it.stock_qty} / Min: {it.min_stock} {it.unit} · Shortage: {it.shortage} · Suggested: {it.suggested_qty} · Est. {it.estimated_cost.toLocaleString()} ฿
                </div>
              </div>
              <Badge variant="warning">reorder</Badge>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
