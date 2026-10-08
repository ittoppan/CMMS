"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SectionHeading, KpiCard, LoadingGrid } from "@/components/dashboard/kit";
import { usePageHero } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { describeReason, fmtMinutes, fmtPct, getConfig, getDashboard } from "@/lib/workforce";
import type { CapabilityMap, ConfigResponse, Dashboard } from "@/lib/workforce";
import AndonLamp from "@/components/AndonLamp";

/**
 * app/(dashboard)/workforce/page.tsx — ภาพรวมกำลังคน (Phase 34)
 *
 * หลักการที่หน้านี้ยึด:
 *  - ตัวเลขที่ระบบยังไม่มีที่มาให้วัดจริงจะไม่ถูกเดา จะแสดง "—" พร้อมคำอธิบาย
 *  - ทุกการนับมาจากหลักฐานที่บันทึกไว้จริง ไม่ใช่ค่าประมาณ
 */

function toneForUtil(pct: number, warn: number, over: number): "" | "amber" | "red" {
  if (pct >= over) return "red";
  if (pct >= warn) return "amber";
  return "";
}

export default function WorkforcePage() {
  const hero = usePageHero("workforce");
  const [cfg, setCfg] = useState<ConfigResponse | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [token, setToken] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDenied(false);
    try {
      const [c, d] = await Promise.all([getConfig(), getDashboard()]);
      setCfg(c);
      setDash(d);
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 403 || status === 401) setDenied(true);
      else setError(e instanceof Error ? e.message : "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, token]);

  if (denied) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{hero.title}</h1>
        <Alert variant="danger">
          <ShieldAlert className="h-4 w-4" />
          <div>
            <p className="font-medium">ไม่มีสิทธิ์เข้าถึงโมดูลกำลังคน</p>
            <p className="text-sm">ต้องมีสิทธิ์ workforce.view จึงจะเห็นภาพรวมนี้ได้</p>
          </div>
        </Alert>
      </div>
    );
  }

  const can: CapabilityMap | undefined = cfg?.can;
  const people = dash?.people;
  const cap = dash?.capacity;
  const warn = cfg?.config.capacity_warn_pct ?? 85;
  const over = cfg?.config.capacity_over_pct ?? 100;

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      title={hero.title}
      description={hero.desc}
      actions={
        <Button variant="outline" size="sm" onClick={() => setToken((t) => t + 1)} disabled={loading}>
          รีเฟรช
        </Button>
      }
    >
      {error && (
        <Alert variant="danger">
          <AlertTriangle className="h-4 w-4" />
          <div>{error}</div>
        </Alert>
      )}

      {loading && !dash ? (
        <LoadingGrid cards={6} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="ช่างที่ใช้งาน"
              value={people?.active_technicians ?? "—"}
              unit="คน"
              sub="นับจาก users ที่ active และเข้าเกณฑ์เป็นช่าง"
            />
            <KpiCard
              label="มีบันทึกทักษะ"
              value={people?.with_skill_records ?? "—"}
              unit="คน"
              tone="blue"
              sub={`เทียบกับช่างที่ใช้งาน ${people?.active_technicians ?? "—"} คน`}
            />
            <KpiCard
              label="มีใบรับรองที่ใช้ได้"
              value={people?.with_valid_certifications ?? "—"}
              unit="คน"
              tone="green"
              sub="ใบรับรองที่ยังไม่หมดอายุเท่านั้น"
            />
            <KpiCard
              label="เกิน capacity"
              value={cap?.over_capacity ?? "—"}
              unit="คน"
              tone={cap?.over_capacity ? "red" : ""}
              sub={cap?.at_risk !== undefined ? `ใกล้เต็มอีก ${cap.at_risk} คน` : "—"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>ทักษะที่กำหนดเป็นเงื่อนไข</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">ทักษะใน catalog ทั้งหมด</span>
                  <span className="font-medium">{dash?.skills.total ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">ต้องมีใบรับรอง</span>
                  <span className="font-medium text-[var(--cmms-text-secondary)]">{dash?.skills.cert_required ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">ต้องมีสิทธิ์ (authorization)</span>
                  <span className="font-medium text-[var(--cmms-text-secondary)]">{dash?.skills.auth_required ?? "—"}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  ใบรับรองที่ยังใช้ได้เป็นหลักฐานความสามารถด้วยตัวเอง
                  จึงพอชดเชยทักษะที่กำหนดใบรับรองได้ แม้ยังไม่มีแถวทักษะ
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>กำลังผลิตที่ใกล้หมดอายุ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">ใบรับรอง</span>
                  <AndonLamp status={dash?.expiring.certificates ? "down" : "idle"} size="sm" />
                  <span className="font-medium">{dash?.expiring.certificates ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">สิทธิ์</span>
                  <AndonLamp status={dash?.expiring.authorizations ? "down" : "idle"} size="sm" />
                  <span className="font-medium">{dash?.expiring.authorizations ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">บันทึกทักษะ</span>
                  <AndonLamp status={dash?.expiring.skill_records ? "down" : "idle"} size="sm" />
                  <span className="font-medium">{dash?.expiring.skill_records ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">งานที่รออบรม / เกินกำหนด</span>
                  <span className="font-medium">
                    {dash?.training.due ?? "—"} / {dash?.training.overdue ?? "—"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {dash?.readiness && (
            <Card>
              <CardHeader>
                <CardTitle>ความพร้อมของงานที่เข้าคิวไว้</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">พร้อมมอบหมาย</p>
                  <p className="text-2xl font-semibold text-emerald-600">{dash.readiness.ready}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">พร้อมบางส่วน</p>
                  <p className="text-2xl font-semibold text-amber-600">{dash.readiness.partial}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">ติดขัด</p>
                  <p className="text-2xl font-semibold text-red-600">{dash.readiness.blocked}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {dash?.conflicts && (
            <Card>
              <CardHeader>
                <CardTitle>ความขัดแย้งปัจจุบัน</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">ชนงาน (ช่วงเวลาทับกัน)</p>
                  <p className="text-2xl font-semibold">{dash.conflicts.double_booked}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">เกิน capacity</p>
                  <p className="text-2xl font-semibold">{dash.conflicts.over_capacity}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">อยู่ระหว่างลา</p>
                  <p className="text-2xl font-semibold">{dash.conflicts.on_leave}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {dash?.honesty && dash.honesty.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>ขอบเขตของข้อมูลที่แสดง</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dash.honesty.map((h) => (
                  <div key={h.key} className="flex items-start gap-2 text-sm">
                    <AndonLamp status={h.measured ? "ok" : "idle"} size="sm" />
                    <span className="text-muted-foreground">{h.note}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {cfg && (
            <Card>
              <CardHeader>
                <CardTitle>กฎการบังคับใช้ที่มีผลต่อคุณ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>ปฏิเสธคนที่ไม่ผ่านคุณสมบัติ</span>
                  <AndonLamp status={cfg.config.block_unqualified ? "down" : "idle"} size="sm" />
                  <span className="font-medium">{cfg.config.block_unqualified ? "เปิด" : "ปิด"}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>มอบหมายอัตโนมัติ</span>
                  <AndonLamp status={cfg.config.auto_assign ? "down" : "idle"} size="sm" />
                  <span className="font-medium">{cfg.config.auto_assign ? "เปิด" : "ปิด"}</span>
                </div>
                {can && (
                  <div className="flex items-center justify-between">
                    <span>สิทธิ์ของคุณในโมดูลนี้</span>
                    <span className="text-muted-foreground">
                      {Object.entries(can)
                        .filter(([, v]) => v)
                        .map(([k]) => k)
                        .join(", ") || "อ่านอย่างเดียว"}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}
