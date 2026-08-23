"use client";

import { useState, useEffect, useCallback } from "react";
import { VStack, HStack } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/PageShell";

interface ServiceInfo {
  key: string;
  name: string;
  icon: string;
  desc: string;
  status: "running" | "stopped" | "warning" | "unknown";
  running: boolean;
  detail: string;
  pid: number | null;
  port: number | null;
  url: string;
}

const STATUS_CHIP_STYLE: Record<string, React.CSSProperties> = {
  running: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  stopped: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
  warning: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  unknown: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
};

const STATUS_LABEL: Record<string, string> = {
  running: "รันอยู่",
  stopped: "หยุดอยู่",
  warning: "มีปัญหา",
  unknown: "ไม่ทราบ",
};

function LinkRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <HStack hAlign="between" vAlign="center" gap={3}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="break-all text-sm text-muted-foreground">
          {value || "—"}
        </p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={!value}
        onClick={onCopy}
      >
        {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
      </Button>
    </HStack>
  );
}

export default function SystemServicesPage() {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setNotice("คัดลอกไม่สำเร็จ — คัดลอกจากข้อความเองได้เลย");
    }
  };

  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/system_services.php");
      const json = await res.json();
      if (json.success && Array.isArray(json.services)) {
        setServices(json.services);
        setLastRefresh(json.server_time || new Date().toLocaleTimeString("th-TH"));
      } else {
        setError(json.error || "โหลดสถานะ service ไม่สำเร็จ");
      }
    } catch (e) {
      setError("ไม่สามารถติดต่อ API ได้ — ระบบ API อาจหยุดทำงาน");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const runAction = async (key: string, action: "start" | "stop") => {
    setBusyKey(key);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/system_services.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, service: key }),
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.services)) {
        setServices(json.services);
        setNotice(
          action === "start"
            ? `เริ่ม ${key} แล้ว — รอระบบตอบสนองประมาณ 10-20 วินาที`
            : `หยุด ${key} แล้ว`
        );
      } else {
        setNotice(json.error || "คำสั่งไม่สำเร็จ");
      }
    } catch (e) {
      setNotice("ติดต่อ API ไม่ได้");
    } finally {
      setBusyKey(null);
    }
  };

  const allRunning = services.every((s) => s.running);

  // URL ภายนอกสำหรับ LINE (Cloudflare ก่อน ngrok)
  const cfService = services.find((s) => s.key === "cloudflared");
  const ngrokService = services.find((s) => s.key === "ngrok");
  const cfUrl = cfService?.url || "";
  const ngrokUrl = ngrokService?.url || "";
  const baseUrl = cfUrl || ngrokUrl;
  const webhookUrl = baseUrl ? `${baseUrl.replace(/\/+$/, "")}/api/v1/line_webhook.php` : "";
  const liffUrl = cfUrl || "";

  return (
    <PageShell
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ตั้งค่า", href: "/settings" }, { label: "บริการและสถานะการรันระบบ" }]}
      title="Service & การรันระบบ"
      description="เช็คว่า service ตัวไหนรันหรือยัง และรัน/หยุดได้จากที่นี่ (เฉพาะผู้ดูแลระบบ)"
      actions={
        <>
          <span
            className="cmms-andon-chip"
            style={allRunning
              ? { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" }
              : { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}
          >
            {allRunning ? "ทุก service รันปกติ" : "มี service ที่ยังไม่รัน"}
          </span>
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => fetchStatus()}
          >
            {loading ? "กำลังโหลด..." : "รีเฟรชสถานะ"}
          </Button>
        </>
      }
    >
      <VStack gap={6}>
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด">{error}</Alert>}
      {notice && <Alert variant="info" title="ผลลัพธ์">{notice}</Alert>}

      {loading && services.length === 0 ? (
        <HStack gap={2}><Spinner size={20} /><span className="text-sm">กำลังตรวจสอบ service...</span></HStack>
      ) : (
        <VStack gap={4}>
          <p className="text-sm text-muted-foreground">
            อัปเดตล่าสุด: {lastRefresh || "-"} — การรันบางตัวใช้เวลา (Next.js ~10-20 วิ, ngrok ~5-10 วิ)
          </p>

          {services.map((s) => {
            const isBusy = busyKey === s.key;
            return (
              <Card key={s.key}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <HStack gap={4} vAlign="center">
                    <span className="text-[28px] leading-none">{s.icon}</span>
                    <VStack gap={1}>
                      <HStack gap={2} vAlign="center">
                        <h3 className="m-0 text-base font-semibold">{s.name}</h3>
                        <span className="cmms-andon-chip" style={STATUS_CHIP_STYLE[s.status] || STATUS_CHIP_STYLE.unknown}>
                          {STATUS_LABEL[s.status] || s.status}
                        </span>
                        {isBusy && <Spinner size={16} />}
                      </HStack>
                      <p className="text-sm text-muted-foreground">{s.desc}</p>
                      <p className="text-sm">
                        {s.detail}
                        {s.url && s.status === "running" && (
                          <> • <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--cmms-primary)", fontWeight: 600 }}>เปิด URL</a></>
                        )}
                      </p>
                    </VStack>
                  </HStack>
                  <HStack gap={2}>
                    {!s.running ? (
                      <Button
                        disabled={isBusy}
                        onClick={() => runAction(s.key, "start")}
                      >
                        ▶ รัน
                      </Button>
                    ) : (
                      <Button
                        variant="danger"
                        disabled={isBusy || s.key === "line"}
                        onClick={() => runAction(s.key, "stop")}
                      >
                        ⏹ หยุด
                      </Button>
                    )}
                  </HStack>
                </CardContent>
              </Card>
            );
          })}

          <Card>
            <CardContent className="space-y-3 p-5">
              <VStack gap={1}>
                <h3 className="text-base font-semibold">External Access — URL สำหรับ LINE</h3>
                <p className="text-sm text-muted-foreground">
                  คัดลอกไปวางใน LINE Developers Console — LIFF Endpoint URL กับ Webhook URL (ต้องตั้งค่าที่ละรายการ)
                </p>
              </VStack>
              <LinkRow
                label="LIFF Endpoint URL (ใช้ Cloudflare Tunnel)"
                value={liffUrl}
                copied={copiedKey === "liff"}
                onCopy={() => copyText("liff", liffUrl)}
              />
              <LinkRow
                label="LINE Webhook URL"
                value={webhookUrl}
                copied={copiedKey === "webhook"}
                onCopy={() => copyText("webhook", webhookUrl)}
              />
              <LinkRow
                label="Cloudflare Tunnel URL"
                value={cfUrl}
                copied={copiedKey === "cf"}
                onCopy={() => copyText("cf", cfUrl)}
              />
              <LinkRow
                label="ngrok Tunnel URL (ทางสำรอง)"
                value={ngrokUrl}
                copied={copiedKey === "ngrok"}
                onCopy={() => copyText("ngrok", ngrokUrl)}
              />
              <p className="text-sm text-muted-foreground">
                Tunnel URL เปลี่ยนทุกครั้งที่รัน Cloudflare ใหม่ — หลังกด "รัน" ให้รีเฟรชหน้านี้เพื่อดึง URL ล่าสุดมาใส่ Console
              </p>
            </CardContent>
          </Card>

          <Card style={{ background: "var(--cmms-bg-subtle, #f8fafc)" }}>
            <CardContent className="space-y-2 p-4">
              <p className="text-sm font-medium">คำแนะนำการใช้งาน</p>
              <p className="text-sm text-muted-foreground">
                ลำดับการรันที่ถูกต้อง: ① MySQL → ② PHP API (IIS) → ③ Web App (Next.js) → ④ Cloudflare Tunnel (หรือ ngrok)
                <br />
                LINE Webhook จะพร้อมใช้ต่อเมื่อ tunnel + IIS รันพร้อมกัน — Cloudflare Tunnel เหมาะกับ LIFF เพราะไม่มีหน้าเตือน
              </p>
            </CardContent>
          </Card>
        </VStack>
      )}
      </VStack>
    </PageShell>
  );
}
