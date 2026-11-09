"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, TriangleAlert } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { sendOrEnqueueDetailed } from "@/lib/offlineQueue";
import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import {
  WORKFORCE_API,
  type Skill,
  type SkillMatrixResponse,
} from "@/lib/workforce";
import AndonLamp from "@/components/AndonLamp";

/**
 * app/(dashboard)/workforce/skills/page.tsx — skill catalog + coverage matrix (Phase 34)
 *
 * The matrix is the honest picture: a cell is green only when the recorded level meets
 * the catalog minimum AND (if the skill is gated) the certificate/authorization exists.
 * An empty cell is "unrecorded", never "not required" — the two are very different
 * claims and this page refuses to collapse them.
 */

type View = "catalog" | "matrix";

export default function WorkforceSkillsPage() {
  const hero = usePageHero("workforce/skills");
  const qc = useQueryClient();

  const [view, setView] = useState<View>("catalog");
  const [edit, setEdit] = useState<Skill | null | undefined>(undefined);
  const [dept, setDept] = useState("");
  const [banner, setBanner] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(
    null
  );

  const { data: cfg } = useApiQuery<{ can: { skill_manage: boolean; view: boolean } }>(
    ["workforce", "config"],
    `${WORKFORCE_API}?action=config`
  );

  const { data: options } = useApiQuery<{
    departments: Array<{ id: number; name: string }>;
  }>(["workforce", "options"], `${WORKFORCE_API}?action=options`);

  const { data: listData, isLoading: listLoading } = useApiQuery<{ skills: Skill[] }>(
    ["workforce", "skills"],
    `${WORKFORCE_API}?action=skills`
  );

  const { data: matrix, isLoading: matrixLoading } = useApiQuery<SkillMatrixResponse>(
    ["workforce", "skill_matrix", dept],
    `${WORKFORCE_API}?action=skill_matrix&department_id=${dept}`
  );

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 8000);
    return () => clearTimeout(t);
  }, [banner]);

  const saveSkill = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      sendOrEnqueueDetailed({
        url: WORKFORCE_API,
        method: "POST",
        body,
        kind: "workforce_skill",
        label: `บันทึกทักษะ ${body.code ?? ""}`.trim(),
      }),
    onSuccess: (res) => {
      setEdit(undefined);
      if (res.outcome === "sent") {
        setBanner({ tone: "success", text: "บันทึกทักษะเรียบร้อย" });
        void qc.invalidateQueries({ queryKey: ["workforce"] });
      } else if (res.outcome === "queued") {
        setBanner({ tone: "warning", text: "บันทึกไว้ในคิวออฟไลน์แล้ว" });
      } else {
        setBanner({
          tone: "danger",
          text: res.message ? `บันทึกทักษะไม่สำเร็จ: ${res.message}` : "บันทึกทักษะไม่สำเร็จ",
        });
      }
    },
  });

  const skills = useMemo(() => listData?.skills ?? [], [listData]);
  const canManage = cfg?.can.skill_manage === true;

  const gaps = useMemo(() => {
    const cells = matrix?.cells ?? [];
    const peopleCount = new Set(cells.map((c) => c.user_id)).size;
    const total = cells.length;
    const met = cells.filter((c) => c.meets).length;
    const unrecorded = cells.filter((c) => c.level === 0).length;
    return {
      peopleCount,
      total,
      met,
      unrecorded,
      pct: total > 0 ? Math.round((met / total) * 100) : 0,
    };
  }, [matrix?.cells]);

  const catalogColumns: SimpleColumn<Skill>[] = [
    { key: "code", header: "รหัส", renderCell: (s) => <span className="font-mono text-sm">{s.code}</span> },
    {
      key: "name_th",
      header: "ชื่อทักษะ",
      renderCell: (s) => (
        <div>
          <div className="font-medium">{s.name_th}</div>
          {s.name_en && <div className="text-xs text-muted-foreground">{s.name_en}</div>}
        </div>
      ),
    },
    { key: "category", header: "หมวด", renderCell: (s) => <span className="inline-flex items-center gap-1.5 text-xs"><AndonLamp status="idle" size="sm" /><span>{s.category}</span></span> },
    {
      key: "min_level",
      header: "ขั้นต่ำ",
      align: "right",
      renderCell: (s) => s.min_level,
    },
    {
      key: "gating",
      header: "กำกับด้วย",
      renderCell: (s) => (
        <div className="space-y-1 text-xs">
          {s.is_certification_required ? (
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs">
                <AndonLamp status="warn" size="sm" />
                <span>ใบรับรอง</span>
              </span>{" "}
              <span className="text-muted-foreground">
                {s.required_certification_code || "ไม่ระบุรหัส"}
              </span>
            </div>
          ) : null}
          {s.is_authorization_required ? (
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs">
                <AndonLamp status="warn" size="sm" />
                <span>สิทธิ์</span>
              </span>{" "}
              <span className="text-muted-foreground">
                {s.required_authorization_code || "ไม่ระบุรหัส"}
              </span>
            </div>
          ) : null}
          {s.require_any_of ? (
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs">
                <AndonLamp status="idle" size="sm" />
                <span>ผ่านทั้งทีมเพียงพอ</span>
              </span>
            </div>
          ) : null}
          {!s.is_certification_required && !s.is_authorization_required && !s.require_any_of ? (
            <span className="text-muted-foreground">ไม่กำกับ</span>
          ) : null}
        </div>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "",
            hideLabelOnMobile: true,
            enableSorting: false,
            renderCell: (s: Skill) => (
              <Button size="sm" variant="outline" onClick={() => setEdit(s)}>
                แก้ไข
              </Button>
            ),
          } as SimpleColumn<Skill>,
        ]
      : []),
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: hero.title, href: "/workforce" },
        { label: "ทักษะ" },
      ]}
      title={hero.title}
      description={hero.desc}
      actions={
        canManage && (
          <Button onClick={() => setEdit(null)}>เพิ่มทักษะ</Button>
        )
      }
    >
      <div className="space-y-6">
        {banner && <Alert variant={banner.tone}>{banner.text}</Alert>}

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["catalog", "ทะเบียนทักษะ"],
              ["matrix", "ตารางความครอบคลุม"],
            ] as Array<[View, string]>
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                view === v
                  ? "border-[var(--cmms-primary)] bg-[var(--cmms-primary)] text-white"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "catalog" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GraduationCap className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                ทะเบียนทักษะ
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleDataTable<Skill>
                columns={catalogColumns}
                data={skills}
                idKey="id"
                loading={listLoading}
                skeletonRows={8}
                pageSize={20}
                caption="ทะเบียนทักษะ"
                emptyTitle="ยังไม่มีทักษะในทะเบียน"
                emptyDescription="ต้องกำหนดทักษะอย่างน้อยหนึ่งรายการก่อนจะตรวจคุณสมบัติในการมอบหมายงานได้"
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="mx-dept" className="text-xs text-muted-foreground">
                  แผนก
                </label>
                <select
                  id="mx-dept"
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
              <div className="text-sm text-muted-foreground">
                ครอบคลุม {gaps.met}/{gaps.total} ช่อง ({gaps.pct}%) จาก {gaps.peopleCount} คน
              </div>
            </div>

            {gaps.unrecorded > 0 && (
              <Alert variant="warning">
                <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                <div>
                  ช่องสีเทาว่าง {gaps.unrecorded} ช่องหมายถึง <strong>ยังไม่มีข้อมูล</strong> ไม่ใช่ “ไม่ต้องใช้ทักษะนี้”
                  ระบบจะไม่นับช่องเหล่านี้ว่าผ่าน และจะปฏิเสธการมอบหมายงานที่ต้องใช้ทักษะนั้น
                </div>
              </Alert>
            )}

            <Card>
              <CardContent className="pt-6">
                {matrixLoading ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">กำลังโหลดตาราง…</p>
                ) : !matrix || matrix.skills.length === 0 || matrix.people.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    ไม่มีข้อมูลสำหรับสร้างตารางความครอบคลุม
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <caption className="sr-only">
                        ตารางความครอบคลุมทักษะรายช่าง เขียว = ถึงขั้นต่ำ เทา = ยังไม่บันทึก
                      </caption>
                      <thead>
                        <tr>
                          <th
                            scope="col"
                            className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-medium"
                          >
                            ช่าง \ ทักษะ
                          </th>
                          {matrix.skills.map((s) => (
                            <th
                              key={s.id}
                              scope="col"
                              className="px-2 py-2 text-center font-medium"
                              title={`${s.name_th} (ขั้นต่ำ ${s.min_level})`}
                            >
                              <span className="block max-w-[5.5rem] truncate">{s.name_th}</span>
                              <span className="text-xs font-normal text-muted-foreground">
                                ≥{s.min_level}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matrix.people.map((p) => (
                          <tr key={p.id} className="border-t border-border">
                            <th
                              scope="row"
                              className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left font-normal"
                            >
                              {p.full_name}
                            </th>
                            {matrix.skills.map((s) => {
                              const cell = matrix.cells.find(
                                (c) => c.user_id === p.id && c.skill_id === s.id
                              );
                              if (!cell || cell.level === 0) {
                                return (
                                  <td key={s.id} className="px-2 py-1.5 text-center">
                                    <span
                                      className="inline-block h-5 w-5 rounded bg-muted"
                                      title="ยังไม่มีข้อมูล"
                                      aria-label={`${p.full_name} / ${s.name_th}: ยังไม่มีข้อมูล`}
                                    />
                                  </td>
                                );
                              }
                              return (
                                <td key={s.id} className="px-2 py-1.5 text-center">
                                  <span
                                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-xs font-semibold ${
                                      cell.meets
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-amber-100 text-amber-800"
                                    }`}
                                    title={
                                      cell.meets
                                        ? `ระดับ ${cell.level} ถึงขั้นต่ำ ${cell.min_level}`
                                        : `ระดับ ${cell.level} ต่ำกว่าขั้นต่ำ ${cell.min_level}`
                                    }
                                  >
                                    {cell.level}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <SkillDialog
        skill={edit === undefined ? null : edit}
        open={edit !== undefined}
        pending={saveSkill.isPending}
        onClose={() => setEdit(undefined)}
        onSubmit={(body) => saveSkill.mutate(body)}
      />
    </PageShell>
  );
}

function SkillDialog({
  skill,
  open,
  pending,
  onClose,
  onSubmit,
}: {
  skill: Skill | null;
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [code, setCode] = useState("");
  const [nameTh, setNameTh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [category, setCategory] = useState("general");
  const [minLevel, setMinLevel] = useState(1);
  const [certReq, setCertReq] = useState(false);
  const [certCode, setCertCode] = useState("");
  const [authReq, setAuthReq] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    if (!open) return;
    setCode(skill?.code ?? "");
    setNameTh(skill?.name_th ?? "");
    setNameEn(skill?.name_en ?? "");
    setCategory(skill?.category ?? "general");
    setMinLevel(skill?.min_level ?? 1);
    setCertReq(Boolean(skill?.is_certification_required));
    setCertCode(skill?.required_certification_code ?? "");
    setAuthReq(Boolean(skill?.is_authorization_required));
    setAuthCode(skill?.required_authorization_code ?? "");
    setDesc(skill?.description ?? "");
  }, [skill, open]);

  const codeOk = /^[A-Z0-9_-]{2,40}$/.test(code.trim().toUpperCase());
  const invalid = !codeOk || nameTh.trim() === "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={skill ? `แก้ไขทักษะ ${skill.code}` : "เพิ่มทักษะ"}
      description="ทักษะคือสมรรถนะ ไม่ใช่ใบรับรองและไม่ใช่หลักสูตร — ถ้าต้องการหลักฐานเพิ่มให้กำกับด้วยใบรับรองหรือสิทธิ์"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button
            disabled={pending || invalid}
            onClick={() =>
              onSubmit({
                action: "skill_save",
                id: skill?.id ?? 0,
                code: code.trim().toUpperCase(),
                name_th: nameTh.trim(),
                name_en: nameEn.trim(),
                category: category.trim() || "general",
                min_level: minLevel,
                is_certification_required: certReq ? 1 : 0,
                required_certification_code: certReq ? certCode.trim().toUpperCase() : "",
                is_authorization_required: authReq ? 1 : 0,
                required_authorization_code: authReq ? authCode.trim().toUpperCase() : "",
                description: desc.trim(),
                is_active: skill ? (skill.is_active ? 1 : 0) : 1,
              })
            }
          >
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="sk-code">
              รหัส <span className="text-red-600">*</span>
            </Label>
            <Input
              id="sk-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="uppercase"
            />
            {code !== "" && !codeOk && (
              <p className="mt-1 text-xs text-red-600">
                ใช้ได้เฉพาะ A-Z 0-9 _ - ความยาว 2-40
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="sk-cat">หมวด</Label>
            <Input
              id="sk-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="sk-nameth">
              ชื่อทักษะ (ไทย) <span className="text-red-600">*</span>
            </Label>
            <Input id="sk-nameth" value={nameTh} onChange={(e) => setNameTh(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sk-nameen">ชื่อทักษะ (อังกฤษ)</Label>
            <Input id="sk-nameen" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="sk-min">ระดับขั้นต่ำที่ยอมรับได้</Label>
          <Select value={String(minLevel)} onValueChange={(v) => setMinLevel(Number(v))}>
            <SelectTrigger id="sk-min" className="mt-1 w-[9rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  ระดับ {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-3 rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={certReq} onChange={(e) => setCertReq(e.target.checked)} />
            ต้องมีใบรับรองรองรับ
          </label>
          {certReq && (
            <div>
              <Label htmlFor="sk-cert">รหัสใบรับรองที่ต้องการ</Label>
              <Input
                id="sk-cert"
                value={certCode}
                onChange={(e) => setCertCode(e.target.value)}
                placeholder="เช่น ELE_ISOLATION"
                className="mt-1 uppercase"
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={authReq} onChange={(e) => setAuthReq(e.target.checked)} />
            ต้องมีสิทธิ์รองรับ
          </label>
          {authReq && (
            <div>
              <Label htmlFor="sk-auth">รหัสสิทธิ์ที่ต้องการ</Label>
              <Input
                id="sk-auth"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder="เช่น WORK_AT_HEIGHT"
                className="mt-1 uppercase"
              />
            </div>
          )}
          {!certReq && !authReq && (
            <p className="text-xs text-muted-foreground">
              ทักษะนี้ไม่ต้องอาศัยใบรับรองหรือสิทธิ์ — ตรวจจากระดับที่บันทึกไว้อย่างเดียว
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="sk-desc">คำอธิบาย</Label>
          <Textarea
            id="sk-desc"
            rows={2}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>
    </Dialog>
  );
}
