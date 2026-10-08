"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { sendOrEnqueueDetailed } from "@/lib/offlineQueue";
import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { WORKFORCE_API, type Crew, type CrewMember } from "@/lib/workforce";

/**
 * app/(dashboard)/workforce/crews/page.tsx — crew management (Phase 34)
 *
 * Crew is a TEAM-LEVEL assignment clause: a work order can require "crew X" and the
 * engine then checks every active member, not one person. So the member list here is
 * a real qualification surface — removing someone can make a staffed work order
 * unstaffable again. Membership writes are full replacements and require a reason.
 */

interface Person {
  id: number;
  full_name: string;
  employee_code: string | null;
  position: string | null;
  department_id: number | null;
}

interface Department {
  id: number;
  code: string;
  name: string;
}

function hhmm(v: string | null | undefined): string {
  return (v ?? "").slice(0, 5);
}

export default function WorkforceCrewsPage() {
  const hero = usePageHero("workforce/crews");
  const qc = useQueryClient();

  const [editCrew, setEditCrew] = useState<Crew | null | undefined>(undefined);
  const [membersFor, setMembersFor] = useState<Crew | null>(null);
  const [banner, setBanner] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(
    null
  );

  const { data: cfg } = useApiQuery<{ can: { crew_manage: boolean } }>(
    ["workforce", "config"],
    `${WORKFORCE_API}?action=config`
  );

  const { data: options } = useApiQuery<{
    people: Person[];
    departments: Department[];
  }>(["workforce", "options"], `${WORKFORCE_API}?action=options`);

  const { data: listData, isLoading } = useApiQuery<{ crews: Crew[] }>(
    ["workforce", "crews"],
    `${WORKFORCE_API}?action=crews`
  );

  const { data: detail } = useApiQuery<Crew>(
    ["workforce", "crew", membersFor?.id ?? 0],
    `${WORKFORCE_API}?action=crews&crew_id=${membersFor?.id ?? 0}`,
    { enabled: Boolean(membersFor) }
  );

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 8000);
    return () => clearTimeout(t);
  }, [banner]);

  const saveCrew = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      sendOrEnqueueDetailed({
        url: WORKFORCE_API,
        method: "POST",
        body,
        kind: "workforce_crew",
        label: `บันทึกทีม ${body.name_th ?? ""}`.trim(),
      }),
    onSuccess: (res) => {
      setEditCrew(undefined);
      if (res.outcome === "sent") {
        setBanner({ tone: "success", text: "บันทึกทีมงานเรียบร้อย" });
        void qc.invalidateQueries({ queryKey: ["workforce"] });
      } else if (res.outcome === "queued") {
        setBanner({ tone: "warning", text: "บันทึกไว้ในคิวออฟไลน์แล้ว" });
      } else {
        setBanner({
          tone: "danger",
          text: res.message ? `บันทึกทีมงานไม่สำเร็จ: ${res.message}` : "บันทึกทีมงานไม่สำเร็จ",
        });
      }
    },
  });

  const saveMembers = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      sendOrEnqueueDetailed({
        url: WORKFORCE_API,
        method: "POST",
        body,
        kind: "workforce_crew_members",
        label: `ปรับสมาชิกทีม ${membersFor?.name_th ?? ""}`.trim(),
      }),
    onSuccess: (res) => {
      if (res.outcome === "sent") {
        setBanner({ tone: "success", text: "บันทึกสมาชิกทีมงานเรียบร้อย" });
        setMembersFor(null);
        void qc.invalidateQueries({ queryKey: ["workforce"] });
      } else if (res.outcome === "queued") {
        setBanner({ tone: "warning", text: "บันทึกไว้ในคิวออฟไลน์แล้ว" });
      } else {
        setBanner({
          tone: "danger",
          text: res.message
            ? `บันทึกสมาชิกไม่สำเร็จ: ${res.message}`
            : "บันทึกสมาชิกไม่สำเร็จ",
        });
      }
    },
  });

  const crews = useMemo(() => listData?.crews ?? [], [listData]);
  const canManage = cfg?.can.crew_manage === true;

  const columns: SimpleColumn<Crew>[] = [
    {
      key: "code",
      header: "รหัส",
      renderCell: (c) => <Badge variant="neutral">{c.code}</Badge>,
    },
    {
      key: "name_th",
      header: "ชื่อทีม",
      renderCell: (c) => (
        <div>
          <div className="font-medium">{c.name_th}</div>
          {c.name_en && <div className="text-xs text-muted-foreground">{c.name_en}</div>}
        </div>
      ),
    },
    {
      key: "department_name",
      header: "แผนก",
      renderCell: (c) => c.department_name ?? "—",
    },
    {
      key: "lead_name",
      header: "หัวหน้าทีม",
      renderCell: (c) => c.lead_name ?? <span className="text-amber-600">ยังไม่กำหนด</span>,
    },
    {
      key: "member_count",
      header: "สมาชิก",
      align: "right",
      renderCell: (c) => <span className="font-medium">{c.member_count ?? 0}</span>,
    },
    {
      key: "default_shift",
      header: "กะปริยาย",
      renderCell: (c) => (
        <span className="text-sm">
          {hhmm(c.default_shift_start)}–{hhmm(c.default_shift_end)}
        </span>
      ),
    },
    {
      key: "is_active",
      header: "สถานะ",
      renderCell: (c) =>
        c.is_active ? <Badge variant="success">ใช้งาน</Badge> : <Badge variant="neutral">ปิดใช้งาน</Badge>,
    },
    {
      key: "actions",
      header: "",
      hideLabelOnMobile: true,
      enableSorting: false,
      renderCell: (c) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="outline" onClick={() => setMembersFor(c)}>
            สมาชิก ({c.member_count ?? 0})
          </Button>
          <Button size="sm" variant="outline" disabled={!canManage} onClick={() => setEditCrew(c)}>
            แก้ไข
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: hero.title, href: "/workforce" },
        { label: "ทีมงาน" },
      ]}
      title={hero.title}
      description={hero.desc}
      actions={
        canManage && (
          <Button onClick={() => setEditCrew(null)}>เพิ่มทีมงาน</Button>
        )
      }
    >
      <div className="space-y-6">
        {banner && <Alert variant={banner.tone}>{banner.text}</Alert>}

        <Alert variant="info">
          <div>
            ทีมงานเป็นเงื่อนไขระดับ<strong>ทีม</strong> — เมื่อใช้ทีมเป็นข้อกำหนดของงาน
            ระบบจะตรวจคุณสมบัติของสมาชิก<strong>ทุกคน</strong> ที่ยังอยู่ในทีม ไม่ใช่แค่หัวหน้าทีม
            การเอาสมาชิกออกจึงอาจทำให้งานที่มอบหมายไว้แล้วขาดคนครบ
          </div>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              ทีมงานทั้งหมด
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleDataTable<Crew>
              columns={columns}
              data={crews}
              idKey="id"
              loading={isLoading}
              skeletonRows={6}
              pageSize={15}
              caption="รายชื่อทีมงาน"
              emptyTitle="ยังไม่มีทีมงาน"
              emptyDescription="สร้างทีมงานเพื่อใช้เป็นเงื่อนไขระดับทีมในการมอบหมายงาน"
            />
          </CardContent>
        </Card>
      </div>

      <CrewDialog
        crew={editCrew === undefined ? null : editCrew}
        open={editCrew !== undefined}
        people={options?.people ?? []}
        departments={options?.departments ?? []}
        pending={saveCrew.isPending}
        onClose={() => setEditCrew(undefined)}
        onSubmit={(body) => saveCrew.mutate(body)}
      />

      <MembersDialog
        crew={detail ?? membersFor}
        people={options?.people ?? []}
        pending={saveMembers.isPending}
        onClose={() => setMembersFor(null)}
        onSubmit={(body) => saveMembers.mutate(body)}
      />
    </PageShell>
  );
}

/* ── crew editor ──────────────────────────────────────────────────────── */

function CrewDialog({
  crew,
  open,
  people,
  departments,
  pending,
  onClose,
  onSubmit,
}: {
  crew: Crew | null;
  open: boolean;
  people: Person[];
  departments: Department[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [code, setCode] = useState("");
  const [nameTh, setNameTh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [dept, setDept] = useState<number | "">("");
  const [lead, setLead] = useState<number | "">("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("17:00");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setCode(crew?.code ?? "");
    setNameTh(crew?.name_th ?? "");
    setNameEn(crew?.name_en ?? "");
    setDept(crew?.department_id ?? "");
    setLead(crew?.lead_user_id ?? "");
    setStart(hhmm(crew?.default_shift_start) || "08:00");
    setEnd(hhmm(crew?.default_shift_end) || "17:00");
    setNotes(crew?.notes ?? "");
    setActive(crew ? Boolean(crew.is_active) : true);
  }, [crew, open]);

  const invalid = code.trim() === "" || nameTh.trim() === "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={crew ? `แก้ไขทีม ${crew.code}` : "เพิ่มทีมงาน"}
      description="กะปริยายของทีมเป็นค่าปริยายเท่านั้น — กะจริงของแต่ละคนมาจากหน้า กะและวันลา"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button
            disabled={pending || invalid}
            onClick={() =>
              onSubmit({
                action: "crew_save",
                id: crew?.id ?? 0,
                code: code.trim().toUpperCase(),
                name_th: nameTh.trim(),
                name_en: nameEn.trim(),
                department_id: Number(dept) || 0,
                lead_user_id: Number(lead) || 0,
                default_shift_start: start,
                default_shift_end: end,
                notes: notes.trim(),
                is_active: active ? 1 : 0,
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
            <Label htmlFor="cr-code">
              รหัสทีม <span className="text-red-600">*</span>
            </Label>
            <Input
              id="cr-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="uppercase"
            />
          </div>
          <div>
            <Label htmlFor="cr-nameth">
              ชื่อทีม (ไทย) <span className="text-red-600">*</span>
            </Label>
            <Input id="cr-nameth" value={nameTh} onChange={(e) => setNameTh(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="cr-nameen">ชื่อทีม (อังกฤษ)</Label>
          <Input id="cr-nameen" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="cr-dept">แผนก</Label>
            <Select value={dept === "" ? "__none__" : String(dept)} onValueChange={(v) => setDept(v === "__none__" ? "" : Number(v))}>
              <SelectTrigger id="cr-dept">
                <SelectValue placeholder="ทุกแผนก" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">ทุกแผนก</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="cr-lead">หัวหน้าทีม</Label>
            <Select value={lead === "" ? "__none__" : String(lead)} onValueChange={(v) => setLead(v === "__none__" ? "" : Number(v))}>
              <SelectTrigger id="cr-lead">
                <SelectValue placeholder="ยังไม่กำหนด" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">ยังไม่กำหนด</SelectItem>
                {people.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="cr-start">กะเริ่ม (ค่าปริยาย)</Label>
            <Input id="cr-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cr-end">กะสิ้นสุด (ค่าปริยาย)</Label>
            <Input id="cr-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="cr-notes">หมายเหตุ</Label>
          <Textarea id="cr-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {crew && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            เปิดใช้งานทีมนี้
          </label>
        )}
      </div>
    </Dialog>
  );
}

/* ── membership editor (full replacement, reason required) ─────────────── */

function MembersDialog({
  crew,
  people,
  pending,
  onClose,
  onSubmit,
}: {
  crew: Crew | null;
  people: Person[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [lead, setLead] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!crew) return;
    setSelected((crew.members ?? []).map((m) => m.user_id));
    setLead(crew.lead_user_id ?? "");
    setReason("");
    setFilter("");
  }, [crew]);

  if (!crew) return null;

  const members: CrewMember[] = crew.members ?? [];
  const needle = filter.trim().toLowerCase();
  const candidates = people.filter(
    (p) => !needle || p.full_name.toLowerCase().includes(needle) || (p.employee_code ?? "").toLowerCase().includes(needle)
  );
  const invalid = selected.length === 0 || reason.trim() === "";

  return (
    <Dialog
      open
      onClose={onClose}
      title={`สมาชิกทีม ${crew.name_th}`}
      description="การบันทึกจะแทนที่สมาชิกทั้งทีม และต้องระบุเหตุผล — สมาชิกที่ถูกเอาออกจะไม่ถูกนับในการตรวจคุณสมบัติระดับทีมอีกต่อไป"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button
            disabled={pending || invalid}
            onClick={() =>
              onSubmit({
                action: "crew_members",
                crew_id: crew.id,
                user_ids: selected,
                lead_user_id: Number(lead) || 0,
                reason: reason.trim(),
              })
            }
          >
            {pending ? "กำลังบันทึก…" : `บันทึกสมาชิก (${selected.length})`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {members.length > 0 && (
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <div className="font-medium">สมาชิกปัจจุบัน ({members.length})</div>
            <div className="mt-1 text-muted-foreground">
              {members
                .map((m) => `${m.full_name}${m.member_role === "lead" ? " (หัวหน้า)" : ""}`)
                .join(", ")}
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="cm-filter">เลือกสมาชิก</Label>
          <Input
            id="cm-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="ค้นหาชื่อหรือรหัสพนักงาน"
            className="mt-1"
          />
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
            {candidates.length === 0 && (
              <p className="p-2 text-sm text-muted-foreground">ไม่พบช่างที่ตรงกับคำค้น</p>
            )}
            {candidates.map((p) => {
              const on = selected.includes(p.id);
              return (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      setSelected((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)))
                    }
                  />
                  <span className="flex-1">
                    <span className="text-sm font-medium">{p.full_name}</span>
                    {p.position && <span className="ml-2 text-xs text-muted-foreground">{p.position}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{p.employee_code ?? ""}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">เลือกแล้ว {selected.length} คน</p>
          {selected.length === 0 && (
            <p className="text-xs text-red-600">ทีมต้องมีสมาชิกอย่างน้อย 1 คน</p>
          )}
        </div>

        <div>
          <Label htmlFor="cm-lead">หัวหน้าทีม (ต้องเป็นสมาชิกด้วย)</Label>
          <Select value={lead === "" ? "__none__" : String(lead)} onValueChange={(v) => setLead(v === "__none__" ? "" : Number(v))}>
            <SelectTrigger id="cm-lead">
              <SelectValue placeholder="ไม่ระบุ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">ไม่ระบุ</SelectItem>
              {people
                .filter((p) => selected.includes(p.id))
                .map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.full_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="cm-reason">
            เหตุผล <span className="text-red-600">*</span>
          </Label>
          <Textarea
            id="cm-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น ปรับสมาชิกตามการโอนย้ายแผนก"
          />
        </div>
      </div>
    </Dialog>
  );
}
