"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, TriangleAlert } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { sendOrEnqueueDetailed } from "@/lib/offlineQueue";
import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import {
  WORKFORCE_API,
  fmtMinutes,
  type Authorization,
  type Certification,
  type Skill,
  type TechnicianDetail,
  type TrainingRecord,
  type UserSkill,
} from "@/lib/workforce";

/**
 * app/(dashboard)/workforce/technicians/[userId]/page.tsx — one person's record (Phase 34)
 *
 * This is the evidence surface behind every assignment decision. It must never imply
 * coverage the evidence does not support:
 *  - an expired certificate is shown as expired, never as satisfied
 *  - a skill with cert_required shows the certificate it is leaning on, or the gap
 *  - `shift_effective` may come from the global planning_* default, and the page
 *    labels which, because a default is not a rostered shift
 */

const SKILL_LEVELS = [
  { v: 1, label: "1 — เฝ้าดู" },
  { v: 2, label: "2 — ทำภายใต้การควบคุม" },
  { v: 3, label: "3 — ทำเองได้" },
  { v: 4, label: "4 — สอนผู้อื่นได้" },
];

function CertBadge({ c }: { c: Certification }) {
  if (c.expired) return <Badge variant="danger">หมดอายุ</Badge>;
  if (c.expiring_soon) {
    return (
      <Badge variant="warning">
        ใกล้หมดอายุ{c.days_to_expiry != null ? ` ${c.days_to_expiry} วัน` : ""}
      </Badge>
    );
  }
  return <Badge variant="success">ใช้งานได้</Badge>;
}

export default function TechnicianDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  const id = Number(userId);
  const hero = usePageHero("workforce/technicians");
  const qc = useQueryClient();

  const [assignOpen, setAssignOpen] = useState(false);
  const [removeSkill, setRemoveSkill] = useState<UserSkill | null>(null);
  const [banner, setBanner] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(
    null
  );

  const { data: cfg } = useApiQuery<{
    config: { require_reason: number | boolean };
    can: { skill_assign: boolean };
    skill_levels: Array<{ level: number; label: string }>;
  }>(["workforce", "config"], `${WORKFORCE_API}?action=config`);

  const { data, isLoading, error } = useApiQuery<TechnicianDetail>(
    ["workforce", "technician", id],
    `${WORKFORCE_API}?action=technician&user_id=${id}`,
    { enabled: Number.isFinite(id) && id > 0 }
  );

  const { data: options } = useApiQuery<{ skills: Skill[] }>(
    ["workforce", "options"],
    `${WORKFORCE_API}?action=options`
  );

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 8000);
    return () => clearTimeout(t);
  }, [banner]);

  const assignSkill = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      sendOrEnqueueDetailed({
        url: WORKFORCE_API,
        method: "POST",
        body,
        kind: "workforce_skill_assign",
        label: `บันทึกทักษะให้ ${data?.user.full_name ?? "ช่าง"}`,
      }),
    onSuccess: (res) => {
      setAssignOpen(false);
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

  const doRemoveSkill = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      sendOrEnqueueDetailed({
        url: WORKFORCE_API,
        method: "POST",
        body,
        kind: "workforce_skill_remove",
        label: `ถอนทักษะของ ${data?.user.full_name ?? "ช่าง"}`,
      }),
    onSuccess: (res) => {
      setRemoveSkill(null);
      if (res.outcome === "sent") {
        setBanner({ tone: "success", text: "นำทักษะออกแล้ว" });
        void qc.invalidateQueries({ queryKey: ["workforce"] });
      } else if (res.outcome === "queued") {
        setBanner({ tone: "warning", text: "บันทึกไว้ในคิวออฟไลน์แล้ว" });
      } else {
        setBanner({
          tone: "danger",
          text: res.message ? `นำทักษะออกไม่สำเร็จ: ${res.message}` : "นำทักษะออกไม่สำเร็จ",
        });
      }
    },
  });

  if (error) {
    const status = (error as { status?: number }).status;
    return (
      <PageShell
        eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
        breadcrumbs={[
          { label: "หน้าแรก", href: "/dashboard" },
          { label: hero.title, href: "/workforce" },
          { label: "ข้อมูลช่าง", href: "/workforce/technicians" },
          { label: "ไม่พบข้อมูล" },
        ]}
        title="ไม่พบข้อมูลช่าง"
        description=""
      >
        <Alert variant="danger">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <div>
            {status === 404
              ? "ไม่พบผู้ใช้รายนี้ในระบบ"
              : "โหลดข้อมูลช่างไม่สำเร็จ"}
          </div>
        </Alert>
        <div className="mt-4">
          <Link
            href="/workforce/technicians"
            className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            กลับไปทะเบียนช่าง
          </Link>
        </div>
      </PageShell>
    );
  }

  const person = data?.user;
  const skills = data?.skills ?? [];
  const certs = data?.certifications ?? [];
  const auths = data?.authorizations ?? [];
  const training = data?.training ?? [];
  const shiftEff = data?.shift_effective;
  const fromDefault = shiftEff?.source !== "shift_assignment";
  const canAssign = cfg?.can.skill_assign === true;
  const requireReason = cfg?.config.require_reason === 1 || cfg?.config.require_reason === true;

  const skillColumns: SimpleColumn<UserSkill>[] = [
    { key: "skill_name", header: "ทักษะ" },
    {
      key: "level_label",
      header: "ระดับ",
      renderCell: (s) => <Badge variant="info">{s.level_label}</Badge>,
    },
    {
      key: "valid_until",
      header: "ใช้ได้ถึง",
      renderCell: (s) =>
        s.expired ? (
          <Badge variant="danger">หมดอายุ</Badge>
        ) : s.valid_until ? (
          s.valid_until
        ) : (
          <span className="text-muted-foreground">ไม่มีวันหมดอายุ</span>
        ),
    },
    {
      key: "gating",
      header: "เงื่อนไขกำกับ",
      renderCell: (s) => (
        <div className="flex flex-wrap gap-1">
          {s.cert_required ? <Badge variant="neutral">ต้องมีใบรับรอง</Badge> : null}
          {s.auth_required ? <Badge variant="neutral">ต้องมีสิทธิ์</Badge> : null}
          {!s.cert_required && !s.auth_required ? (
            <span className="text-muted-foreground">—</span>
          ) : null}
        </div>
      ),
    },
    ...(canAssign
      ? [
          {
            key: "actions",
            header: "",
            hideLabelOnMobile: true,
            enableSorting: false,
            renderCell: (s: UserSkill) => (
              <Button size="sm" variant="outline" onClick={() => setRemoveSkill(s)}>
                ถอน
              </Button>
            ),
          } as SimpleColumn<UserSkill>,
        ]
      : []),
  ];

  const certColumns: SimpleColumn<Certification>[] = [
    {
      key: "name",
      header: "ใบรับรอง",
      renderCell: (c) => (
        <div>
          <div className="font-medium">{c.name}</div>
          {c.certificate_no && (
            <div className="text-xs text-muted-foreground">เลขที่ {c.certificate_no}</div>
          )}
        </div>
      ),
    },
    {
      key: "issued_date",
      header: "ออกเมื่อ",
      renderCell: (c) => c.issued_date ?? "—",
    },
    {
      key: "expiry_date",
      header: "หมดอายุ",
      renderCell: (c) => c.expiry_date ?? "ไม่มีวันหมดอายุ",
    },
    { key: "status", header: "สถานะ", renderCell: (c) => <CertBadge c={c} /> },
  ];

  const authColumns: SimpleColumn<Authorization>[] = [
    { key: "name_th", header: "สิทธิ์" },
    {
      key: "valid_until",
      header: "ใช้ได้ถึง",
      renderCell: (a) =>
        a.expired ? (
          <Badge variant="danger">หมดอายุ</Badge>
        ) : a.valid_until ? (
          a.valid_until
        ) : (
          <span className="text-muted-foreground">ไม่มีวันหมดอายุ</span>
        ),
    },
    {
      key: "status",
      header: "สถานะ",
      renderCell: (a) =>
        a.expired ? (
          <Badge variant="danger">หมดอายุ</Badge>
        ) : a.status === "active" ? (
          <Badge variant="success">ใช้งานได้</Badge>
        ) : (
          <Badge variant="neutral">{a.status}</Badge>
        ),
    },
  ];

  const trainingColumns: SimpleColumn<TrainingRecord>[] = [
    { key: "course_name", header: "หลักสูตร" },
    {
      key: "scheduled_date",
      header: "วันอบรม",
      renderCell: (t) => t.scheduled_date ?? "—",
    },
    {
      key: "status",
      header: "สถานะ",
      renderCell: (t) => <Badge variant={t.status === "completed" ? "success" : "neutral"}>{t.status}</Badge>,
    },
    {
      key: "score",
      header: "คะแนน",
      align: "right",
      renderCell: (t) => (t.score == null ? "—" : t.score),
    },
    {
      key: "granted",
      header: "ทักษะที่ได้รับ",
      renderCell: (t) =>
        t.granted ? (
          <Badge variant="info">ออกหลักฐานแล้ว</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: hero.title, href: "/workforce" },
        { label: "ข้อมูลช่าง", href: "/workforce/technicians" },
        { label: person?.full_name ?? "…" },
      ]}
      title={person?.full_name ?? "กำลังโหลด…"}
      description={
        person
          ? [person.employee_code, person.position, person.department_name]
              .filter(Boolean)
              .join(" · ")
          : ""
      }
      actions={
        canAssign && person ? (
          <Button onClick={() => setAssignOpen(true)}>บันทึกทักษะ</Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {banner && <Alert variant={banner.tone}>{banner.text}</Alert>}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">กะที่มีผล</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {shiftEff ? (
                <>
                  <div className="text-lg font-semibold">
                    {shiftEff.start}–{shiftEff.end}
                  </div>
                  <div className="text-muted-foreground">
                    สุทธิ {fmtMinutes(shiftEff.work_minutes)} · พัก {shiftEff.break_minutes} นาที
                  </div>
                  {fromDefault ? (
                    <Alert variant="warning">
                      <div>
                        ยังไม่มีกะรายบุคคล — ค่านี้มาจากค่าเริ่มต้นของระบบ
                        ไม่ใช่ตารางงานที่ลงไว้จริง
                      </div>
                    </Alert>
                  ) : (
                    <Badge variant="success">จากกะรายบุคคล</Badge>
                  )}
                  {shiftEff.basis && (
                    <p className="text-xs text-muted-foreground">{shiftEff.basis}</p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">ไม่พบข้อมูลกะ</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">สรุปหลักฐาน</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <SummaryLine label="ทักษะที่บันทึก" value={skills.length} />
              <SummaryLine
                label="ใบรับรองใช้งานได้"
                value={certs.filter((c) => !c.expired && c.status === "active").length}
              />
              <SummaryLine
                label="ใบรับรองหมดอายุ"
                value={certs.filter((c) => c.expired).length}
                tone={certs.some((c) => c.expired) ? "danger" : undefined}
              />
              <SummaryLine
                label="สิทธิ์ที่ใช้งานได้"
                value={auths.filter((a) => a.status === "active" && !a.expired).length}
              />
              <SummaryLine label="ประวัติการอบรม" value={training.length} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">สังกัดทีมงาน</CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.crew_memberships ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่ได้อยู่ในทีมใด</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {(data?.crew_memberships ?? []).map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      <Link
                        href="/workforce/crews"
                        className="text-[var(--cmms-primary-hover)] underline-offset-2 hover:underline"
                      >
                        {m.crew_name}
                      </Link>
                      {m.member_role === "lead" && <Badge variant="info">หัวหน้าทีม</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">ทักษะ</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleDataTable<UserSkill>
              columns={skillColumns}
              data={skills}
              idKey="id"
              loading={isLoading}
              skeletonRows={5}
              pageSize={10}
              caption="ทักษะของช่าง"
              emptyTitle="ยังไม่มีข้อมูลทักษะ"
              emptyDescription="ยังไม่มีหลักฐานทักษะที่บันทึกไว้สำหรับช่างคนนี้"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">ใบรับรอง</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleDataTable<Certification>
              columns={certColumns}
              data={certs}
              idKey="id"
              loading={isLoading}
              skeletonRows={4}
              pageSize={10}
              caption="ใบรับรองของช่าง"
              emptyTitle="ยังไม่มีใบรับรอง"
              emptyDescription="ยังไม่มีใบรับรองที่บันทึกไว้"
            />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">สิทธิ์ (Authorization)</CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleDataTable<Authorization>
                columns={authColumns}
                data={auths}
                idKey="id"
                loading={isLoading}
                skeletonRows={3}
                pageSize={10}
                caption="สิทธิ์ของช่าง"
                emptyTitle="ยังไม่มีสิทธิ์"
                emptyDescription="ยังไม่มีสิทธิ์ที่บันทึกไว้"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">ประวัติการอบรม</CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleDataTable<TrainingRecord>
                columns={trainingColumns}
                data={training}
                idKey="id"
                loading={isLoading}
                skeletonRows={3}
                pageSize={10}
                caption="ประวัติการอบรมของช่าง"
                emptyTitle="ยังไม่มีประวัติอบรม"
                emptyDescription="ยังไม่มีการอบรมที่บันทึกไว้"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <AssignSkillDialog
        open={assignOpen}
        skills={options?.skills ?? []}
        already={skills.map((s) => s.skill_id)}
        pending={assignSkill.isPending}
        onClose={() => setAssignOpen(false)}
        onSubmit={(body) => assignSkill.mutate({ ...body, user_id: id })}
      />

      <RemoveSkillDialog
        skill={removeSkill}
        pending={doRemoveSkill.isPending}
        requireReason={requireReason}
        onClose={() => setRemoveSkill(null)}
        onSubmit={(reason) =>
          removeSkill && doRemoveSkill.mutate({ action: "skill_remove", id: removeSkill.id, reason })
        }
      />
    </PageShell>
  );
}

function SummaryLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      {tone === "danger" && value > 0 ? (
        <Badge variant="danger">{value}</Badge>
      ) : (
        <span className="font-medium">{value}</span>
      )}
    </div>
  );
}

function AssignSkillDialog({
  open,
  skills,
  already,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  skills: Skill[];
  already: number[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [skillId, setSkillId] = useState<number | "">("");
  const [level, setLevel] = useState(3);
  const [validUntil, setValidUntil] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setSkillId("");
    setLevel(3);
    setValidUntil("");
    setNote("");
  }, [open]);

  const available = skills.filter((s) => !already.includes(s.id));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="บันทึกทักษะ"
      description="ทักษะที่กำหนดให้ต้องมีใบรับรองหรือสิทธิ์รองรับด้วย — ระบบจะไม่นับทักษะนั้นว่าผ่านจนกว่าจะมีหลักฐานครบ"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button
            disabled={pending || skillId === ""}
            onClick={() =>
              onSubmit({
                action: "skill_assign",
                skill_id: Number(skillId),
                level,
                valid_until: validUntil,
                note: note.trim(),
              })
            }
          >
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="as-skill">
            ทักษะ <span className="text-red-600">*</span>
          </Label>
          <Select value={skillId === "" ? "__none__" : String(skillId)} onValueChange={(v) => setSkillId(v === "__none__" ? "" : Number(v))}>
            <SelectTrigger id="as-skill" className="mt-1">
              <SelectValue placeholder="เลือกทักษะ" />
            </SelectTrigger>
            <SelectContent>
              {available.length === 0 && (
                <SelectItem value="__none__" disabled>
                  มีทักษะครบทุกรายการแล้ว
                </SelectItem>
              )}
              {available.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name_th}
                  {s.min_level ? ` (ขั้นต่ำ ${s.min_level})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="as-level">ระดับที่มี</Label>
            <Select value={String(level)} onValueChange={(v) => setLevel(Number(v))}>
              <SelectTrigger id="as-level" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SKILL_LEVELS.map((l) => (
                  <SelectItem key={l.v} value={String(l.v)}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="as-valid">ใช้ได้ถึง (ว่าง = ไม่มีวันหมดอายุ)</Label>
            <Input
              id="as-valid"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="as-note">หมายเหตุ</Label>
          <Input
            id="as-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น ประเมินจากงานจริงประกอบใบรับรอง"
            className="mt-1"
          />
        </div>
      </div>
    </Dialog>
  );
}

function RemoveSkillDialog({
  skill,
  pending,
  requireReason,
  onClose,
  onSubmit,
}: {
  skill: UserSkill | null;
  pending: boolean;
  requireReason: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (skill) setReason("");
  }, [skill]);

  if (!skill) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`ถอนทักษะ ${skill.skill_name}`}
      description="การถอนหลักฐานอาจทำให้งานที่มอบหมายไว้แล้วขาดคุณสมบัติ — ระบบจะตรวจซ้ำเมื่อมีการเปลี่ยนแปลง"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button
            variant="danger"
            disabled={pending || (requireReason && reason.trim() === "")}
            onClick={() => onSubmit(reason.trim())}
          >
            {pending ? "กำลังถอน…" : "ถอนทักษะ"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          ระดับปัจจุบัน: {skill.level_label}
          {skill.valid_until ? ` · ใช้ได้ถึง ${skill.valid_until}` : ""}
        </p>
        <div>
          <Label htmlFor="rs-reason">
            เหตุผล {requireReason && <span className="text-red-600">*</span>}
          </Label>
          <Input
            id="rs-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1"
            placeholder="เช่าน หลักฐานหมดอายุ"
          />
        </div>
      </div>
    </Dialog>
  );
}
