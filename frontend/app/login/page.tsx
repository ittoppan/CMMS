'use client';

import { useEffect, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import {
  WrenchScrewdriverIcon,
  ChartBarIcon,
  ClockIcon,
  CubeIcon,
} from '@heroicons/react/24/outline';

const LINE_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .348-.281.63-.63.63h-2.425v1.145h2.425c.349 0 .63.282.63.63 0 .348-.281.63-.63.63h-3.055c-.349 0-.63-.282-.63-.63V8.583c0-.349.281-.63.63-.63h3.055c.349 0 .63.281.63.63 0 .348-.281.63-.63.63h-2.425v1.145h2.425zm-6.046 3.666c0 .348-.281.63-.63.63-.349 0-.63-.282-.63-.63V8.583c0-.349.281-.63.63-.63.349 0 .63.281.63.63v4.946zm-2.52 0c0 .248-.146.47-.37.568-.084.036-.173.054-.26.054-.153 0-.305-.056-.425-.164l-2.404-2.857v2.4c0 .348-.281.63-.63.63-.349 0-.63-.282-.63-.63V8.583c0-.248.146-.47.37-.568.084-.035.173-.053.26-.053.153 0 .305.056.425.164l2.404 2.857v-2.4c0-.349.281-.63.63-.63.349 0 .63.281.63.63v4.946zm-7.618 0c0 .348-.281.63-.63.63H.63C.282 14.159 0 13.877 0 13.529V8.583c0-.349.282-.63.63-.63.348 0 .63.281.63.63v4.316h1.259c.348 0 .63.282.63.63z" />
  </svg>
);

const FEATURES = [
  { icon: ClockIcon, text: "ติดตามงานซ่อมแบบ Real-time" },
  { icon: ChartBarIcon, text: "วิเคราะห์ข้อมูล MTBF/MTTR" },
  { icon: CubeIcon, text: "บริหารคลังอะไหล่อัจฉริยะ" },
];

const DEMO_ACCOUNTS = [
  { user: "admin", label: "Admin", icon: "👤" },
  { user: "manager", label: "Manager", icon: "👔" },
  { user: "tech01", label: "Tech01", icon: "🔧" },
];

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginFailed, setLoginFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // ถ้ามาจากการกด LINE Login แล้วยังไม่ผูกบัญชี (bind_line=1) → หลัง login สำเร็จ จะพาไปผูก LINE อัตโนมัติ
  const bindLine =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("bind_line") === "1"
      : false;

  // กลับไปหน้าปลายทางหลังล็อกอิน (เช่น /repair/request เมื่อเข้าเว็บแล้วเลือก User/Password)
  const nextPath =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("next") || ""
      : "";

  // แสดง error ที่ LINE callback ส่งกลับมา (เช่น LINE Login 400 / ไม่ผูกบัญชี)
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("error");
    if (e) {
      setLoginFailed(true);
      setErrorMessage(e);
    }
  }, []);

  const handleLogin = async () => {
    if (!username || !password) {
      setLoginFailed(true);
      setErrorMessage("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
      return;
    }
    setIsLoading(true);
    setLoginFailed(false);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = bindLine ? "/line_login.php" : nextPath ? nextPath : "/";
      } else {
        setLoginFailed(true);
        setErrorMessage(data.error || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      }
    } catch {
      setLoginFailed(true);
      setErrorMessage("ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemo = (user: string) => {
    setUsername(user);
    setPassword("password");
    setLoginFailed(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] min-h-screen bg-[var(--color-background-body)]">
      {/* Left Hero Panel */}
      <div
        className="hidden lg:flex flex-col justify-end overflow-hidden"
        style={{
          position: "relative",
          padding: 48,
          background: "linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #1E40AF 100%)",
        }}
      >
        {/* Floating shapes */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 0 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                borderRadius: "50%",
                opacity: 0.08,
                background: "#fff",
                width: [320, 480, 220][i],
                height: [320, 480, 220][i],
                top: ["-60px", "40%", "65%"][i],
                right: ["-80px", "-120px", "10%"][i],
              }}
            />
          ))}
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Feature badges */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 40 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px', borderRadius: 12,
                background: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.1)',
                width: 'fit-content',
              }}>
                <f.icon style={{ width: 20, height: 20, color: 'rgba(255,255,255,0.8)' }} />
                <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.85rem', fontWeight: 500 }}>
                  {f.text}
                </span>
              </div>
            ))}
          </div>

          <h1 style={{ color: '#fff', fontSize: '2.2rem', fontWeight: 800, lineHeight: 1.3, margin: 0 }}>ระบบจัดการ<br />งานซ่อมบำรุง</h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: 440, margin: '12px 0 0' }}>
            CMMS-TOPPAN — Computerized Maintenance Management System สำหรับ TOPPAN Flexible Packaging (Thailand)
          </p>
        </div>
      </div>

      {/* Right Login Form */}
      <div
        className="flex flex-col justify-center"
        style={{ padding: "48px 56px", maxWidth: 480, margin: "0 auto", width: "100%" }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
          <img src="/logo.png" alt="TOPPAN" style={{ height: 36, objectFit: 'contain' }} />
          <Text type="body" weight="bold" as="span" style={{ fontSize: '1.1rem', letterSpacing: '-0.02em' }}>
            CMMS-TOPPAN
          </Text>
        </div>

        <VStack gap={5} hAlign="stretch">
          <VStack gap={1}>
            <Text type="display-1" as="h2" style={{ fontSize: '1.5rem' }}>
              เข้าสู่ระบบ
            </Text>
            <Text type="body" color="secondary">
              กรอกชื่อผู้ใช้และรหัสผ่านเพื่อเข้าใช้งาน
            </Text>
          </VStack>

          <VStack gap={3}>
            <TextInput
              label="ชื่อผู้ใช้ (Username)"
              placeholder="กรอกชื่อผู้ใช้"
              value={username}
              onChange={(v: string) => {
                setUsername(v);
                setLoginFailed(false);
              }}
              size="lg"
              status={
                loginFailed
                  ? { type: "error", message: errorMessage }
                  : undefined
              }
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter') handleLogin();
              }}
            />
            <TextInput
              label="รหัสผ่าน (Password)"
              placeholder="กรอกรหัสผ่าน"
              type="password"
              value={password}
              onChange={(v: string) => {
                setPassword(v);
                setLoginFailed(false);
              }}
              size="lg"
              status={
                loginFailed
                  ? { type: "error", message: errorMessage }
                  : undefined
              }
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter') handleLogin();
              }}
            />
          </VStack>

          <Button
            label="เข้าสู่ระบบ"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            onClick={handleLogin}
          />

          <Divider label="หรือ" />

          <Button
            label="เข้าสู่ระบบด้วย LINE"
            variant="secondary"
            size="lg"
            icon={LINE_SVG}
            onClick={() => { window.location.href = "/line_login.php"; }}
            style={{
              backgroundColor: "#06C755",
              color: "#fff",
              border: "none",
            }}
          />
          <Text type="body" size="sm" color="secondary" style={{ textAlign: "center" }}>
            💡 ครั้งแรก: ล็อกอินด้วยชื่อผู้ใช้/รหัสผ่านด้านบนก่อน แล้วกดปุ่ม LINE อีกครั้ง
            ระบบจะผูกบัญชีให้อัตโนมัติ — ครั้งต่อไปล็อกอินผ่าน LINE ได้ทันที (รับการแจ้งเตือน LINE)
          </Text>

          {/* Demo accounts */}
          <div style={{
            padding: 16, borderRadius: 12,
            background: 'var(--cmms-bg-muted)',
            border: '1px solid var(--cmms-border)',
          }}>
            <Text type="supporting" color="secondary" style={{ marginBottom: 8, display: 'block' }}>
              บัญชีทดสอบ (รหัสผ่าน: password):
            </Text>
            <HStack gap={2} wrap="wrap">
              {DEMO_ACCOUNTS.map((acc) => (
                <Button
                  key={acc.user}
                  label={`${acc.icon} ${acc.label}`}
                  variant="secondary"
                  size="sm"
                  onClick={() => fillDemo(acc.user)}
                />
              ))}
            </HStack>
          </div>
        </VStack>
      </div>
    </div>
  );
}
