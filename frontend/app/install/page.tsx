"use client";

/**
 * /install — หน้า public สำหรับติดตั้ง PWA (ไม่ต้องล็อกอิน)
 *
 * ใช้เป็นปลายทางเดียวของ: rich menu LINE OA, QR สติกเกอร์/โปสเตอร์, ลิงก์จากหน้าตั้งค่า
 * ตรรกะตรวจเครื่องทั้งหมดอยู่ใน `lib/install-detect.ts` — หน้านี้มีหน้าที่เลือกข้อความ/ปุ่มตามโหมด
 *
 * ทำไมต้องมีหน้านี้: ลิงก์ที่เปิดใน LINE in-app browser ติดตั้ง PWA ไม่ได้ (ทั้ง iOS WebView
 * และ Android Custom Tab) ผู้ใช้จึงต้องถูกพาไปเปิด Safari/Chrome ก่อน — ซึ่งอธิบายด้วยข้อความ
 * อย่างเดียวไม่ได้ผล
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import {
  Bell,
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  QrCode as QrCodeIcon,
  Share,
  Smartphone,
  WifiOff,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { VStack, HStack } from "@/components/layout";
import { qrDarkColor } from "@/lib/qr-color";
import {
  androidChromeIntent,
  describeEnv,
  detectInstallMode,
  detectPlatform,
  onInstallPromptReady,
  promptInstall,
  readInstallEnv,
  type InstallEnv,
  type InstallMode,
} from "@/lib/install-detect";

const BENEFITS = [
  { icon: Zap, title: "เปิดเร็วขึ้น", desc: "โหลดหน้าเดิมได้ทันที ไม่ต้องพิมพ์ที่อยู่เว็บใหม่" },
  { icon: ClipboardList, title: "ทางลัดงานหน้างาน", desc: "กดค้างที่ไอคอนเพื่อแจ้งซ่อม / ทำเช็คชีท PM" },
  { icon: WifiOff, title: "เน็ตหลุดก็ยังเปิดได้", desc: "หน้าที่เคยเปิดไว้ยังใช้งานต่อได้บางส่วน" },
  { icon: Bell, title: "รับแจ้งเตือน", desc: "บน iPhone ต้องติดตั้งแอปก่อนจึงรับ Push ได้" },
] as const;

export default function InstallPage() {
  const router = useRouter();
  const [env, setEnv] = useState<InstallEnv | null>(null);
  const [mode, setMode] = useState<InstallMode | null>(null);
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [promptResult, setPromptResult] = useState<"accepted" | "dismissed" | "error" | "">("");
  const [busy, setBusy] = useState(false);

  const sync = useCallback(() => {
    const next = readInstallEnv();
    setEnv(next);
    setMode(detectInstallMode(next));
  }, []);

  useEffect(() => {
    setUrl(window.location.href);
    sync();

    const onInstalled = () => {
      setPromptResult("accepted");
      sync();
    };
    window.addEventListener("appinstalled", onInstalled);
    const unsubscribe = onInstallPromptReady(sync);
    const mq =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(display-mode: standalone)")
        : null;
    mq?.addEventListener("change", sync);

    return () => {
      window.removeEventListener("appinstalled", onInstalled);
      unsubscribe();
      mq?.removeEventListener("change", sync);
    };
  }, [sync]);

  // QR: มีประโยชน์เฉพาะตอนเปิดบนจอใหญ่ (มือถือสแกนจอตัวเองไม่ได้)
  // สร้างจาก location.href จริง → ถ้าเปลี่ยนโดเมน/พอร์ต QR ก็ยังถูกต้อง
  useEffect(() => {
    if (!env || env.standalone) return;
    if (detectPlatform(env.userAgent, env.maxTouchPoints) !== "desktop") return;
    let alive = true;
    const dark = qrDarkColor();
    QRCode.toDataURL(url || window.location.href, {
      width: 320,
      margin: 1,
      ...(dark ? { color: { dark, light: "#FFFFFF" } } : {}),
    })
      .then((data) => {
        if (alive) setQr(data);
      })
      .catch(() => {
        if (alive) setQr(null);
      });
    return () => {
      alive = false;
    };
  }, [env, url]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const installNow = async () => {
    setBusy(true);
    const result = await promptInstall();
    setPromptResult(result === "unavailable" ? "error" : result);
    setBusy(false);
    if (result === "accepted") sync();
  };

  const platform = env ? detectPlatform(env.userAgent, env.maxTouchPoints) : "other";
  const chromeIntent = platform === "android" && url ? androidChromeIntent(url) : null;

  return (
    <main className="min-h-[100dvh] bg-[var(--cmms-bg-page)] px-4 py-8">
      <div className="mx-auto w-full max-w-[560px]">
        <VStack gap={5}>
          {/* หัวเรื่อง */}
          <VStack gap={3} style={{ alignItems: "center", textAlign: "center" }}>
            <img src="/logo.png" alt="TOPPAN" style={{ height: 40, width: "auto" }} />
            <VStack gap={1} style={{ alignItems: "center" }}>
              <p className="cmms-eyebrow m-0">CMMS-TOPPAN APP</p>
              <h1 className="text-xl font-bold text-[var(--cmms-text-primary)]">
                ติดตั้ง CMMS-TOPPAN บนมือถือ
              </h1>
              <p className="text-sm text-[var(--cmms-text-secondary)]">
                เปิดงานซ่อมบำรุงและเช็คชีทได้ในแตะเดียว เหมือนแอปทั่วไป
              </p>
            </VStack>
          </VStack>

          {/* ส่วนปุ่ม/ขั้นตอนตามสภาพเครื่อง */}
          <Card>
            <CardContent className="space-y-4 p-5">
              {mode === null || !env ? (
                <HStack gap={3} vAlign="center" style={{ justifyContent: "center", padding: "16px 0" }}>
                  <Spinner size={20} />
                  <span className="text-sm text-muted-foreground">กำลังตรวจสอบเครื่องนี้…</span>
                </HStack>
              ) : (
                <>
                  {promptResult === "accepted" && (
                    <Alert
                      variant="success"
                      title="ติดตั้งแล้ว"
                      description="เปิดแอปได้จากไอคอน CMMS-TOPPAN บนหน้าจอโฮม (หน้าต่างนี้ปิดได้)"
                    />
                  )}

                  {mode === "installed" && (
                    <VStack gap={3}>
                      <Alert
                        variant="success"
                        title="เครื่องนี้ติดตั้งแอปแล้ว"
                        description="คุณกำลังใช้งานในโหมดแอป (ไม่ใช่แท็บเบราว์เซอร์)"
                      />
                      <Button size="lg" onClick={() => router.push("/")}>
                        เปิดแอป
                      </Button>
                    </VStack>
                  )}

                  {mode === "insecure" && (
                    <Alert
                      variant="danger"
                      title="หน้านี้เปิดด้วย http จึงติดตั้งไม่ได้"
                      description="เบราว์เซอร์อนุญาตให้ติดตั้ง PWA เฉพาะเมื่อเปิดผ่าน https (หรือ localhost) — แจ้งผู้ดูแลระบบให้เปิดระบบผ่านโดเมนที่มีใบรับรองความปลอดภัยก่อน"
                    />
                  )}

                  {mode === "in-app" && (
                    <VStack gap={4}>
                      <Alert
                        variant="warning"
                        title="กำลังเปิดในแอป LINE — ติดตั้งจากตรงนี้ไม่ได้"
                        description="เบราว์เซอร์ภายในแอป LINE ไม่รองรับการติดตั้งแอป ต้องเปิดลิงก์นี้ใน Safari หรือ Chrome ก่อน"
                      />
                      <VStack gap={3}>
                        <Step n={1}>
                          {platform === "ios"
                            ? "กดปุ่ม ⋯ มุมขวาบน แล้วเลือก “เปิดใน Safari”"
                            : "กดปุ่ม ⋯ มุมขวาบน แล้วเลือก “เปิดในเบราว์เซอร์”"}
                        </Step>
                        <Step n={2}>เมื่อเปิดในเบราว์เซอร์แล้ว กลับมาหน้านี้ — จะมีปุ่ม/ขั้นตอนติดตั้งให้</Step>
                      </VStack>
                      <HStack gap={3} wrap="wrap">
                        {chromeIntent && (
                          <a
                            href={chromeIntent}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--cmms-radius)] bg-[var(--cmms-primary)] px-4 text-sm font-semibold text-white"
                          >
                            <ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                            เปิดใน Chrome
                          </a>
                        )}
                        <CopyLinkButton copied={copied} onClick={copyLink} />
                      </HStack>
                      <UrlHint url={url} />
                    </VStack>
                  )}

                  {mode === "promptable" && (
                    <VStack gap={3}>
                      <Button size="lg" onClick={installNow} loading={busy} loadingText="กำลังเปิดหน้าต่างติดตั้ง…">
                        ติดตั้งแอป
                      </Button>
                      {promptResult === "dismissed" && (
                        <p className="text-sm text-muted-foreground">
                          ยังไม่ติดตั้ง — ติดตั้งภายหลังได้จากเมนู ⋮ ของเบราว์เซอร์
                        </p>
                      )}
                      {promptResult === "error" && (
                        <p className="text-sm text-muted-foreground">
                          เปิดหน้าต่างติดตั้งไม่สำเร็จ — ลองใช้เมนู ⋮ → “ติดตั้งแอป”
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        ระบบจะเพิ่มไอคอนบนหน้าจอโฮม และเปิดแบบเต็มจอเมื่อเข้าใช้งานครั้งต่อไป
                      </p>
                    </VStack>
                  )}

                  {(mode === "ios-safari" || mode === "ios-other-browser") && (
                    <VStack gap={4}>
                      {mode === "ios-other-browser" && (
                        <Alert
                          variant="info"
                          title="ต้องเปิดลิงก์นี้ด้วย Safari"
                          description="iPhone/iPad ติดตั้งเว็บแอปได้จาก Safari เท่านั้น (Chrome/Edge บน iOS ทำไม่ได้)"
                        />
                      )}
                      <VStack gap={3}>
                        <Step n={1}>
                          <Share className="mr-1 inline h-4 w-4 align-text-bottom" strokeWidth={1.75} aria-hidden="true" />
                          กดปุ่มแชร์ที่แถบล่างของ Safari
                        </Step>
                        <Step n={2}>เลื่อนหา “เพิ่มไปยังหน้าจอโฮม” (Add to Home Screen)</Step>
                        <Step n={3}>กด “เพิ่ม” — ไอคอน CMMS-TOPPAN จะอยู่บนหน้าจอโฮม</Step>
                      </VStack>
                      <CopyLinkButton copied={copied} onClick={copyLink} />
                      <UrlHint url={url} />
                    </VStack>
                  )}

                  {mode === "android" && (
                    <VStack gap={4}>
                      <VStack gap={3}>
                        <Step n={1}>เปิดหน้านี้ด้วย Chrome (ถ้าเปิดจากแอปอื่น ให้แตะ ⋯ → เปิดในเบราว์เซอร์)</Step>
                        <Step n={2}>แตะเมนู ⋮ มุมขวาบน</Step>
                        <Step n={3}>เลือก “ติดตั้งแอป” หรือ “เพิ่มไปยังหน้าจอหลัก”</Step>
                      </VStack>
                      <CopyLinkButton copied={copied} onClick={copyLink} />
                      <UrlHint url={url} />
                    </VStack>
                  )}

                  {mode === "desktop" && (
                    <VStack gap={4}>
                      <VStack gap={3}>
                        <Step n={1}>คลิกไอคอนติดตั้งที่ท้ายช่องที่อยู่เว็บ (หรือเมนู ⋮ → “บันทึกและแชร์” → “ติดตั้งแอป”)</Step>
                        <Step n={2}>กด “ติดตั้ง” — จะได้หน้าต่างแอปแยกและทางลัดบนเดสก์ท็อป</Step>
                      </VStack>
                      <p className="text-sm text-muted-foreground">
                        ใช้ Firefox อยู่หรือไม่? เบราว์เซอร์นี้ยังติดตั้ง PWA ไม่ได้ — ใช้ Chrome หรือ Edge แทน
                        (หรือสแกน QR ด้านล่างเพื่อติดตั้งบนมือถือ)
                      </p>
                      <p className="text-sm text-muted-foreground">
                        ยังไม่เห็นไอคอนติดตั้ง? Chrome จะแสดงตัวเลือกติดตั้งหลังใช้งานหน้านี้สักครู่
                        — ลองคลิก/เลื่อนหน้านี้ แล้วกดปุ่มด้านล่างเพื่อตรวจสอบอีกครั้ง
                      </p>
                      <Button size="lg" onClick={installNow} loading={busy} loadingText="กำลังตรวจสอบ…">
                        ลองเปิดหน้าต่างติดตั้ง
                      </Button>
                      {promptResult === "error" && (
                        <p className="text-sm text-muted-foreground">
                          ยังไม่พร้อม — ใช้งานหน้านี้อีกสักครู่ แล้วลองใหม่ หรือใช้เมนู ⋮ → “บันทึกและแชร์” → “ติดตั้งแอป”
                        </p>
                      )}
                    </VStack>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* QR สำหรับจอใหญ่ → มือถือ */}
          {qr && mode !== "installed" && (
            <Card>
              <CardContent className="space-y-3 p-5">
                <HStack gap={3} vAlign="center">
                  <QrCodeIcon className="h-5 w-5 text-[var(--cmms-primary)]" strokeWidth={1.75} aria-hidden="true" />
                  <h2 className="text-base font-semibold">สแกนด้วยมือถือเพื่อเปิดหน้านี้</h2>
                </HStack>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <img
                    src={qr}
                    alt="QR เปิดหน้าแนะนำการติดตั้งบนมือถือ"
                    width={200}
                    height={200}
                    style={{ background: "#fff", borderRadius: 12, padding: 8 }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  เปิดกล้องมือถือแล้วสแกน — จากนั้นทำตามขั้นตอนบนหน้าจอมือถือ
                </p>
              </CardContent>
            </Card>
          )}

          {/* ทำไมควรติดตั้ง */}
          <Card>
            <CardContent className="space-y-3 p-5">
              <HStack gap={3} vAlign="center">
                <Smartphone className="h-5 w-5 text-[var(--cmms-primary)]" strokeWidth={1.75} aria-hidden="true" />
                <h2 className="text-base font-semibold">ทำไมควรติดตั้ง</h2>
              </HStack>
              <VStack gap={3}>
                {BENEFITS.map(({ icon: Icon, title, desc }) => (
                  <HStack key={title} gap={3} vAlign="center">
                    <Icon
                      className="h-4 w-4 shrink-0 text-[var(--cmms-text-secondary)]"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium">{title}</p>
                      <p className="text-sm text-muted-foreground">{desc}</p>
                    </div>
                  </HStack>
                ))}
              </VStack>
            </CardContent>
          </Card>

          {/* ท้ายหน้า */}
          <VStack gap={2} style={{ textAlign: "center" }}>
            <p className="text-sm text-muted-foreground">
              ต้องเข้าสู่ระบบด้วยบัญชี CMMS ของคุณก่อนใช้งาน —{" "}
              <Link href="/login" className="underline" style={{ color: "var(--cmms-primary)" }}>
                ไปหน้าเข้าสู่ระบบ
              </Link>
            </p>
            {env && (
              <p className="text-xs text-muted-foreground">ตรวจพบ: {describeEnv(env)}</p>
            )}
          </VStack>
        </VStack>
      </div>
    </main>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}
      >
        {n}
      </span>
      <p className="text-sm">{children}</p>
    </div>
  );
}

function CopyLinkButton({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  return (
    <Button variant="secondary" onClick={onClick}>
      {copied ? (
        <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      )}
      {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
    </Button>
  );
}

/** แสดง URL จริงให้เลือกคัดลอกเองได้ (กรณี clipboard API ถูกบล็อก) */
function UrlHint({ url }: { url: string }) {
  if (!url) return null;
  return (
    <code className="block break-all rounded-[var(--cmms-radius)] bg-[var(--cmms-bg-muted)] p-2 text-xs text-[var(--cmms-text-secondary)]">
      {url}
    </code>
  );
}

