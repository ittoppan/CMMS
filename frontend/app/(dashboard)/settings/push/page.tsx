"use client";

/**
 * /settings/push — การแจ้งเตือนบนอุปกรณ์ (Web Push / PWA)
 * ผู้ใช้ทุกคน: กด "เปิดการแจ้งเตือน" 1 ครั้งต่ออุปกรณ์ — ระบบขอสิทธิ์จากเบราว์เซอร์
 * (ไม่ขอสิทธิ์อัตโนมัติ — browser บล็อก prompt ที่ไม่ได้มาจากการคลิก และผิดหลัก UX)
 *
 * State machine:
 *   loading → unsupported | ios-needs-install | disabled-admin | denied
 *             | default (ยังไม่อนุญาต) | no-sub (อนุญาตแต่อุปกรณ์นี้ยังไม่ลง) | active
 */
import { useCallback, useEffect, useState } from "react";
import { VStack, HStack, Grid } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { PageShell } from "@/components/PageShell";
import { swalConfirm } from "@/lib/swal";
import {
  pushSupport,
  enablePushForThisDevice,
  disablePushForThisDevice,
} from "@/lib/push";
import type { PushSubscribeResult } from "@/lib/push";
import {
  Bell,
  BellRing,
  BellOff,
  Smartphone,
  Monitor,
  CheckCircle2,
  Info,
  Send,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

interface DeviceRow {
  id: number;
  endpoint: string;
  created_at: string;
  updated_at: string;
}

type Phase = "loading" | "unsupported" | "ios-needs-install" | "disabled-admin" | "denied" | "default" | "no-sub" | "active";

export default function PushDevicePage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [currentEndpoint, setCurrentEndpoint] = useState<string>("");
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  /** อ่านสถานะปัจจุบัน: สิทธิ์เบราว์เซอร์ + subscription ของอุปกรณ์ + รายการอุปกรณ์จาก server */
  const load = useCallback(async () => {
    setPhase("loading");
    setFlash(null);
    try {
      const serverResp = await fetch("/api/v1/notifications.php?action=push_status", { credentials: "include" });
      const server = serverResp.ok ? await serverResp.json() : { items: [], push_enabled: true };
      setDevices(server.items ?? []);
      if (server.push_enabled === false) {
        setPhase("disabled-admin");
        return;
      }

      const support = pushSupport();
      if (support === "ios-needs-install") { setPhase("ios-needs-install"); return; }
      if (support === "unsupported") { setPhase("unsupported"); return; }

      const permission = Notification.permission;
      if (permission === "denied") { setPhase("denied"); return; }

      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setCurrentEndpoint(sub?.endpoint ?? "");

      const myEndpoints = new Set((server.items ?? []).map((d: DeviceRow) => d.endpoint));
      if (sub && myEndpoints.has(sub.endpoint)) setPhase("active");
      else if (permission === "granted") setPhase(sub ? "active" : "no-sub");
      else setPhase("default");
    } catch {
      setPhase("unsupported");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** ผู้ใช้กด "เปิดการแจ้งเตือน" — ขอสิทธิ์ผ่าน user gesture เท่านั้น */
  const enable = async () => {
    setBusy(true);
    setFlash(null);
    const result: PushSubscribeResult = await enablePushForThisDevice();
    setFlash({ ok: result.ok, text: result.ok ? "เปิดรับการแจ้งเตือนแล้ว — กด “ส่งข้อความทดสอบ” เพื่อลองรับข้อความจริงได้เลย" : result.message });
    setBusy(false);
    await load();
  };

  const disable = async () => {
    const ok = await swalConfirm({
      title: "ปิดรับการแจ้งเตือนบนอุปกรณ์นี้?",
      text: "จะไม่ได้รับแจ้งเตือนด่วนจากอุปกรณ์นี้อีก — เปิดใหม่ได้ทุกเมื่อด้วยปุ่มเดิม",
      confirmText: "ปิดรับการแจ้งเตือน",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    await disablePushForThisDevice();
    setBusy(false);
    setFlash({ ok: true, text: "ปิดรับการแจ้งเตือนบนอุปกรณ์นี้แล้ว" });
    await load();
  };

  const test = async () => {
    setTesting(true);
    setFlash(null);
    try {
      const res = await fetch("/api/v1/notifications.php?action=test_push_self", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      setFlash({ ok: !!json.success, text: json.message || json.error || "ส่งทดสอบแล้ว" });
    } catch {
      setFlash({ ok: false, text: "ส่งทดสอบไม่สำเร็จ — ลองอีกครั้ง" });
    }
    setTesting(false);
  };

  const hostOf = (endpoint: string) => {
    try { return new URL(endpoint).host; } catch { return endpoint.slice(0, 40); }
  };

  const deviceIcon = () => {
    const ua = navigator?.userAgent || "";
    return /Mobi|Android|iPhone|iPad/i.test(ua) ? Smartphone : Monitor;
  };
  const DeviceIcon = phase === "loading" ? Smartphone : deviceIcon();

  /* ─────────────────────────── หัวกล่องสถานะตาม phase ─────────────────────────── */
  const statusCard = () => {
    if (phase === "loading") {
      return (
        <div className="flex items-center gap-3 p-8">
          <Spinner size={20} />
          <span className="text-sm text-muted-foreground">ตรวจสอบสถานะอุปกรณ์…</span>
        </div>
      );
    }

    if (phase === "unsupported" || phase === "ios-needs-install") {
      return (
        <CardContent className="space-y-4 p-5">
          <StatusHeader icon={BellOff} tone="warning" title={phase === "ios-needs-install" ? "บน iPhone/iPad ต้องติดตั้งแอปก่อน" : "อุปกรณ์นี้ไม่รองรับการแจ้งเตือนแบบ Push"} />
          {phase === "ios-needs-install" ? (
            <VStack gap={2}>
              <Alert variant="info" title="ติดตั้งแอป CMMS ก่อน (1 ครั้ง)" description="1) เปิดเว็บด้วย Safari 2) ปุ่มแชร์ (ขึ้นลูกศร) 3) “เพิ่มไปยังหน้าแรก” จากนั้นเปิด CMMS ผ่านไอคอนแอปบนหน้าจอหลัก แล้วกลับมาหน้านี้เพื่อกดเปิดการแจ้งเตือน" />
              <p className="text-sm text-muted-foreground">
                iOS อนุญาตให้เว็บส่ง Push ได้เฉพาะตอนเปิดผ่านแอปที่ติดตั้งแล้วเท่านั้น (นโยบายของ Apple)
              </p>
            </VStack>
          ) : (
            <Alert variant="info" title="วิธีแก้" description="ใช้ Chrome / Edge / Firefox เวอร์ชันล่าสุด เปิดตัวเว็บ CMMS แล้วค่อยกลับมาหน้านี้ — บนมือถือ Android แนะนำ Chrome" />
          )}
        </CardContent>
      );
    }

    if (phase === "disabled-admin") {
      return (
        <CardContent className="space-y-4 p-5">
          <StatusHeader icon={BellOff} tone="warning" title="การแจ้งเตือนแบบ Push ปิดอยู่ชั่วคราว" />
          <Alert variant="info" title="ผู้ดูแลระบบปิดช่องทางนี้ไว้" description="ปุ่มเปิดจะใช้งานได้เมื่อผู้ดูแลระบบเปิดในหน้า ตั้งค่า → แจ้งเตือน — ส่วนการแจ้งเตือนบนหน้าเว็บ (กระดิ่งมุมขวา) ยังได้รับตามปกติ" />
        </CardContent>
      );
    }

    if (phase === "denied") {
      return (
        <CardContent className="space-y-4 p-5">
          <StatusHeader icon={BellOff} tone="warning" title="สิทธิ์การแจ้งเตือนถูกปิดอยู่" />
          <p className="text-sm text-muted-foreground">
            เคยกด “บล็อก” ไว้ก่อนหน้า — ต้องเปิดจากการตั้งค่าเบราว์เซอร์ก่อน แล้วรีเฟรชหน้านี้
          </p>
          <DeniedGuide />
        </CardContent>
      );
    }

    if (phase === "active") {
      return (
        <CardContent className="space-y-4 p-5">
          <StatusHeader icon={BellRing} tone="success" title="เปิดรับการแจ้งเตือนอยู่ — อุปกรณ์นี้พร้อมใช้งาน" />
          <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3" aria-hidden="true">
            <div className="mt-1 rounded-lg bg-[var(--cmms-primary)] px-2 py-1 text-[10px] font-bold text-white">CMMS</div>
            <VStack gap={0.5}>
              <span className="text-sm font-semibold">ตัวอย่าง: แจ้งซ่อมด่วน WO-2026-0142</span>
              <span className="text-xs text-muted-foreground">Press Machine 01 เสียงดังผิดปกติ — ความสำคัญ: สูง</span>
            </VStack>
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">เมื่อกี้</span>
          </div>
          <HStack gap={3} wrap="wrap">
            <Button onClick={test} disabled={testing}>
              {testing ? <Spinner size={14} /> : <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
              ส่งข้อความทดสอบถึงฉัน
            </Button>
            <Button variant="secondary" onClick={disable} disabled={busy} title="ยกเลิก subscription ของอุปกรณ์นี้">
              <BellOff className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              ปิดรับบนอุปกรณ์นี้
            </Button>
          </HStack>
        </CardContent>
      );
    }

    // default / no-sub → การ์ดเปิดใช้งาน (empty state ที่มี action ชัดเจน)
    return (
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center" style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg-muted)" }}>
          <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--cmms-primary-light)" }} aria-hidden="true">
            <Bell className="h-7 w-7" style={{ color: "var(--cmms-primary)" }} strokeWidth={1.75} />
          </div>
          <VStack gap={1}>
            <span className="min-w-0 break-words text-base font-semibold">{phase === "no-sub" ? "อนุญาตแล้ว — เหลือลงทะเบียนอุปกรณ์นี้ 1 ขั้น" : "ยังปิดการแจ้งเตือนบนอุปกรณ์นี้อยู่"}</span>
            <span className="mx-auto max-w-md text-sm text-muted-foreground">
              เปิดเพื่อรับแจ้งเตือนงานด่วนได้ทันทีแม้ไม่ได้เปิดหน้าจอ CMMS — เช่น งานซ่อมความเร่งด่วนสูง, สต็อกอะไหล่ต่ำกว่าเกณฑ์, SLA ใกล้เกิน
            </span>
          </VStack>
        </div>
        <Button size="lg" className="w-full sm:w-auto" onClick={enable} disabled={busy}>
          {busy ? <Spinner size={16} /> : <BellRing className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
          เปิดการแจ้งเตือน
        </Button>
        <p className="break-words text-xs text-muted-foreground">
          กดแล้วเบราว์เซอร์จะถาม “อนุญาตการแจ้งเตือนจาก {typeof window !== "undefined" ? window.location.host : "CMMS"} หรือไม่” — เลือกอนุญาต
        </p>
      </CardContent>
    );
  };

  const host = typeof window !== "undefined" ? window.location.host : "";

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">PUSH NOTIFICATIONS · CMMS-TOPPAN</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ตั้งค่า", href: "/settings" }, { label: "การแจ้งเตือนบนอุปกรณ์" }]}
      title="การแจ้งเตือนบนอุปกรณ์ (Web Push)"
      description="เปิดรับแจ้งเตือนแบบ Pop-up บนมือถือและเดสก์ท็อป — ทำ 1 ครั้งต่ออุปกรณ์"
      actions={
        <HStack gap={3} wrap="wrap">
          <Badge variant={phase === "active" ? "success" : "neutral"}>
            {phase === "active" ? "เปิดอยู่" : "ยังปิด"}
          </Badge>
          <Button variant="secondary" size="sm" onClick={load} aria-label="โหลดใหม่">
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            รีเฟรช
          </Button>
        </HStack>
      }
    >
      <VStack gap={6}>
        {flash && <Alert variant={flash.ok ? "success" : "danger"} title={flash.ok ? "สำเร็จ" : "ยังไม่สำเร็จ"} description={flash.text} />}

        <Grid columns={{ minWidth: 280 }} gap={6} style={{ alignItems: "start" }}>
          <Card>
            <CardContent className="space-y-4 p-5">
              <HStack gap={3} vAlign="center">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--cmms-primary-light)" }} aria-hidden="true">
                  <DeviceIcon className="h-5 w-5" style={{ color: "var(--cmms-primary)" }} strokeWidth={1.75} />
                </div>
                <VStack gap={0}>
                  <h2 className="text-base font-semibold">อุปกรณ์นี้ ({DeviceIcon === Smartphone ? "มือถือ" : "เดสก์ท็อป"})</h2>
                  <p className="text-xs text-muted-foreground">{host}</p>
                </VStack>
              </HStack>
              {statusCard()}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <HStack gap={3} vAlign="center">
                <Info className="h-5 w-5 text-[var(--cmms-primary)]" strokeWidth={1.75} aria-hidden="true" />
                <h3 className="text-base font-semibold">เมื่อเปิดแล้วจะได้รับอะไร</h3>
              </HStack>
              <VStack gap={2.5}>
                {[
                  ["งานซ่อมด่วน", "งานซ่อมที่ระดับความสำคัญสูง/วิกฤต และการรับงานของคุณ"],
                  ["SLA ใกล้เกิน", "งานที่กำลังจะเกินเวลามาตรฐาน (escalation)"],
                  ["สต็อกอะไหล่ต่ำ", "อะไหล่ต่ำกว่าจุดสั่งซื้อ (ตามกฎแจ้งเตือนที่ตั้งไว้)"],
                  ["การตั้งค่าต่อช่องทาง", "ยังเลือกได้ว่าจะรับประเภทไหนบ้าง ที่หน้า “การแจ้งเตือนของฉัน”"],
                ].map(([t, d]) => (
                  <HStack key={t} gap={2.5} vAlign="start">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--cmms-primary)" }} strokeWidth={1.75} aria-hidden="true" />
                    <span className="text-sm"><strong className="font-medium">{t}:</strong> <span className="text-muted-foreground">{d}</span></span>
                  </HStack>
                ))}
              </VStack>
              <p className="text-xs text-muted-foreground" style={{ borderTop: "1px solid var(--cmms-border)", paddingTop: 10 }}>
                ต้องการปรับรูปแบบข้อความแจ้งเตือน? ผู้ดูแลระบบจัดการได้ที่ <a href="/settings/notifications" className="inline-flex min-h-10 items-center py-1 underline" style={{ color: "var(--cmms-primary)" }}>ตั้งค่ารูปแบบการแจ้งเตือน</a>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <HStack gap={3} vAlign="center">
                <Smartphone className="h-5 w-5 text-[var(--cmms-primary)]" strokeWidth={1.75} aria-hidden="true" />
                <h3 className="text-base font-semibold">อุปกรณ์ที่ลงทะเบียนของฉัน</h3>
                <Badge variant="neutral">{devices.length}</Badge>
              </HStack>
              {devices.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีอุปกรณ์ที่ลงทะเบียน — กด “เปิดการแจ้งเตือน” บนอุปกรณ์ที่ต้องการ</p>
              ) : (
                <VStack gap={0}>
                  {devices.slice(0, 8).map((d, i) => (
                    <div key={d.id} className={`flex items-center gap-3 py-2.5 ${i > 0 ? "border-t" : ""}`} style={{ borderColor: "var(--cmms-border)" }}>
                      <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                      <VStack gap={0}>
                        <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
                          {hostOf(d.endpoint)}
                          {currentEndpoint && d.endpoint === currentEndpoint && <Badge variant="info">อุปกรณ์นี้</Badge>}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ลงทะเบียน {formatThaiDate(d.updated_at ?? d.created_at)}
                        </span>
                      </VStack>
                    </div>
                  ))}
                </VStack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </VStack>
    </PageShell>
  );
}

/* ───────── mini components ───────── */

function StatusHeader({ icon: Icon, tone, title }: { icon: LucideIcon; tone: "success" | "warning"; title: string }) {
  return (
    <HStack gap={3} vAlign="center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: tone === "success" ? "var(--cmms-primary-light)" : "var(--cmms-bg-muted)" }} aria-hidden="true">
        <Icon className="h-5 w-5" style={{ color: tone === "success" ? "var(--cmms-primary)" : "var(--cmms-text-secondary)" }} strokeWidth={1.75} />
      </div>
      <span className="min-w-0 break-words text-base font-semibold">{title}</span>
    </HStack>
  );
}

/** วิธีเปิดสิทธิ์เมื่อเคยกดบล็อก — แยกตามเบราว์เซอร์ยอดนิยม */
function DeniedGuide() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const steps: Array<[string, string]> = isIOS
    ? [
      ["iPhone/iPad — Safari", "ตั้งค่า (Settings) → Safari → การแจ้งเตือน หรือ ตั้งค่า → การแจ้งเตือน → Safari"],
      ["iPhone/iPad — แอป CMMS", "ตั้งค่า → การแจ้งเตือน → ค้นหา “CMMS” แล้วเปิดอนุญาต"],
    ]
    : isAndroid
      ? [
        ["Chrome (Android)", "ไอคอนลูกศรข้างที่อยู่เว็บ → การแจ้งเตือน (Notifications) → อนุญาต หรือ การตั้งค่าเว็บไซต์ → การแจ้งเตือน"],
        ["ตั้งค่าแอป", "การตั้งค่าเครื่อง → แอปพลิเคชัน → Chrome → การแจ้งเตือน → อนุญาต"],
      ]
      : [
        ["Chrome / Edge (เดสก์ท็อป)", "ไอคอนรูปล็อก/ข้อมูลซ้ายของแถบที่อยู่ → การแจ้งเตือน (Notifications) → เลือกอนุญาต แล้วรีเฟรชหน้า"],
        ["กล่องการแจ้งเตือนระบบ", "Windows: การตั้งค่า → ระบบ → การแจ้งเตือนและการเน้น (โดยไม่รบกวน) — ดูว่าบล็อกเบราว์เซอร์ไว้หรือไม่"],
      ];
  return (
    <VStack gap={2.5}>
      {steps.map(([t, d]) => (
        <HStack key={t} gap={2.5} vAlign="start">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--cmms-primary)" }} aria-hidden="true" />
          <span className="text-sm"><strong className="font-medium">{t}</strong> — <span className="text-muted-foreground">{d}</span></span>
        </HStack>
      ))}
    </VStack>
  );
}

function formatThaiDate(iso: string): string {
  try {
    const d = new Date(iso.replace(" ", "T"));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })
      + " " + d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
