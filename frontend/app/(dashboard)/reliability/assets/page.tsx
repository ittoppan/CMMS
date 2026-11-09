"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { Eye, RefreshCw } from "lucide-react";

import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

import {
  RelEmpty,
  RelError,
  RelFilterBar,
  RelLamp,
  RelLoading,
  RelMetaPanel,
  RelSection,
} from "@/components/reliability/shared";
import { relNavHref, useRelFilters, useRelParam } from "@/lib/useRelFilters";
import {
  RL_ASSET_STATUS_LABELS,
  RL_CRITICALITY_LABELS,
  RL_DASH,
  RL_MATRIX_SORTS,
  rlHours,
  rlMoney,
  rlNum,
  rlPct,
  rlUrl,
  useRelScopeOptions,
  type AssetMatrixRow,
  type RelMatrixResponse,
} from "@/lib/reliability";

/**
 * /reliability/assets — ranked asset matrix (action=asset_matrix).
 *
 * Rows, sort order, pagination and the cost-visibility flag all come from the
 * engine. The page adds a client-side text filter over the *returned* rows only
 * (it never re-computes a metric).
 */

const SORT_LABELS: Record<string, string> = {
  downtime: "เวลาหยุดเครื่อง",
  failures: "จำนวนเหตุเสีย",
  mtbf: "MTBF",
  mttr: "MTTR",
  availability: "ความพร้อม",
  cost: "ต้นทุนบำรุง",
};

function AssetsInner() {
  const hero = usePageHero("reliability/assets");
  const { filters, setFilters, query } = useRelFilters();
  const { data: scopeOptions } = useRelScopeOptions();

  const [sort, setSort] = useRelParam("sort", "downtime");
  const [dir, setDir] = useRelParam("dir", "desc");
  const [page, setPage] = useRelParam("page", "1");
  const [text, setText] = useRelParam("q", "");

  const url = useMemo(
    () => rlUrl("asset_matrix", filters, { sort, dir, page, page_size: 25 }),
    [filters, sort, dir, page],
  );

  const { data, isLoading, error, refetch, isFetching } = useApiQuery<RelMatrixResponse>(
    ["reliability", "asset_matrix", filters, sort, dir, page],
    url,
  );

  const matrix = data?.matrix;
  const rows = matrix?.rows ?? [];

  /** text filter over the rows the engine already returned */
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.asset_code, r.asset_name, r.category, r.criticality, r.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, text]);

  const columns: SimpleColumn<AssetMatrixRow>[] = [
    {
      key: "asset_code",
      header: "รหัสเครื่อง",
      renderCell: (r) => (
        <Link
          href={relNavHref(`/reliability/assets/${r.asset_id}`, query)}
          className="font-medium underline-offset-2 hover:underline"
        >
          {r.asset_code}
        </Link>
      ),
    },
    { key: "asset_name", header: "ชื่อเครื่อง" },
    {
      key: "criticality",
      header: "วิกฤต",
      align: "center",
      renderCell: (r) => RL_CRITICALITY_LABELS[r.criticality]?.th ?? r.criticality ?? RL_DASH,
    },
    {
      key: "status",
      header: "สถานะ",
      align: "center",
      renderCell: (r) => RL_ASSET_STATUS_LABELS[r.status]?.th ?? r.status ?? RL_DASH,
    },
    {
      key: "failure_count",
      header: "เหตุเสีย",
      align: "right",
      renderCell: (r) => (r.failure_count === null ? RL_DASH : rlNum(r.failure_count, 0)),
    },
    {
      key: "mtbf_hours",
      header: "MTBF (ชม.)",
      align: "right",
      renderCell: (r) => rlHours(r.mtbf_hours),
    },
    {
      key: "mttr_hours",
      header: "MTTR (ชม.)",
      align: "right",
      renderCell: (r) => rlHours(r.mttr_hours),
    },
    {
      key: "downtime_hours",
      header: "หยุดเครื่อง (ชม.)",
      align: "right",
      renderCell: (r) => rlHours(r.downtime_hours),
    },
    {
      key: "availability_pct",
      header: "ความพร้อม",
      align: "right",
      renderCell: (r) => rlPct(r.availability_pct),
    },
    {
      key: "maintenance_cost",
      header: "ต้นทุน",
      align: "right",
      renderCell: (r) => {
        if (!matrix?.cost_visible) return RL_DASH;
        if (!r.cost_available) {
          return (
            <span title={rlNum(r.cost_lines_missing_price, 0)} className="text-muted-foreground">
              ไม่ครบราคา
            </span>
          );
        }
        return rlMoney(r.maintenance_cost);
      },
    },
    {
      key: "detail",
      header: "",
      align: "center",
      hideLabelOnMobile: true,
      renderCell: (r) => (
        <Link
          href={relNavHref(`/reliability/assets/${r.asset_id}`, query)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
          ดู
        </Link>
      ),
    },
  ];

  const totalPages = matrix ? Math.max(1, Math.ceil((matrix.total ?? 0) / (matrix.page_size || 25))) : 1;

  return (
    <PageShell
      eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
      title={hero.title}
      description={hero.desc}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "วิศวกรรมความเสียหาย", href: relNavHref("/reliability", query) },
        { label: "ความเสียหายรายเครื่อง" },
      ]}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
          รีเฟรช
        </Button>
      }
    >
      <RelFilterBar value={filters} onChange={setFilters} options={scopeOptions ?? null} showBasis={false} />

      {error && <RelError message={error.message} />}
      {isLoading && <RelLoading />}

      {matrix && (
        <>
          {matrix.note && (
            <p className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {matrix.note}
            </p>
          )}

          <RelSection
            title={`จัดอันดับ ${matrix.total ?? 0} เครื่อง`}
            description={
              <>
                เรียงตาม {SORT_LABELS[matrix.sort] ?? matrix.sort} (
                {matrix.dir === "asc" ? "น้อย → มาก" : "มาก → น้อย"})
                {!matrix.cost_visible && " · บทบาทของคุณไม่ได้ดูต้นทุนบำรุง"}
              </>
            }
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="search"
                  label="ค้นหาเครื่อง"
                  isLabelHidden
                  aria-label="ค้นหาเครื่อง"
                  placeholder="ค้นหารหัสหรือชื่อเครื่อง"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="w-full sm:w-[220px]"
                />
                <Select value={sort} onValueChange={(v) => { setSort(v); setPage("1"); }}>
                  <SelectTrigger aria-label="เรียงตาม" className="w-full sm:w-[180px]">
                    <SelectValue placeholder="เรียงตาม" />
                  </SelectTrigger>
                  <SelectContent>
                    {RL_MATRIX_SORTS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {SORT_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={dir} onValueChange={(v) => setDir(v)}>
                  <SelectTrigger aria-label="ลำดับ" className="w-full sm:w-[140px]">
                    <SelectValue placeholder="ลำดับ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">มาก → น้อย</SelectItem>
                    <SelectItem value="asc">น้อย → มาก</SelectItem>
                  </SelectContent>
                </Select>
                <Link
                  href={relNavHref("/reliability/failure-modes", query)}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Pareto
                </Link>
              </div>
            }
          >
            <Card>
              <CardContent className="pt-4">
                {shown.length === 0 ? (
                  <RelEmpty
                    title="ไม่พบเครื่องจักรที่ตรงเงื่อนไข"
                    description={
                      rows.length === 0
                        ? "ในขอบเขตและช่วงเวลานี้ไม่มีข้อมูลความเสียหายของเครื่องใดเลย — ค่าที่ไม่มีข้อมูลจะไม่ถูกแสดงเป็น 0"
                        : "ลองเปลี่ยนคำค้นหาให้สั้นลง"
                    }
                  />
                ) : (
                  <SimpleDataTable
                    columns={columns}
                    data={shown}
                    idKey="asset_id"
                    pageSize={25}
                  />
                )}
              </CardContent>
            </Card>
          </RelSection>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              หน้า {matrix.page} / {totalPages} · แสดง {shown.length} จาก {rows.length} แถวในหน้านี้
              {matrix.has_more && " · มีข้อมูลเพิ่มเติมในหน้าถัดไป"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= "1"}
                onClick={() => setPage(String(Math.max(1, Number(page) - 1)))}
              >
                ก่อนหน้า
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!matrix.has_more}
                onClick={() => setPage(String(Number(page) + 1))}
              >
                ถัดไป
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RelMetaPanel meta={matrix.meta} />
            <Card>
              <CardContent className="space-y-2 pt-6 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">สถานะข้อมูลของตาราง</span>
                  <RelLamp status={matrix.status} showStatusCode />
                </div>
                <p className="text-xs text-muted-foreground">
                  {matrix.cost_visible
                    ? "บทบาทของคุณเห็นต้นทุนบำรุงในตารางนี้"
                    : "บทบาทของคุณไม่ได้รับสิทธิ์ดูต้นทุนบำรุง (RL_ROLES_COST) — ค่าในคอลัมน์ต้นทุนถูกซ่อน ไม่ใช่ 0"}
                </p>
                <p className="text-xs text-muted-foreground">
                  แถวที่ขึ้น “ไม่ครบราคา” หมายถึงมีรายการต้นทุนบางรายการที่ไม่มีราคา โดยจำนวนรายการที่ขาดราคาถูกนับ
                  ไว้ที่รายเครื่องในคอลัมน์ “ไม่ครบราคา” ไม่มีการรวมซ้ำในหน้านี้
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </PageShell>
  );
}

export default function ReliabilityAssetsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      <AssetsInner />
    </Suspense>
  );
}
