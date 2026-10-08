"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { ShieldAlert, TriangleAlert } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { sendOrEnqueueDetailed } from "@/lib/offlineQueue";
import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import {
  WORKFORCE_API,
  type Candidate,
  type CandidatesResponse,
  type ReadinessResponse,
  type RequiredSkill,
} from "@/lib/workforce";

/**
 * app/(dashboard)/workforce/conflicts/page.tsx — readiness & candidate ranking (Phase 34)
 *
 * Two hard rules this screen must never break:
 *  1. It only RANKS. There is no auto-assign control anywhere in this file — the engine
 *     exposes no such action and `workforce_block_unqualified` defaults to blocking.
 *     Assignment stays a deliberate human decision made with the reasons on screen.
 *  2. Every non-eligible candidate carries concrete reason codes. A row that is merely
 *     "not selected" with no stated reason is a bug, not a state, so `reason_codes` is
 *     required and rendered verbatim.
 */

const REASON_LABEL: Record<string, string> = {
  SKILL_GAP: "ขาดทักษะที่กำหนด",
  CERT_EXPIRED: "ใบรับรองหมดอายุ",
  CERT_MISSING: "ไม่มีใบรับรองที่ต้องใช้",
  AUTH_MISSING: "ไม่มีสิทธิ์ที่ต้องใช้",
  OUTSIDE_SHIFT: "อยู่นอกเวลาทำงานตามกะ",
  ON_LEAVE: "อยู่ระหว่างวันลา",
  IN_TRAINING: "กำลังเข้าอบรม",
  OVER_CAPACITY: "ภาระเกินความจุ",
  NO_SKILL_DATA: "ไม่มีข้อมูลทักษะให้ตรวจสอบ",
  UNMAPPED_REQUIREMENT: "ข้อกำหนดยังไม่ผูกกับทักษะในทะเบียน",
  BELOW_MIN_LEVEL: "ระดับต่ำกว่าขั้นต่ำ",
};

const STATE_VARIANT: Record<string, "success" | "warning" | "danger"> = {
  READY: "success",
  PARTIAL: "warning",
  BLOCKED: "danger",
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function reasonText(code: string, detail?: string): string {
  return detail ? `${REASON_LABEL[code] ?? code} — ${detail}` : (REASON_LABEL[code] ?? code);
}

export default function WorkforceConflictsPage() {
  const hero = usePageHero("workforce/conflicts");
  const qc = useQueryClient();

  const [woId, setWoId] = useState("");
  const [applied, setApplied] = useState("");
  const [date, setDate] = useState(isoToday);
  const [assignFor, setAssignFor] = useState<Candidate | null>(null);
  const [banner, setBanner] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(
    null
  );

  const id = Number(applied);
  const ready = applied !== "" && Number.isFinite(id) && id > 0;

  const { data: cfg } = useApiQuery<{ can: { assignment_manage: boolean } }>(
    ["workforce", "config"],
    `${WORKFORCE_API}?action=config`
  );

  const { data: readiness, isLoading: rLoading } = useApiQuery<ReadinessResponse>(
    ["workforce", "readiness", id],
    `${WORKFORCE_API}?action=readiness&work_order_id=${id}`,
    { enabled: ready }
  );

  const { data: candidates, isLoading: cLoading } = useApiQuery<CandidatesResponse>(
    ["workforce", "candidates", id, date],
    `${WORKFORCE_API}?action=candidates&work_order_id=${id}&date=${date}`,
    { enabled: ready }
  );

  const { data: gap } = useApiQuery<{ required: RequiredSkill[]; unmapped: string[] }>(
    ["workforce", "gap", id],
    `${WORKFORCE_API}?action=gap&work_order_id=${id}`,
    { enabled: ready }
  );

  const assign = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      sendOrEnqueueDetailed({
        url: WORKFORCE_API,
        method: "POST",
        body,
        kind: "workforce_assign",
        label: `มอบหมายงานให้ user #${String(body.user_ids)}`,
      }),
    onSuccess: (res) => {
      setAssignFor(null);
      if (res.outcome === "sent") {
        setBanner({ tone: "success", text: "บันทึกการมอบหมายเรียบร้อย" });
        void qc.invalidateQueries({ queryKey: ["workforce"] });
      } else if (res.outcome === "queued") {
        setBanner({ tone: "warning", text: "บันทึกไว้ในคิวออฟไลน์แล้ว" });
      } else {
        setBanner({
          tone: "danger",
          text: res.message
            ? `มอบหมายไม่สำเร็จ: ${res.message}`
            : "มอบหมายไม่สำเร็จ",
        });
      }
    },
  });

  const blockedCount = useMemo(
    () => (candidates?.candidates ?? []).filter((c) => !c.eligible).length,
    [candidates]
  );
  const eligibleCount = useMemo(
    () => (candidates?.candidates ?? []).filter((c) => c.eligible).length,
    [candidates]
  );
  const canAssign = cfg?.can.assignment_manage === true;

  const candidateColumns: SimpleColumn<Candidate>[] = [
    {
      key: "full_name",
      header: "ช่าง",
      renderCell: (c) => (
        <div>
          <div className="font-medium">{c.full_name}</div>
          {c.position && <div className="text-xs text-muted-foreground">{c.position}</div>}
        </div>
      ),
    },
    {
      key: "verdict",
      header: "ผลการตรวจ",
      renderCell: (c) => {
        if (c.verdict === "ELIGIBLE") return <Badge variant="success">ผ่าน</Badge>;
        if (c.verdict === "OVER_CAPACITY") return <Badge variant="warning">เกินความจุ</Badge>;
        return <Badge variant="danger">ไม่ผ่าน</Badge>;
      },
    },
    {
      key: "reason_codes",
      header: "เหตุผล",
      renderCell: (c) =>
        c.reason_codes.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <ul className="space-y-0.5">
            {c.reasons.map((r, i) => (
              <li key={`${r.code}-${i}`} className="text-xs text-muted-foreground">
                • {reasonText(r.code, r.detail)}
              </li>
            ))}
          </ul>
        ),
    },
    {
      key: "matched_skills",
      header: "ทักษะที่ผ่าน",
      renderCell: (c) =>
        c.matched_skills.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {c.matched_skills.map((s) => (
              <Badge key={s} variant="info">
                {s}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: "utilization_pct",
      header: "อัตราการใช้",
      align: "right",
      renderCell: (c) => (
        <div>
          <div className="font-medium">{c.utilization_pct}%</div>
          <div className="text-xs text-muted-foreground">งานค้าง {c.active_jobs}</div>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      hideLabelOnMobile: true,
      enableSorting: false,
      renderCell: (c) => (
        <Button
          size="sm"
          variant="outline"
          disabled={!canAssign || !c.eligible}
          title={
            canAssign
              ? c.eligible
                ? "มอบหมายงานนี้ให้ช่างคนนี้"
                : "ช่างคนนี้ยังไม่ผ่านการตรวจ จึงมอบหมายไม่ได้"
              : "ต้องมีสิทธิ์ workforce.assignment_manage"
          }
          onClick={() => setAssignFor(c)}
        >
          มอบหมาย
        </Button>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: hero.title, href: "/workforce" },
        { label: "ความพร้อมและช่วงชน" },
      ]}
      title={hero.title}
      description={hero.desc}
    >
      <div className="space-y-6">
        {banner && <Alert variant={banner.tone}>{banner.text}</Alert>}

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="cf-wo">เลขที่ใบงาน</Label>
                <Input
                  id="cf-wo"
                  type="number"
                  value={woId}
                  onChange={(e) => setWoId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setApplied(woId);
                  }}
                  placeholder="เช่น 1234"
                  className="mt-1 w-36"
                />
              </div>
              <div>
                <Label htmlFor="cf-date">วันที่ตรวจ</Label>
                <Input
                  id="cf-date"
                  type="date"
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className="mt-1 w-[10.5rem]"
                />
              </div>
              <Button onClick={() => setApplied(woId)} disabled={woId === ""}>
                ตรวจสอบ
              </Button>
            </div>
          </CardContent>
        </Card>

        {!ready && (
          <Alert variant="info">
            <div>กรอกเลขที่ใบงานเพื่อดูความพร้อม ช่องว่าง และผู้สมัครที่จัดอันดับไว้แล้ว</div>
          </Alert>
        )}

        {ready && readiness && (
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">ความพร้อมของงาน #{readiness.work_order_id}</CardTitle>
              <Badge variant={STATE_VARIANT[readiness.state] ?? "neutral"}>{readiness.state}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {readiness.state !== "READY" && (
                <Alert variant={readiness.state === "BLOCKED" ? "danger" : "warning"}>
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                  <div>
                    งานนี้ยังไม่พร้อม
                    {readiness.blocked_by.length > 0 && (
                      <ul className="mt-1 list-inside list-disc">
                        {readiness.blocked_by.map((b) => (
                          <li key={b}>{REASON_LABEL[b] ?? b}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Alert>
              )}

              <ul className="divide-y divide-border">
                {readiness.checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-3 py-2.5">
                    <Badge variant={c.ok ? "success" : "danger"} className="mt-0.5 shrink-0">
                      {c.ok ? "ผ่าน" : "ไม่ผ่าน"}
                    </Badge>
                    <div className="min-w-0">
                      <div className="font-medium">{c.label}</div>
                      <div className="text-sm text-muted-foreground">{c.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>

              {readiness.team_user_ids.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  ทีมงานปัจจุบัน: user #{readiness.team_user_ids.join(", #")}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {ready && gap && (gap.unmapped.length > 0 || gap.required.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ข้อกำหนดทักษะของงาน</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {gap.required.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {gap.required.map((r) => (
                    <li key={r.skill_id} className="flex flex-wrap items-center gap-2">
                      <Badge variant="info">{r.name}</Badge>
                      <span className="text-muted-foreground">ขั้นต่ำระดับ {r.min_level}</span>
                      {r.require_any_of === 1 && <Badge variant="neutral">ทีมเพียงพอ 1 คน</Badge>}
                      {!r.is_mandatory && <Badge variant="neutral">ไม่บังคับ</Badge>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">ใบงานนี้ไม่ได้กำหนดทักษะที่ต้องใช้</p>
              )}

              {gap.unmapped.length > 0 && (
                <Alert variant="warning">
                  <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                  <div>
                    คำขอที่ยังไม่ผูกกับทะเบียนทักษะ:{" "}
                    <strong>{gap.unmapped.join(", ")}</strong>
                    <br />
                    ระบบ<strong>ไม่สามารถตรวจ</strong>คุณสมบัติของข้อกำหนดเหล่านี้
                    จึงไม่ควรมอบหมายงานจนกว่าจะผูกกับทักษะจริง
                  </div>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {ready && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                ผู้สมัครที่จัดอันดับแล้ว ({eligibleCount} ผ่าน / {blockedCount} ไม่ผ่าน)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {candidates?.note && <p className="text-sm text-muted-foreground">{candidates.note}</p>}
              {eligibleCount > 0 && (
                <Alert variant="info">
                  <div>
                    ระบบจัดอันดับเพื่อเสนอให้พิจารณาเท่านั้น — ไม่มีการมอบหมายอัตโนมัติ
                    และคุณสมบัติจะถูกตรวจซ้ำอีกครั้งตอนบันทึกการมอบหมาย
                  </div>
                </Alert>
              )}
              <SimpleDataTable<Candidate>
                columns={candidateColumns}
                data={candidates?.candidates ?? []}
                idKey="user_id"
                loading={cLoading}
                skeletonRows={8}
                pageSize={20}
                caption="ผู้สมัครที่จัดอันดับ"
                emptyTitle="ไม่มีผู้สมัคร"
                emptyDescription="ยังไม่มีช่างที่ตรงเกณฑ์ของงานนี้"
              />
            </CardContent>
          </Card>
        )}
      </div>

      <AssignDialog
        candidate={assignFor}
        workOrderId={id}
        pending={assign.isPending}
        onClose={() => setAssignFor(null)}
        onSubmit={(body) => assign.mutate(body)}
      />
    </PageShell>
  );
}

function AssignDialog({
  candidate,
  workOrderId,
  pending,
  onClose,
  onSubmit,
}: {
  candidate: Candidate | null;
  workOrderId: number;
  pending: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [reason, setReason] = useState("");

  if (!candidate) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`มอบหมายงานให้ ${candidate.full_name}`}
      description="ระบบจะตรวจคุณสมบัติและช่วงซ้อนกันอีกครั้งตอนบันทึก ถ้ามีการเปลี่ยนแปลงระหว่างนี้การมอบหมายจะถูกปฏิเสธพร้อมเหตุผล"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button
            disabled={pending || reason.trim() === ""}
            onClick={() =>
              onSubmit({
                action: "assign_work_order",
                work_order_id: workOrderId,
                user_ids: [candidate.user_id],
                reason: reason.trim(),
              })
            }
          >
            {pending ? "กำลังบันทึก…" : "ยืนยันการมอบหมาย"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="rounded-lg bg-muted/40 p-3">
          <div>ตำแหน่ง: {candidate.position || "—"}</div>
          <div>อัตราการใช้: {candidate.utilization_pct}% · งานค้าง {candidate.active_jobs}</div>
          {candidate.matched_skills.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {candidate.matched_skills.map((s) => (
                <Badge key={s} variant="info">
                  {s}
                </Badge>
              ))}
            </div>
          )}
          {candidate.availability_basis && (
            <p className="mt-1 text-xs text-muted-foreground">{candidate.availability_basis}</p>
          )}
        </div>
        <div>
          <Label htmlFor="as-reason">
            เหตุผล <span className="text-red-600">*</span>
          </Label>
          <Input
            id="as-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น คนที่มีคุณสมบัติตรงกับงานนี้และยังไม่เกินความจุ"
            className="mt-1"
          />
        </div>
      </div>
    </Dialog>
  );
}
