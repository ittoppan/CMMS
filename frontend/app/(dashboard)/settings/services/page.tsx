"use client";

import { useState, useEffect, useCallback } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";

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
      <VStack gap={0.5} style={{ minWidth: 0, flex: 1 }}>
        <Text type="body" size="sm" weight="semibold">{label}</Text>
        <Text type="body" size="sm" color="secondary" style={{ wordBreak: "break-all" }}>
          {value || "—"}
        </Text>
      </VStack>
      <button
        type="button"
        disabled={!value}
        onClick={onCopy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
      </button>
    </HStack>
  );
}export default function SystemServicesPage() {
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
    <VStack gap={6}>
      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow">SERVICES · CMMS-TOPPAN</Text>
          <Heading level={1}>Service & การรันระบบ</Heading>
          <Text type="body" size="sm" color="secondary">
            เช็คว่า service ตัวไหนรันหรือยัง และรัน/หยุดได้จากที่นี่ (เฉพาะผู้ดูแลระบบ)
          </Text>
        </VStack>
        <HStack gap={2}>
          <span
            className="cmms-andon-chip"
            style={allRunning
              ? { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" }
              : { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }}
          >
            {allRunning ? "ทุก service รันปกติ" : "มี service ที่ยังไม่รัน"}
          </span>
          <button
            type="button"
            disabled={loading}
            onClick={() => fetchStatus()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "กำลังโหลด..." : "รีเฟรชสถานะ"}
          </button>
        </HStack>
      </HStack>

      {error && <Banner status="error" title="เกิดข้อผิดพลาด">{error}</Banner>}
      {notice && <Banner status="info" title="ผลลัพธ์">{notice}</Banner>}

      {loading && services.length === 0 ? (
        <HStack gap={2}><Spinner size="md" /><Text type="body">กำลังตรวจสอบ service...</Text></HStack>
      ) : (
        <VStack gap={4}>
          <Text type="supporting" color="secondary">
            อัปเดตล่าสุด: {lastRefresh || "-"} — การรันบางตัวใช้เวลา (Next.js ~10-20 วิ, ngrok ~5-10 วิ)
          </Text>

          {services.map((s) => {
            const isBusy = busyKey === s.key;
            return (
              <Card key={s.key} padding={5}>
                <HStack hAlign="between" vAlign="center" gap={4}>
                  <HStack gap={4} vAlign="center">
                    <Text size="xl" style={{ fontSize: 28 }}>{s.icon}</Text>
                    <VStack gap={1}>
                      <HStack gap={2} vAlign="center">
                        <Heading level={3} style={{ margin: 0 }}>{s.name}</Heading>
                        <span className="cmms-andon-chip" style={STATUS_CHIP_STYLE[s.status] || STATUS_CHIP_STYLE.unknown}>
                          {STATUS_LABEL[s.status] || s.status}
                        </span>
                        {isBusy && <Spinner size="sm" />}
                      </HStack>
                      <Text type="body" size="sm" color="secondary">{s.desc}</Text>
                      <Text type="body" size="sm">
                        {s.detail}
                        {s.url && s.status === "running" && (
                          <> • <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--cmms-primary)", fontWeight: 600 }}>เปิด URL</a></>
                        )}
                      </Text>
                    </VStack>
                  </HStack>
                  <HStack gap={2}>
                    {!s.running ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => runAction(s.key, "start")}
                        className="cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ▶ รัน
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy || s.key === "line"}
                        onClick={() => runAction(s.key, "stop")}
                        className="cmms-btn-danger disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ⏹ หยุด
                      </button>
                    )}
                  </HStack>
                </HStack>
              </Card>
            );
          })}

          <Card padding={5}>
            <VStack gap={3}>
              <VStack gap={1}>
                <Heading level={3}>External Access — URL สำหรับ LINE</Heading>
                <Text type="body" size="sm" color="secondary">
                  คัดลอกไปวางใน LINE Developers Console — LIFF Endpoint URL กับ Webhook URL (ต้องตั้งค่าที่ละรายการ)
                </Text>
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
              <Text type="body" size="sm" color="secondary">
                Tunnel URL เปลี่ยนทุกครั้งที่รัน Cloudflare ใหม่ — หลังกด "รัน" ให้รีเฟรชหน้านี้เพื่อดึง URL ล่าสุดมาใส่ Console
              </Text>
            </VStack>
          </Card>

          <Card padding={4} style={{ background: "var(--cmms-bg-subtle, #f8fafc)" }}>
            <VStack gap={2}>
              <Text type="body" size="sm" weight="semibold">คำแนะนำการใช้งาน</Text>
              <Text type="body" size="sm" color="secondary">
                ลำดับการรันที่ถูกต้อง: ① MySQL → ② PHP API (IIS) → ③ Web App (Next.js) → ④ Cloudflare Tunnel (หรือ ngrok)
                <br />
                LINE Webhook จะพร้อมใช้ต่อเมื่อ tunnel + IIS รันพร้อมกัน — Cloudflare Tunnel เหมาะกับ LIFF เพราะไม่มีหน้าเตือน
              </Text>
            </VStack>
          </Card>
        </VStack>
      )}
    </VStack>
  );
}
