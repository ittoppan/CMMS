"use client";

import { type CSSProperties } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RPT_TONE_COLOR, truncateLabel, type ReportChart, type ChartSeries } from "./report-lib";

/** ตัวกรองสำหรับ Tooltip/recharts — แสดงตัวเลขเป็น locale th-TH */
const tooltipFormatter = (value: any) => {
  const n = Number(value);
  return [Number.isFinite(n) ? n.toLocaleString("th-TH") : String(value ?? "—"), undefined];
};

const tooltipContentStyle: CSSProperties = {
  background: "var(--cmms-bg-card)",
  border: "1px solid var(--cmms-border)",
  borderRadius: 12,
};

const axisTick = { fontSize: 11 } as const;
const axisLabelTickFormatter = (v: any) => truncateLabel(v);

const cartesianGrid = <CartesianGrid strokeDasharray="3 3" stroke="var(--cmms-border)" />;

/** แสดงกราฟ generic หนึ่งตัวจาก backend (bar / stacked / line / composed) */
export function ReportChart({ chart }: { chart: ReportChart }) {
  const data = chart.data ?? [];
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{chart.title}</CardTitle>
          {chart.desc && <CardDescription className="text-xs">{chart.desc}</CardDescription>}
        </CardHeader>
        <CardContent>
          <div
            className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed text-center text-sm"
            style={{ borderColor: "var(--cmms-border)", color: "var(--cmms-text-secondary)" }}
          >
            ยังไม่มีข้อมูลในช่วงที่เลือก
          </div>
        </CardContent>
      </Card>
    );
  }

  const xKey = chart.xKey || "label";
  const hasRightAxis = chart.keys.some((k) => k.axis === "r");
  const showLegend = chart.keys.length > 1;

  const colorOf = (k: ChartSeries) => RPT_TONE_COLOR[k.tone ?? ""] ?? "var(--cmms-primary)";

  const sharedX = (
    <XAxis
      dataKey={xKey}
      tick={axisTick}
      tickFormatter={axisLabelTickFormatter}
      interval={"preserveStartEnd" as any}
      minTickGap={12}
    />
  );

  const tooltip = (
    <Tooltip formatter={tooltipFormatter as any} contentStyle={tooltipContentStyle} />
  );

  const legend = showLegend ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null;

  /* ── line ── */
  if (chart.kind === "line") {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{chart.title}</CardTitle>
          {chart.desc && <CardDescription className="text-xs">{chart.desc}</CardDescription>}
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              {cartesianGrid}
              {sharedX}
              <YAxis tick={axisTick} />
              {tooltip}
              {chart.keys.map((k) => (
                <Line
                  key={k.key}
                  type="monotone"
                  dataKey={k.key}
                  name={k.name}
                  stroke={colorOf(k)}
                  strokeWidth={2.25}
                  dot={{ r: 3, fill: colorOf(k) }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  /* ── composed (แกนซ้าย/ขวา) ── */
  if (chart.kind === "composed") {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{chart.title}</CardTitle>
          {chart.desc && <CardDescription className="text-xs">{chart.desc}</CardDescription>}
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              {cartesianGrid}
              {sharedX}
              <YAxis yAxisId="l" tick={axisTick} />
              {hasRightAxis && <YAxis yAxisId="r" orientation="right" tick={axisTick} />}
              {tooltip}
              {legend}
              {chart.keys.map((k) =>
                k.axis === "r" ? (
                  <Line
                    key={k.key}
                    yAxisId="r"
                    type="monotone"
                    dataKey={k.key}
                    name={k.name}
                    stroke={colorOf(k)}
                    strokeWidth={2.25}
                    dot={{ r: 3, fill: colorOf(k) }}
                  />
                ) : (
                  <Bar
                    key={k.key}
                    yAxisId="l"
                    dataKey={k.key}
                    name={k.name}
                    fill={colorOf(k)}
                    radius={[4, 4, 0, 0]}
                    barSize={26}
                  />
                )
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  /* ── bar / stacked ── */
  const isStacked = chart.kind === "stacked";
  const single = chart.keys.length <= 1;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{chart.title}</CardTitle>
        {chart.desc && <CardDescription className="text-xs">{chart.desc}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            {cartesianGrid}
            {sharedX}
            <YAxis tick={axisTick} allowDecimals={false} />
            {tooltip}
            {legend}
            {chart.keys.map((k) => (
              <Bar
                key={k.key}
                dataKey={k.key}
                name={k.name}
                stackId={isStacked ? "a" : undefined}
                fill={colorOf(k)}
                radius={single ? ([6, 6, 0, 0] as [number, number, number, number]) : [0, 0, 0, 0]}
                barSize={single && data.length < 16 ? 28 : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}