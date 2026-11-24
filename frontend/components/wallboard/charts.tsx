"use client";

/**
 * leaf components ของกราฟ wallboard — ใช้ SVG เขียนเอง (ไม่มี Recharts)
 * เพื่อลด Total Blocking Time (TBT) บน wallboard
 */
import { TOWER_PALETTE as C } from "@/lib/dashboard-tower";
import type { MonthlyPoint, MtbfMttrPoint } from "@/lib/dashboard-tower";

export type Slice = { name: string; value: number; color: string };
export type DowntimeRow = { code: string; hours: number };

/* ── helpers ──────────────────────────────────────────────────────── */

function maxOf(nums: number[]): number {
  let m = 0;
  for (const n of nums) if (n > m) m = n;
  return m || 1;
}

/* ── MonthlyOverviewChart ─────────────────────────────────────────── */

export function MonthlyOverviewChart({ data, font }: { data: MonthlyPoint[]; font: number }) {
  const W = 320;
  const H = 180;
  const ml = 32;
  const mr = 34;
  const mt = 8;
  const mb = 22;
  const pw = W - ml - mr;
  const ph = H - mt - mb;

  const createds = data.map((d) => d.created);
  const rates = data.map((d) => (d.rate == null ? 0 : d.rate));
  const maxCreated = maxOf(createds);
  const n = data.length || 1;
  const slot = pw / n;
  const barW = Math.max(4, slot * 0.55);

  const xFor = (i: number) => ml + slot * i + slot / 2;
  const yCreated = (v: number) => mt + ph - (v / maxCreated) * ph;
  const yRate = (v: number) => mt + ph - (v / 100) * ph;

  // line path for rate
  let linePath = "";
  let started = false;
  data.forEach((d, i) => {
    if (d.rate == null) return;
    const x = xFor(i);
    const y = yRate(d.rate);
    if (!started) {
      linePath += `M ${x} ${y}`;
      started = true;
    } else {
      linePath += ` L ${x} ${y}`;
    }
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      {/* grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <line key={i} x1={ml} x2={W - mr} y1={mt + ph * (1 - t)} y2={mt + ph * (1 - t)} stroke={C.grid} strokeWidth={0.5} />
      ))}
      {/* bars */}
      {data.map((d, i) => {
        const h = (d.created / maxCreated) * ph;
        const x = xFor(i) - barW / 2;
        const y = mt + ph - h;
        return <rect key={i} x={x} y={y} width={barW} height={h} fill={C.blue} rx={2} />;
      })}
      {/* rate line */}
      {linePath && <path d={linePath} fill="none" stroke={C.green} strokeWidth={2} />}
      {/* dots */}
      {data.map((d, i) => {
        if (d.rate == null) return null;
        return <circle key={i} cx={xFor(i)} cy={yRate(d.rate)} r={2.4} fill={C.green} />;
      })}
      {/* x labels */}
      {data.map((d, i) => (
        <text key={i} x={xFor(i)} y={H - 4} textAnchor="middle" fontSize={font} fill={C.text3}>
          {d.label}
        </text>
      ))}
      {/* left y labels */}
      {[0, Math.round(maxCreated / 2), maxCreated].map((v, i) => (
        <text key={i} x={ml - 4} y={yCreated(v) + 3} textAnchor="end" fontSize={font} fill={C.text3}>
          {v}
        </text>
      ))}
      {/* right y labels */}
      {[0, 50, 100].map((v, i) => (
        <text key={i} x={W - mr + 4} y={yRate(v) + 3} textAnchor="start" fontSize={font} fill={C.text3}>
          {v}%
        </text>
      ))}
    </svg>
  );
}

/* ── DonutChart ───────────────────────────────────────────────────── */

export function DonutChart({ slices }: { slices: Slice[] }) {
  const cx = 50;
  const cy = 50;
  const r = 42;
  const inner = 28;
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const arcs = slices.map((s) => {
    const start = acc / total;
    acc += s.value;
    const end = acc / total;
    return { ...s, start, end };
  });

  // build arc paths
  function arcPath(start: number, end: number, outerR: number, innerR: number): string {
    const a0 = start * Math.PI * 2 - Math.PI / 2;
    const a1 = end * Math.PI * 2 - Math.PI / 2;
    const large = end - start > 0.5 ? 1 : 0;
    const x0o = cx + outerR * Math.cos(a0);
    const y0o = cy + outerR * Math.sin(a0);
    const x1o = cx + outerR * Math.cos(a1);
    const y1o = cy + outerR * Math.sin(a1);
    const x1i = cx + innerR * Math.cos(a1);
    const y1i = cy + innerR * Math.sin(a1);
    const x0i = cx + innerR * Math.cos(a0);
    const y0i = cy + innerR * Math.sin(a0);
    return `M ${x0o} ${y0o} A ${outerR} ${outerR} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${innerR} ${innerR} 0 ${large} 0 ${x0i} ${y0i} Z`;
  }

  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
      {arcs.map((a, i) => (
        <path key={i} d={arcPath(a.start, a.end, r, inner)} fill={a.color} stroke="none" />
      ))}
    </svg>
  );
}

/* ── MtbfMttrChart ────────────────────────────────────────────────── */

export function MtbfMttrChart({ points, font }: { points: MtbfMttrPoint[]; font: number }) {
  const W = 320;
  const H = 180;
  const ml = 32;
  const mr = 30;
  const mt = 8;
  const mb = 22;
  const pw = W - ml - mr;
  const ph = H - mt - mb;

  const mtbfs = points.map((p) => (p.mtbf == null ? 0 : p.mtbf));
  const mttrs = points.map((p) => (p.mttr == null ? 0 : p.mttr));
  const maxL = maxOf(mtbfs);
  const maxR = maxOf(mttrs);
  const n = points.length || 1;
  const slot = pw / n;
  const xFor = (i: number) => ml + slot * i + slot / 2;
  const yL = (v: number) => mt + ph - (v / maxL) * ph;
  const yR = (v: number) => mt + ph - (v / maxR) * ph;

  function linePath(vals: (number | null)[], yFn: (v: number) => number): string {
    let p = "";
    let started = false;
    vals.forEach((v, i) => {
      if (v == null) return;
      const x = xFor(i);
      const y = yFn(v);
      if (!started) {
        p += `M ${x} ${y}`;
        started = true;
      } else {
        p += ` L ${x} ${y}`;
      }
    });
    return p;
  }

  const pathL = linePath(points.map((p) => p.mtbf), yL);
  const pathR = linePath(points.map((p) => p.mttr), yR);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <line key={i} x1={ml} x2={W - mr} y1={mt + ph * (1 - t)} y2={mt + ph * (1 - t)} stroke={C.grid} strokeWidth={0.5} />
      ))}
      {pathL && <path d={pathL} fill="none" stroke={C.blue} strokeWidth={2} />}
      {pathR && <path d={pathR} fill="none" stroke={C.green} strokeWidth={2} />}
      {points.map((p, i) => {
        if (p.mtbf != null) {
          return <circle key={`l${i}`} cx={xFor(i)} cy={yL(p.mtbf)} r={2.4} fill={C.blue} />;
        }
        return null;
      })}
      {points.map((p, i) => {
        if (p.mttr != null) {
          return <circle key={`r${i}`} cx={xFor(i)} cy={yR(p.mttr)} r={2.4} fill={C.green} />;
        }
        return null;
      })}
      {points.map((p, i) => (
        <text key={i} x={xFor(i)} y={H - 4} textAnchor="middle" fontSize={font} fill={C.text3}>
          {p.label}
        </text>
      ))}
    </svg>
  );
}

/* ── TopDowntimeChart (horizontal bars) ───────────────────────────── */

export function TopDowntimeChart({ rows, font }: { rows: DowntimeRow[]; font: number }) {
  const W = 320;
  const H = 180;
  const ml = 74;
  const mr = 34;
  const mt = 4;
  const mb = 4;
  const pw = W - ml - mr;
  const ph = H - mt - mb;
  const n = rows.length || 1;
  const slot = ph / n;
  const barH = Math.max(6, slot * 0.55);
  const maxH = maxOf(rows.map((r) => r.hours));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      {rows.map((r, i) => {
        const y = mt + slot * i + (slot - barH) / 2;
        const w = (r.hours / maxH) * pw;
        return (
          <g key={i}>
            <text x={ml - 4} y={y + barH / 2 + 3} textAnchor="end" fontSize={font} fill={C.text3}>
              {r.code}
            </text>
            <rect x={ml} y={y} width={w} height={barH} fill={C.blue} rx={3} />
            <text x={ml + w + 4} y={y + barH / 2 + 3} fontSize={font} fill={C.text3}>
              {r.hours}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
