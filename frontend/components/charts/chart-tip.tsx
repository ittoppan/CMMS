// Shared chart primitives extracted from dashboard/wallboard.
// Reusable tooltip + legend for recharts-based charts. Visuals intentionally
// mirror the Andon/wallboard treatment (TOPPAN blue palette) so callers stay
// consistent; override via className if a different surface is needed.

export interface ChartTipItem {
  name?: string | number;
  value?: string | number;
  color?: string;
}

export interface ChartTipProps {
  active?: boolean;
  payload?: ChartTipItem[];
  label?: string | number;
  unit?: string;
}

export function ChartTip({ active, payload, label, unit }: ChartTipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="tower-tooltip">
      <div className="tower-tooltip-title">{label}</div>
      {payload.map((p, i) => {
        const v =
          typeof p.value === "number"
            ? Number.isInteger(p.value)
              ? p.value
              : p.value.toFixed(1)
            : p.value;
        return (
          <div className="tower-tooltip-row" key={`${p.name}-${i}`}>
            <span style={{ color: p.color }}>{p.name}</span>
            {": "}
            <span className="tower-strong tower-num">{v}</span>
            {unit ? ` ${unit}` : ""}
          </div>
        );
      })}
    </div>
  );
}

export interface ChartLegendItem {
  label: string;
  color: string;
  line?: boolean;
}

export interface ChartLegendProps {
  items: ChartLegendItem[];
}

export function ChartLegend({ items }: ChartLegendProps) {
  return (
    <div className="tower-legend">
      {items.map((it) => (
        <span className="tower-legend-item" key={it.label}>
          <span
            className="tower-legend-swatch"
            data-shape={it.line ? "line" : undefined}
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}