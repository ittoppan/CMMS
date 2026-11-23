"use client";

/**
 * leaf components ของกราฟ wallboard — แยกไฟล์เพื่อให้ Recharts ถูก bundle เป็น chunk ต่างหาก
 * (โหลดด้วย next/dynamic ในหน้า page.tsx) โครง JSX เหมือนของเดิมทุกจุด
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTip } from "@/components/charts";
import { TOWER_PALETTE as C } from "@/lib/dashboard-tower";
import type { MonthlyPoint, MtbfMttrPoint } from "@/lib/dashboard-tower";

export type Slice = { name: string; value: number; color: string };
export type DowntimeRow = { code: string; hours: number };

export function MonthlyOverviewChart({ data, font }: { data: MonthlyPoint[]; font: number }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 2, bottom: 0, left: -22 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: C.text3, fontSize: font }}
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <YAxis
          yAxisId="left"
          tick={{ fill: C.text3, fontSize: font }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={42}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 100]}
          tick={{ fill: C.text3, fontSize: font }}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(140, 180, 225, 0.08)" }} />
        <Bar yAxisId="left" dataKey="created" name="Work Orders" fill={C.blue} radius={[2, 2, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="rate"
          name="Completion Rate"
          stroke={C.green}
          strokeWidth={2}
          connectNulls
          dot={{ r: 2.4, fill: C.green, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ slices }: { slices: Slice[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={slices} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="97%" paddingAngle={2} stroke="none" isAnimationActive={false}>
          {slices.map((s) => (
            <Cell key={s.name} fill={s.color} />
          ))}
        </Pie>
        <Tooltip content={<ChartTip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function MtbfMttrChart({ points, font }: { points: MtbfMttrPoint[]; font: number }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={points} margin={{ top: 8, right: 2, bottom: 0, left: -22 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: C.text3, fontSize: font }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="left" tick={{ fill: C.text3, fontSize: font }} tickLine={false} axisLine={false} width={40} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: C.text3, fontSize: font }} tickLine={false} axisLine={false} width={34} />
        <Tooltip content={<ChartTip unit="ชม." />} />
        <Line yAxisId="left" type="monotone" dataKey="mtbf" name="MTBF" stroke={C.blue} strokeWidth={2} dot={{ r: 2.4, fill: C.blue, strokeWidth: 0 }} isAnimationActive={false} />
        <Line yAxisId="right" type="monotone" dataKey="mttr" name="MTTR" stroke={C.green} strokeWidth={2} dot={{ r: 2.4, fill: C.green, strokeWidth: 0 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function TopDowntimeChart({ rows, font }: { rows: DowntimeRow[]; font: number }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 34, bottom: 0, left: 4 }}>
        <CartesianGrid stroke={C.grid} horizontal={false} />
        <XAxis type="number" tick={{ fill: C.text3, fontSize: font }} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="code"
          width={70}
          tick={{ fill: C.text3, fontSize: font }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTip unit="ชม." />} cursor={{ fill: "rgba(140, 180, 225, 0.08)" }} />
        <Bar dataKey="hours" name="Downtime" fill={C.blue} radius={[0, 3, 3, 0]} maxBarSize={16} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
