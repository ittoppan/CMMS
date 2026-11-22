"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePageHero, t } from "@/lib/i18n";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  Rocket,
  Settings,
  Users,
  Building2,
  Truck,
  Cpu,
  Package,
  CalendarDays,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";

type StepStatus = "done" | "pending" | "empty";

interface Step {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: any;
  minCount: number;
  count: number | null;
  loading: boolean;
}

const STEP_META: Omit<Step, "count" | "loading">[] = [
  {
    id: "settings",
    title: "1. ตั้งค่าระบบ (Settings)",
    description: "ชื่อบริษัท ที่อยู่ timezone สกุลเงิน และค่าพื้นฐานของระบบ",
    href: "/settings",
    icon: Settings,
    minCount: 5,
  },
  {
    id: "roles",
    title: "2. บทบาท & สิทธิ์ (Roles)",
    description: "กำหนด role (Admin/Manager/Technician/...) และสิทธิ์เมนูต่อ role",
    href: "/roles",
    icon: ShieldCheck,
    minCount: 1,
  },
  {
    id: "users",
    title: "3. ผู้ใช้งาน (Users)",
    description: "สร้างบัญชีผู้ใช้และกำหนด role + แผนก",
    href: "/users",
    icon: Users,
    minCount: 2,
  },
  {
    id: "departments",
    title: "4. แผนก (Departments)",
    description: "รายชื่อแผนก/ฝ่ายขององค์กร",
    href: "/settings/master/departments",
    icon: Building2,
    minCount: 1,
  },
  {
    id: "locations",
    title: "5. ที่ตั้ง/สถานที่ (Locations)",
    description: "อาคาร ชั้น พื้นที่ติดตั้งเครื่องจักร",
    href: "/settings/master/locations",
    icon: Building2,
    minCount: 1,
  },
  {
    id: "suppliers",
    title: "6. ผู้จำหน่าย (Suppliers)",
    description: "ซัพพลายเออร์อะไหล่และบริการ",
    href: "/suppliers",
    icon: Truck,
    minCount: 1,
  },
  {
    id: "assets",
    title: "7. ทะเบียนเครื่องจักร (Assets)",
    description: "เครื่องจักร/อุปกรณ์ที่ต้องบำรุงรักษา",
    href: "/asset_registry",
    icon: Cpu,
    minCount: 1,
  },
  {
    id: "spare_parts",
    title: "8. อะไหล่ (Spare Parts)",
    description: "รายการอะไหล่ สต็อก min/max ที่เก็บ",
    href: "/spare_parts",
    icon: Package,
    minCount: 1,
  },
  {
    id: "pm",
    title: "9. แผน PM (Preventive Maintenance)",
    description: "แผนบำรุงรักษาเชิงป้องกันต่อเครื่องจักร",
    href: "/pm_am",
    icon: CalendarDays,
    minCount: 1,
  },
];

async function fetchCount(id: string): Promise<number> {
  try {
    switch (id) {
      case "settings": {
        const r = await fetch("/api/v1/settings.php");
        const j = await r.json();
        return Array.isArray(j) ? j.length : 0;
      }
      case "roles": {
        const r = await fetch("/api/v1/roles.php");
        const j = await r.json();
        return Array.isArray(j) ? j.length : 0;
      }
      case "users": {
        const r = await fetch("/api/v1/users.php");
        const j = await r.json();
        return Array.isArray(j) ? j.length : 0;
      }
      case "departments": {
        const r = await fetch("/api/v1/master_data.php?entity=departments");
        const j = await r.json();
        return Array.isArray(j) ? j.length : 0;
      }
      case "locations": {
        const r = await fetch("/api/v1/master_data.php?entity=locations");
        const j = await r.json();
        return Array.isArray(j) ? j.length : 0;
      }
      case "suppliers": {
        const r = await fetch("/api/v1/suppliers.php");
        const j = await r.json();
        return Array.isArray(j) ? j.length : 0;
      }
      case "assets": {
        const r = await fetch("/api/v1/asset_registry.php");
        const j = await r.json();
        return Array.isArray(j) ? j.length : (Array.isArray(j?.data) ? j.data.length : 0);
      }
      case "spare_parts": {
        const r = await fetch("/api/v1/spare_parts.php");
        const j = await r.json();
        return Array.isArray(j) ? j.length : (Array.isArray(j?.data) ? j.data.length : 0);
      }
      case "pm": {
        const r = await fetch("/api/v1/pm_am.php");
        const j = await r.json();
        return Array.isArray(j) ? j.length : (Array.isArray(j?.data) ? j.data.length : 0);
      }
      default:
        return 0;
    }
  } catch {
    return 0;
  }
}

export default function OnboardingPage() {
  const hero = usePageHero("settings");
  const router = useRouter();
  const [steps, setSteps] = useState<Step[]>(
    STEP_META.map((m) => ({ ...m, count: null, loading: true }))
  );
  const [refreshing, setRefreshing] = useState(false);
  const [goLiveDone, setGoLiveDone] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const updated = await Promise.all(
      steps.map(async (s) => {
        const c = await fetchCount(s.id);
        return { ...s, count: c, loading: false };
      })
    );
    setSteps(updated);
    setRefreshing(false);
  }, [steps]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allDone = useMemo(() => steps.every((s) => (s.count ?? 0) >= s.minCount), [steps]);
  const doneCount = useMemo(() => steps.filter((s) => (s.count ?? 0) >= s.minCount).length, [steps]);

  const statusOf = (s: Step): StepStatus => {
    if (s.loading || s.count === null) return "pending";
    return s.count >= s.minCount ? "done" : s.count === 0 ? "empty" : "pending";
  };

  return (
    <>
      <PageHeader
        eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
        breadcrumbs={[
          { label: "แดชบอร์ด", href: "/dashboard" },
          { label: "Onboarding" },
        ]}
        title="Onboarding Wizard — เตรียมข้อมูลหลักก่อน Go Live"
        description="ทำตามลำดับขั้นตอนนี้เพื่อป้อน Master Data ให้ครบก่อนเริ่มใช้งานจริง"
        actions={[
          <Button key="refresh" variant="secondary" onClick={refresh} disabled={refreshing}>
            {refreshing ? "กำลังตรวจสอบ..." : "ตรวจสอบใหม่"}
          </Button>,
        ]}
      />
      <div className="space-y-6">
        <Alert variant={allDone ? "success" : "info"}>
          {allDone
            ? "ข้อมูลหลักครบถ้วนแล้ว — ระบบพร้อม Go Live"
            : `ความคืบหน้า: ${doneCount}/${steps.length} ขั้นตอนเสร็จสิ้น`}
        </Alert>

        <div className="grid gap-4">
          {steps.map((s) => {
            const st = statusOf(s);
            const Icon = s.icon;
            return (
              <Card key={s.id} className="p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div
                    className={
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg " +
                      (st === "done"
                        ? "bg-emerald-100 text-emerald-700"
                        : st === "empty"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-700")
                    }
                  >
                    {st === "done" ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : (
                      <Icon className="w-6 h-6" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold">{s.title}</h3>
                      <Badge variant={st === "done" ? "success" : st === "empty" ? "danger" : "warning"}>
                        {s.loading
                          ? "กำลังโหลด..."
                          : st === "done"
                          ? `เสร็จ (${s.count})`
                          : s.count === 0
                          ? "ยังไม่มีข้อมูล"
                          : `บางส่วน (${s.count}/${s.minCount})`}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{s.description}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push(s.href)}
                    className="gap-1.5"
                  >
                    ไปจัดการ
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Readiness check */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="w-5 h-5 text-[var(--cmms-primary-hover)]" />
              Readiness Check ก่อน Go Live
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {steps.map((s) => {
              const ok = (s.count ?? 0) >= s.minCount;
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    {ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Circle className="w-4 h-4 text-rose-500" />
                    )}
                    {s.title}
                  </span>
                  <span className={ok ? "text-emerald-600 font-medium" : "text-rose-600 font-medium"}>
                    {ok ? "ผ่าน" : "ไม่ผ่าน"}
                  </span>
                </div>
              );
            })}

            <div className="pt-4 flex flex-wrap items-center gap-3">
              <Button
                disabled={!allDone || goLiveDone}
                onClick={() => setGoLiveDone(true)}
                className="gap-1.5"
              >
                <Rocket className="w-4 h-4" />
                {goLiveDone ? "Go Live แล้ว" : "ยืนยัน Go Live"}
              </Button>
              {!allDone && (
                <p className="text-sm text-muted-foreground">
                  กรุณาทำให้ทุกขั้นตอน "ผ่าน" ก่อน Go Live
                </p>
              )}
              {goLiveDone && (
                <p className="text-sm text-emerald-600 font-medium">
                  ระบบพร้อมใช้งาน — ไปที่ Dashboard เพื่อเริ่มงาน
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
