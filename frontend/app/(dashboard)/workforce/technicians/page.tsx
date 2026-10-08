"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TriangleAlert, UserCog } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { KpiCard } from "@/components/dashboard/kit";
import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { WORKFORCE_API, type TechnicianRow } from "@/lib/workforce";
import AndonLamp from "@/components/AndonLamp";

/**
 * app/(dashboard)/workforce/technicians/page.tsx — people directory (Phase 34)
 *
 * Counts here are honest per-person counts, not a coverage claim. A technician with
 * 0 skills is NOT "fully qualified for everything" — they are simply unrecorded, so
 * the page says so rather than letting a green number imply readiness.
 */

export default function WorkforceTechniciansPage() {
  const hero = usePageHero("workforce/technicians");

  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [flag, setFlag] = useState<"" | "no_shift" | "expired" | "unrecorded">("");

  const { data: options } = useApiQuery<{
    departments: Array<{ id: number; name: string }>;
  }>(["workforce", "options"], `${WORKFORCE_API}?action=options`);

  const { data, isLoading } = useApiQuery<{ technicians: TechnicianRow[] }>(
    ["workforce", "technicians", q, dept],
    `${WORKFORCE_API}?action=technicians&q=${encodeURIComponent(q)}&department_id=${dept}`
  );

  const rows = useMemo(() => {
    const list = data?.technicians ?? [];
    if (!flag) return list;
    if (flag === "no_shift") return list.filter((r) => !r.has_shift);
    if (flag === "expired") return list.filter((r) => r.expired_cert_count > 0);
    return list.filter((r) => r.skill_count === 0);
  }, [data?.technicians, flag]);

  const totals = useMemo(() => {
    const list = data?.technicians ?? [];
    return {
      headcount: list.length,
      noShift: list.filter((r) => !r.has_shift).length,
      expired: list.filter((r) => r.expired_cert_count > 0).length,
      unrecorded: list.filter((r) => r.skill_count === 0).length,
    };
  }, [data?.technicians]);

  const columns: SimpleColumn<TechnicianRow>[] = [
    {
      key: "full_name",
      header: "ชื่อ",
      renderCell: (r) => (
        <div>
          <Link
            href={`/workforce/technicians/${r.id}`}
            className="font-medium text-[var(--cmms-primary-hover)] underline-offset-2 hover:underline"
          >
            {r.full_name}
          </Link>
          <div className="text-xs text-muted-foreground">
            {r.employee_code ?? "ไม่มีรหัส"}
            {r.position ? ` · ${r.position}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "department_name",
      header: "แผนก",
      renderCell: (r) => r.department_name ?? "—",
    },
{
          key: "role_name",
          header: "บทบาท",
          renderCell: (r) => <span className="inline-flex items-center gap-1.5 text-xs"><AndonLamp status="idle" size="sm" /><span>{r.role_name ?? "—"}</span></span>,
        },
        {
          key: "top_skills",
          header: "ทักษะ",
          renderCell: (r) =>
            r.skill_count === 0 ? (
              <AndonLamp status="warn" size="sm" showLabel />
            ) : (
              <div className="flex flex-wrap gap-1">
                {(r.top_skills ?? []).map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5 text-xs">
                    <AndonLamp status="idle" size="sm" />
                    <span>{s}</span>
                  </span>
                ))}
                {r.skill_count > (r.top_skills?.length ?? 0) && (
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <AndonLamp status="idle" size="sm" />
                    <span>+{r.skill_count - (r.top_skills?.length ?? 0)}</span>
                  </span>
                )}
              </div>
            ),
        },
    {
      key: "valid_cert_count",
      header: "ใบรับรองใช้งานได้",
      align: "right",
      renderCell: (r) => <span className="font-medium">{r.valid_cert_count}</span>,
    },
{
          key: "expired_cert_count",
          header: "หมดอายุ",
          align: "right",
          renderCell: (r) =>
            r.expired_cert_count > 0 ? (
              <AndonLamp status="down" size="sm" showLabel />
            ) : (
              <span className="text-muted-foreground">0</span>
            ),
        },
        {
          key: "active_auth_count",
          header: "สิทธิ์",
          align: "right",
          renderCell: (r) => <span>{r.active_auth_count}</span>,
        },
        {
          key: "has_shift",
          header: "กะ",
          align: "center",
          renderCell: (r) =>
            r.has_shift ? (
              <AndonLamp status="ok" size="sm" showLabel />
            ) : (
              <AndonLamp status="down" size="sm" showLabel />
            ),
        },
  ];

  const flagged =
    flag === "no_shift" ? totals.noShift : flag === "expired" ? totals.expired : flag === "unrecorded" ? totals.unrecorded : 0;

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: hero.title, href: "/workforce" },
        { label: "ข้อมูลช่าง" },
      ]}
      title={hero.title}
      description={hero.desc}
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="ช่างทั้งหมด" value={totals.headcount} unit="คน" />
          <KpiCard
            label="ไม่มีข้อมูลกะ"
            value={totals.noShift}
            unit="คน"
            tone={totals.noShift > 0 ? "amber" : ""}
          />
          <KpiCard
            label="มีใบรับรองหมดอายุ"
            value={totals.expired}
            unit="คน"
            tone={totals.expired > 0 ? "red" : ""}
          />
          <KpiCard
            label="ยังไม่มีข้อมูลทักษะ"
            value={totals.unrecorded}
            unit="คน"
            tone={totals.unrecorded > 0 ? "amber" : ""}
          />
        </div>

        {totals.unrecorded > 0 && (
          <Alert variant="warning">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            <div>
              มี {totals.unrecorded} คนที่ยังไม่มีข้อมูลทักษะที่บันทึกไว้
              การไม่มีข้อมูล<strong>ไม่ได้แปลว่าไม่มีความสามารถ</strong> — แต่ระบบจะไม่นับเป็นคุณสมบัติ
              ในการตรวจการมอบหมายงานจนกว่าจะบันทึกหลักฐาน
            </div>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCog className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              ทะเบียนช่าง
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="tc-q" className="text-xs text-muted-foreground">
                  ค้นหา
                </label>
                <Input
                  id="tc-q"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ชื่อหรือรหัสพนักงาน"
                  className="mt-1 w-[14rem]"
                />
              </div>
              <div>
                <label htmlFor="tc-dept" className="text-xs text-muted-foreground">
                  แผนก
                </label>
                <select
                  id="tc-dept"
                  value={dept}
                  onChange={(e) => setDept(e.target.value)}
                  className="mt-1 h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="">ทุกแผนก</option>
                  {(options?.departments ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["", "ทั้งหมด"],
                    ["no_shift", `ไม่มีกะ (${totals.noShift})`],
                    ["expired", `ใบรับรองหมดอายุ (${totals.expired})`],
                    ["unrecorded", `ไม่มีทักษะ (${totals.unrecorded})`],
                  ] as Array<[string, string]>
                ).map(([v, label]) => (
                  <button
                    key={v || "all"}
                    type="button"
                    onClick={() => setFlag(v as typeof flag)}
                    aria-pressed={flag === v}
                    className={`rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
                      flag === v
                        ? "border-[var(--cmms-primary)] bg-[var(--cmms-primary)] text-white"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <SimpleDataTable<TechnicianRow>
              columns={columns}
              data={rows}
              idKey="id"
              loading={isLoading}
              skeletonRows={10}
              pageSize={20}
              caption="ทะเบียนช่าง"
              emptyTitle="ไม่พบช่าง"
                emptyDescription={
                  flag ? `ไม่มีช่างที่เข้าเกณฑ์ตัวกรอง (${flagged})` : "ยังไม่มีช่างที่ตรงกับเงื่อนไขการค้นหา"
                }
            />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
