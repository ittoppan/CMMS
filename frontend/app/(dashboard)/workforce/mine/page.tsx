"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, Wifi, RefreshCw, UserCog } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useOnlineStatus, usePendingCount } from "@/lib/offlineQueue";
import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import {
  WORKFORCE_API,
  fmtMinutes,
  type MySkillsResponse,
} from "@/lib/workforce";
import AndonLamp from "@/components/AndonLamp";

/**
 * app/(dashboard)/workforce/mine/page.tsx — the technician's own record (Phase 34)
 *
 * This is a READ-ONLY self view. It is deliberately not a self-service editing screen:
 * a person editing their own skills, certificates or expiry dates would let them
 * manufacture the very evidence the engine uses to gate assignments. Corrections go
 * through a supervisor, and this page exists so they can always see what is recorded.
 *
 * `action=my_skills` is self-scoped in the API — passing someone else's user_id is
 * rejected with 403 rather than silently returning their record.
 */

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function CertState({ expired, expiringSoon }: { expired: boolean; expiringSoon?: boolean }) {
  if (expired) return <AndonLamp status="down" size="sm" showLabel />;
  if (expiringSoon) return <AndonLamp status="warn" size="sm" showLabel />;
  return <AndonLamp status="ok" size="sm" showLabel />;
}

export default function MyWorkforcePage() {
  const hero = usePageHero("workforce/mine");
  const qc = useQueryClient();
  const online = useOnlineStatus();
  const pending = usePendingCount();

  const [date, setDate] = useState(isoToday);

  const { data, isLoading, error, dataUpdatedAt, isFetching, refetch } = useApiQuery<MySkillsResponse>(
    ["workforce", "my_skills", date],
    `${WORKFORCE_API}?action=my_skills&date=${date}`
  );

  const summary = useMemo(() => {
    const skills = data?.skills ?? [];
    const certs = data?.certifications ?? [];
    const auths = data?.authorizations ?? [];
    return {
      skills: skills.length,
      liveSkills: skills.filter((s) => !s.expired).length,
      expiredSkills: skills.filter((s) => s.expired).length,
      liveCerts: certs.filter((c) => !c.expired && c.status === "active").length,
      expiredCerts: certs.filter((c) => c.expired).length,
      liveAuths: auths.filter((a) => a.status === "active" && !a.expired).length,
    };
  }, [data]);

  const shift = data?.shift_effective;
  const fromDefault = shift?.source !== "shift_assignment";
  const availability = data?.availability;

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: hero.title, href: "/workforce" },
        { label: "ของฉัน" },
      ]}
      title={hero.title}
      description={hero.desc}
      actions={
        <Buttonish
          online={online}
          isFetching={isFetching}
          updatedAt={dataUpdatedAt}
          onRefresh={() => {
            void refetch();
            void qc.invalidateQueries({ queryKey: ["workforce"] });
          }}
        />
      }
    >
      <div className="space-y-6">
        {!online && (
          <Alert variant="warning">
            <CloudOff className="h-4 w-4" aria-hidden="true" />
            <div>
              ขณะนี้ออฟไลน์ — ข้อมูลที่แสดงคือสำเนาที่โหลดไว้ล่าสุด
              {dataUpdatedAt ? ` (อัปเดตเมื่อ ${new Date(dataUpdatedAt).toLocaleString("th-TH")})` : ""}
              ตัวเลขนี้อาจไม่ตรงกับข้อมูลล่าสุดของฝ่ายผู้ดูแล
            </div>
          </Alert>
        )}

        {pending > 0 && (
          <Alert variant="info">
            <div>
              มีงานที่ส่งไม่สำเร็จ {pending} รายการอยู่ในคิว
              ระบบจะส่งอัตโนมัติเมื่อกลับมาออนไลน์
            </div>
          </Alert>
        )}

        {error && (
          <Alert variant="danger">
            <div>
              {(error as { status?: number }).status === 403
                ? "ดูได้เฉพาะข้อมูลของตัวเองเท่านั้น"
                : "โหลดข้อมูลของคุณไม่สำเร็จ — หากออฟไลน์จะใช้สำเนาที่แคชไว้"}
            </div>
          </Alert>
        )}

        <Alert variant="info">
          <div>
            หน้านี้เป็นแบบ<strong>ดูอย่างเดียว</strong> โดยตั้งใจ
            การแก้ไขทักษะ ใบรับรอง หรือวันหมดอายุด้วยตนเองไม่ได้
            เพราะข้อมูลชุดนั้นคือหลักฐานที่ระบบใช้ตัดสินว่าจะมอบหมายงานให้คุณหรือไม่
            หากข้อมูลไม่ถูกต้อง ให้แจ้งหัวหน้างานเพื่อแก้ไข
          </div>
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="ทักษะที่ใช้งานได้" value={summary.liveSkills} sub={`ทั้งหมด ${summary.skills}`} />
          <Stat
            label="ใบรับรองที่ใช้งานได้"
            value={summary.liveCerts}
            tone={summary.expiredCerts > 0 ? "danger" : "success"}
            sub={summary.expiredCerts > 0 ? `หมดอายุ ${summary.expiredCerts} ใบ` : "ไม่มีใบรับรองหมดอายุ"}
          />
          <Stat label="สิทธิ์ที่ใช้งานได้" value={summary.liveAuths} />
          <Stat
            label="ทักษะหมดอายุ"
            value={summary.expiredSkills}
            tone={summary.expiredSkills > 0 ? "danger" : undefined}
            sub={summary.expiredSkills > 0 ? "ระบบจะไม่นับทักษะเหล่านี้" : "ไม่มี"}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ความพร้อมวันนี้</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label htmlFor="my-date" className="text-xs text-muted-foreground">
                  ตรวจสอบวันที่
                </label>
                <Input
                  id="my-date"
                  type="date"
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className="mt-1 w-[10.5rem]"
                />
              </div>

              {availability ? (
                <>
                  <div>
                    {availability.available ? (
                      <AndonLamp status="ok" size="sm" showLabel />
                    ) : (
                      <AndonLamp status="down" size="sm" showLabel />
                    )}
                  </div>
                  {availability.reasons.length > 0 && (
                    <ul className="space-y-1 text-sm">
                      {availability.reasons.map((r) => (
                        <li key={r} className="text-muted-foreground">
                          • {REASON_LABEL[r] ?? r}
                        </li>
                      ))}
                    </ul>
                  )}
                  {availability.leave && (
                    <p className="text-sm">
                      วันลา: {availability.leave.type} ({availability.leave.start} →{" "}
                      {availability.leave.end})
                    </p>
                  )}
                  {availability.training && (
                    <p className="text-sm">
                      กำลังอบรม: {availability.training.course} ({availability.training.date})
                    </p>
                  )}
                  {availability.basis && (
                    <p className="text-xs text-muted-foreground">{availability.basis}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {isLoading ? "กำลังโหลด…" : "ไม่มีข้อมูลความพร้อม"}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">กะที่มีผล</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {shift ? (
                <>
                  <div className="text-lg font-semibold">
                    {shift.start}–{shift.end}
                  </div>
                  <div className="text-muted-foreground">
                    สุทธิ {fmtMinutes(shift.work_minutes)} · พัก {shift.break_minutes} นาที
                  </div>
                  {fromDefault ? (
                    <Alert variant="warning">
                      <div>
                        ยังไม่มีกะรายบุคคลที่ลงไว้ — นี่คือค่าเริ่มต้นของระบบ
                        ไม่ใช่ตารางงานของคุณ
                      </div>
                    </Alert>
                  ) : (
                    <AndonLamp status="ok" size="sm" showLabel />
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">ไม่พบข้อมูลกะ</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">ทักษะของฉัน</CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.skills ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                ยังไม่มีข้อมูลทักษะที่บันทึกไว้ — การไม่มีข้อมูลไม่ได้แปลว่าไม่มีความสามารถ
                แต่ระบบจะไม่นับเป็นคุณสมบัติจนกว่าจะมีการบันทึก
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {(data?.skills ?? []).map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <div className="font-medium">{s.skill_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.level_label}
                        {s.valid_until ? ` · ใช้ได้ถึง ${s.valid_until}` : ""}
                      </div>
                    </div>
                    {s.expired ? (
                      <AndonLamp status="down" size="sm" showLabel />
                    ) : s.cert_required ? (
                      <AndonLamp status="idle" size="sm" showLabel />
                    ) : (
                      <AndonLamp status="ok" size="sm" showLabel />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ใบรับรองของฉัน</CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.certifications ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีใบรับรองที่บันทึกไว้</p>
              ) : (
                <ul className="divide-y divide-border">
                  {(data?.certifications ?? []).map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.expiry_date ? `หมดอายุ ${c.expiry_date}` : "ไม่มีวันหมดอายุ"}
                        </div>
                      </div>
                      <CertState expired={c.expired} expiringSoon={c.expiring_soon} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">ประวัติการอบรมของฉัน</CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.training ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีประวัติการอบรม</p>
              ) : (
                <ul className="divide-y divide-border">
                  {(data?.training ?? []).map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <div className="font-medium">{t.course_name ?? `#${t.course_id}`}</div>
                        <div className="text-xs text-muted-foreground">
                          {t.scheduled_date ?? "ไม่กำหนดวัน"}
                          {t.score != null ? ` · คะแนน ${t.score}` : ""}
                        </div>
                      </div>
                      <AndonLamp
                        status={
                          t.status === "passed"
                            ? "ok"
                            : t.status === "failed"
                              ? "down"
                              : "idle"
                        }
                        size="sm"
                        showLabel
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

const REASON_LABEL: Record<string, string> = {
  OUTSIDE_SHIFT: "อยู่นอกเวลาทำงานตามกะ",
  ON_LEAVE: "อยู่ระหว่างวันลา",
  IN_TRAINING: "กำลังเข้าอบรม",
};

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "success" | "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold ${
          tone === "danger" ? "text-red-600" : tone === "success" ? "text-emerald-600" : ""
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Buttonish({
  online,
  isFetching,
  updatedAt,
  onRefresh,
}: {
  online: boolean;
  isFetching: boolean;
  updatedAt: number;
  onRefresh: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isFetching || !online}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
      title={
        online
          ? updatedAt
            ? `อัปเดตล่าสุด ${new Date(updatedAt).toLocaleTimeString("th-TH")}`
            : "ยังไม่เคยโหลด"
          : "ออฟไลน์ — ไม่สามารถดึงข้อมูลใหม่ได้"
      }
    >
      {online ? (
        <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
      ) : (
        <CloudOff className="h-4 w-4" aria-hidden="true" />
      )}
      {online ? (isFetching ? "กำลังรีเฟรช…" : "รีเฟรช") : "ออฟไลน์"}
      {online ? null : <Wifi className="h-4 w-4 opacity-60" aria-hidden="true" />}
    </button>
  );
}
