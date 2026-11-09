"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, TriangleAlert } from "lucide-react";

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
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { sendOrEnqueueDetailed } from "@/lib/offlineQueue";
import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { WORKFORCE_API, type ExpiringCertification } from "@/lib/workforce";
import AndonLamp from "@/components/AndonLamp";

/**
 * app/(dashboard)/workforce/certifications/page.tsx — expiry watchlist (Phase 34)
 *
 * worker_certifications is the Phase 31 table, reused rather than duplicated. Its
 * subject_type ENUM is ('internal','contractor') — 'user' is NOT a legal value, so the
 * form never offers it. A certification gates a skill independently of training, which
 * is why the expired rows are a hard warning here and not a soft one.
 */

interface Person {
  id: number;
  full_name: string;
  employee_code: string | null;
}

const CERT_STATUS = [
  { v: "active", label: "ใช้งานได้" },
  { v: "pending_verification", label: "รอตรวจสอบ" },
  { v: "expired", label: "หมดอายุ" },
  { v: "revoked", label: "ถูกเพิกถอน" },
];

function ExpiryBadge({ days, expired }: { days: number; expired: boolean }) {
  if (expired) return <AndonLamp status="down" size="sm" showLabel />;
  if (days <= 0) return <AndonLamp status="down" size="sm" showLabel />;
  if (days <= 30) return <AndonLamp status="warn" size="sm" showLabel />;
  return <AndonLamp status="ok" size="sm" showLabel />;
}

export default function WorkforceCertificationsPage() {
  const hero = usePageHero("workforce/certifications");
  const qc = useQueryClient();

  const [days, setDays] = useState(60);
  const [addOpen, setAddOpen] = useState(false);
  const [banner, setBanner] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(
    null
  );

  const { data: cfg } = useApiQuery<{
    config: { require_reason: number | boolean };
    can: { certification_manage: boolean };
  }>(["workforce", "config"], `${WORKFORCE_API}?action=config`);

  const { data: options } = useApiQuery<{ people: Person[] }>(
    ["workforce", "options"],
    `${WORKFORCE_API}?action=options`
  );

  const { data, isLoading } = useApiQuery<{ expiring: ExpiringCertification[] }>(
    ["workforce", "expiring", days],
    `${WORKFORCE_API}?action=expiring&days=${days}`
  );

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 8000);
    return () => clearTimeout(t);
  }, [banner]);

  const saveCert = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      sendOrEnqueueDetailed({
        url: WORKFORCE_API,
        method: "POST",
        body,
        kind: "workforce_certification",
        label: `บันทึกใบรับรอง ${body.certification_code ?? ""}`.trim(),
      }),
    onSuccess: (res) => {
      setAddOpen(false);
      if (res.outcome === "sent") {
        setBanner({ tone: "success", text: "บันทึกใบรับรองเรียบร้อย" });
        void qc.invalidateQueries({ queryKey: ["workforce"] });
      } else if (res.outcome === "queued") {
        setBanner({ tone: "warning", text: "บันทึกไว้ในคิวออฟไลน์แล้ว" });
      } else {
        setBanner({
          tone: "danger",
          text: res.message ? `บันทึกใบรับรองไม่สำเร็จ: ${res.message}` : "บันทึกใบรับรองไม่สำเร็จ",
        });
      }
    },
  });

  const rows = useMemo(() => data?.expiring ?? [], [data]);
  const canManage = cfg?.can.certification_manage === true;
  const requireReason = cfg?.config.require_reason === 1 || cfg?.config.require_reason === true;
  const expiredCount = rows.filter((r) => r.expired).length;
  const soonCount = rows.filter((r) => !r.expired && r.days_left <= 30).length;

  const columns: SimpleColumn<ExpiringCertification>[] = [
    {
      key: "full_name",
      header: "ช่าง",
      renderCell: (r) => (
        <Link
          href={`/workforce/technicians/${r.user_id}`}
          className="font-medium text-[var(--cmms-primary-hover)] underline-offset-2 hover:underline"
        >
          {r.full_name}
        </Link>
      ),
    },
    {
      key: "name",
      header: "ใบรับรอง",
      renderCell: (r) => (
        <div>
          <div className="font-medium">{r.name}</div>
          <div className="text-xs text-muted-foreground">{r.code}</div>
        </div>
      ),
    },
    { key: "expiry_date", header: "วันหมดอายุ" },
    {
      key: "days_left",
      header: "สถานะ",
      align: "right",
      renderCell: (r) => <ExpiryBadge days={r.days_left} expired={r.expired} />,
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: hero.title, href: "/workforce" },
        { label: "ใบรับรอง" },
      ]}
      title={hero.title}
      description={hero.desc}
      actions={
        canManage && (
          <Button onClick={() => setAddOpen(true)}>บันทึกใบรับรอง</Button>
        )
      }
    >
      <div className="space-y-6">
        {banner && <Alert variant={banner.tone}>{banner.text}</Alert>}

        {expiredCount > 0 && (
          <Alert variant="danger">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            <div>
              มี <strong>{expiredCount}</strong> ใบรับรองที่หมดอายุแล้ว
              ใบรับรองที่หมดอายุจะ<strong>ไม่ถูกนับ</strong>ว่าผ่านแม้จะมีทักษะระดับสูงกว่าขั้นต่ำก็ตาม
              งานที่กำหนดให้ต้องใช้ทักษะนั้นจะไม่ผ่านการตรวจจนกว่าจะต่ออายุ
            </div>
          </Alert>
        )}

        <Card>
          <CardHeader className="flex flex-wrap items-end justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BadgeCheck className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              ใบรับรองที่ใกล้หมดอายุ
            </CardTitle>
            <div>
              <label htmlFor="ex-days" className="text-xs text-muted-foreground">
                ดูล่วงหน้า (วัน)
              </label>
              <Input
                id="ex-days"
                type="number"
                min={1}
                max={3650}
                value={days}
                onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-28"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {soonCount > 0 && (
              <Alert variant="warning">
                <div>
                  อีก {soonCount} ใบหมดอายุภายใน 30 วัน — ควรต่ออายุก่อนวันที่ระบบจะเริ่มปฏิเสธการมอบหมายงาน
                </div>
              </Alert>
            )}
            <SimpleDataTable<ExpiringCertification>
              columns={columns}
              data={rows}
              idKey="id"
              loading={isLoading}
              skeletonRows={8}
              pageSize={20}
              caption="ใบรับรองที่ใกล้หมดอายุ"
              emptyTitle="ไม่มีใบรับรองใกล้หมดอายุ"
              emptyDescription={`ไม่มีใบรับรองที่หมดอายุภายใน ${days} วันข้างหน้า`}
            />
          </CardContent>
        </Card>
      </div>

      <AddCertDialog
        open={addOpen}
        people={options?.people ?? []}
        requireReason={requireReason}
        pending={saveCert.isPending}
        onClose={() => setAddOpen(false)}
        onSubmit={(body) => saveCert.mutate(body)}
      />
    </PageShell>
  );
}

function AddCertDialog({
  open,
  people,
  requireReason,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  people: Person[];
  requireReason: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [userId, setUserId] = useState<number | "">("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [certNo, setCertNo] = useState("");
  const [issued, setIssued] = useState("");
  const [expiry, setExpiry] = useState("");
  const [issuer, setIssuer] = useState("");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setUserId("");
    setCode("");
    setName("");
    setCertNo("");
    setIssued("");
    setExpiry("");
    setIssuer("");
    setStatus("active");
    setNotes("");
    setReason("");
  }, [open]);

  const invalid = userId === "" || code.trim() === "" || name.trim() === "";
  const rangeInvalid = Boolean(issued && expiry && expiry < issued);
  const missingReason = requireReason && reason.trim() === "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="บันทึกใบรับรอง"
      description="ใบรับรองเป็นหลักฐานอิสระจากการอบรม — ทักษะที่กำหนดให้ต้องมีใบรับรองนี้จึงจะผ่านการตรวจ"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button
            disabled={pending || invalid || rangeInvalid || missingReason}
            onClick={() =>
              onSubmit({
                action: "certification_save",
                subject_type: "internal",
                user_id: Number(userId),
                certification_code: code.trim().toUpperCase(),
                certification_name: name.trim(),
                certificate_no: certNo.trim(),
                issued_date: issued,
                expiry_date: expiry,
                issuing_body: issuer.trim(),
                status,
                notes: notes.trim(),
                reason: reason.trim(),
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
          <Label htmlFor="ct-user">
            ช่าง <span className="text-red-600">*</span>
          </Label>
          <Select value={userId === "" ? "__none__" : String(userId)} onValueChange={(v) => setUserId(v === "__none__" ? "" : Number(v))}>
            <SelectTrigger id="ct-user" className="mt-1">
              <SelectValue placeholder="เลือกช่าง" />
            </SelectTrigger>
            <SelectContent>
              {people.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ct-code">
              รหัสใบรับรอง <span className="text-red-600">*</span>
            </Label>
            <Input
              id="ct-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 uppercase"
              placeholder="ELE_ISOLATION"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              ต้องตรงกับรหัสที่กำหนดในทะเบียนทักษะที่เกี่ยวข้อง
            </p>
          </div>
          <div>
            <Label htmlFor="ct-name">
              ชื่อใบรับรอง <span className="text-red-600">*</span>
            </Label>
            <Input
              id="ct-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              placeholder="ใบรับรองงานไฟฟ้าแยกสาย"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ct-no">เลขที่ใบรับรอง</Label>
            <Input
              id="ct-no"
              value={certNo}
              onChange={(e) => setCertNo(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ct-issuer">หน่วยออกใบรับรอง</Label>
            <Input
              id="ct-issuer"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ct-issued">วันที่ออก</Label>
            <Input
              id="ct-issued"
              type="date"
              value={issued}
              onChange={(e) => setIssued(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ct-expiry">วันหมดอายุ</Label>
            <Input
              id="ct-expiry"
              type="date"
              value={expiry}
              min={issued || undefined}
              onChange={(e) => setExpiry(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        {rangeInvalid && <p className="text-sm text-red-600">วันหมดอายุต้องไม่ก่อนวันที่ออก</p>}
        <div>
          <Label htmlFor="ct-status">สถานะ</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="ct-status" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CERT_STATUS.map((s) => (
                <SelectItem key={s.v} value={s.v}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="ct-notes">หมายเหตุ</Label>
          <Input id="ct-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="ct-reason">
            เหตุผลการบันทึก{" "}
            {requireReason ? (
              <span className="text-red-600">*</span>
            ) : (
              <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
            )}
          </Label>
          <Input
            id="ct-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น แนบหนังสือรับรองฉบับใหม่จากหน่วยงาน"
            className="mt-1"
          />
        </div>
      </div>
    </Dialog>
  );
}
