'use client';

import { useEffect, useState } from 'react';
import ThemeProvider from '../../components/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Wrench, ChartBar, Clock, Box } from 'lucide-react';

const LINE_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .348-.281.63-.63.63h-2.425v1.145h2.425c.349 0 .63.282.63.63 0 .348-.281.63-.63.63h-3.055c-.349 0-.63-.282-.63-.63V8.583c0-.349.281-.63.63-.63h3.055c.349 0 .63.281.63.63 0 .348-.281.63-.63.63h-2.425v1.145h2.425zm-6.046 3.666c0 .348-.281.63-.63.63-.349 0-.63-.282-.63-.63V8.583c0-.349.281-.63.63-.63.349 0 .63.281.63.63v4.946zm-2.52 0c0 .248-.146.47-.37.568-.084.036-.173.054-.26.054-.153 0-.305-.056-.425-.164l-2.404-2.857v2.4c0 .348-.281.63-.63.63-.349 0-.63-.282-.63-.63V8.583c0-.248.146-.47.37-.568.084-.035.173-.053.26-.053.153 0 .305.056.425.164l2.404 2.857v-2.4c0-.349.281-.63.63-.63.349 0 .63.281.63.63v4.946zm-7.618 0c0 .348-.281.63-.63.63H.63C.282 14.159 0 13.877 0 13.529V8.583c0-.349.282-.63.63-.63.348 0 .63.281.63.63v4.316h1.259c.348 0 .63.282.63.63z" />
  </svg>
);

const FEATURES = [
  { icon: Clock, text: 'ติดตามงานซ่อมแบบ Real-time' },
  { icon: ChartBar, text: 'วิเคราะห์ข้อมูล MTBF/MTTR' },
  { icon: Box, text: 'บริหารคลังอะไหล่อัจฉริยะ' },
];

export default function LoginPage() {
  return (
    <>
      <ThemeProvider />
      <LoginContent />
    </>
  );
}

function LoginContent() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginFailed, setLoginFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const bindLine =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('bind_line') === '1'
      : false;

  const nextPath =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('next') || ''
      : '';

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get('error');
    if (e) {
      setLoginFailed(true);
      setErrorMessage(e);
    }
  }, []);

  const handleLogin = async () => {
    if (!username || !password) {
      setLoginFailed(true);
      setErrorMessage('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      return;
    }
    setIsLoading(true);
    setLoginFailed(false);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.must_change_password) {
          window.location.href = '/change-password';
          return;
        }
        window.location.href = bindLine ? '/line_login.php' : nextPath ? nextPath : '/';
      } else {
        setLoginFailed(true);
        setErrorMessage(data.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      }
    } catch {
      setLoginFailed(true);
      setErrorMessage('ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] min-h-screen bg-[var(--color-background-body)]">
      {/* Left Hero Panel */}
      <div
        className="hidden lg:flex flex-col justify-end overflow-hidden"
        style={{
          position: 'relative',
          padding: 48,
          background: 'linear-gradient(135deg, var(--tp-navy-dark) 0%, var(--cmms-bg-sidebar) 55%, var(--cmms-primary) 100%)',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0, opacity: 0.32,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
        }} />
        <div style={{ position: 'absolute', top: 36, right: 36, width: 84, height: 84, zIndex: 0, opacity: 0.5 }}>
          <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(255,255,255,0.4)', borderRadius: 10 }} />
          <div style={{ position: 'absolute', top: 8, left: 8, width: 26, height: 26, border: '1px solid rgba(255,255,255,0.4)', borderRadius: 5 }} />
          <div style={{ position: 'absolute', top: 16, left: 16, width: 10, height: 10, background: 'rgba(255,255,255,0.75)', borderRadius: 2 }} />
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
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
                <f.icon style={{ width: 20, height: 20, color: 'rgba(255,255,255,0.8)' }} strokeWidth={1.75} />
                <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.85rem', fontWeight: 500 }}>
                  {f.text}
                </span>
              </div>
            ))}
          </div>

          <div style={{
            fontFamily: "'Barlow Condensed','Inter',sans-serif",
            fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase',
            fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', marginBottom: 14,
          }}>
            CMMS · Enterprise Maintenance
          </div>
          <h1 style={{ color: '#fff', fontSize: '2.2rem', fontWeight: 800, lineHeight: 1.3, margin: 0 }}>ระบบจัดการ<br />งานซ่อมบำรุง</h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: 440, margin: '12px 0 0' }}>
            CMMS-TOPPAN — Computerized Maintenance Management System สำหรับ TOPPAN Flexible Packaging (Thailand)
          </p>

          <div style={{ marginTop: 32, display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            {[
              { label: 'ระบบ', color: 'var(--cmms-success)' },
              { label: 'ฐานข้อมูล', color: 'var(--cmms-success)' },
              { label: 'LINE แจ้งเตือน', color: 'var(--cmms-success)' },
            ].map((s) => (
              <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'rgba(255,255,255,0.72)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.02em' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, boxShadow: '0 0 8px rgba(16,185,129,0.7)' }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right Login Form */}
      <div
        className="flex flex-col justify-center"
        style={{ padding: '48px 56px', maxWidth: 480, margin: '0 auto', width: '100%' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
          <img src="/logo.png" alt="TOPPAN" style={{ height: 36, objectFit: 'contain' }} />
          <span style={{ fontSize: '1.1rem', letterSpacing: '-0.02em', fontWeight: 'bold', color: 'var(--cmms-text-primary)' }}>
            CMMS-TOPPAN
          </span>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--cmms-text-primary)' }}>
              เข้าสู่ระบบ
            </h2>
            <p style={{ color: 'var(--cmms-text-secondary)', margin: 0, fontSize: '0.875rem' }}>
              กรอกชื่อผู้ใช้และรหัสผ่านเพื่อเข้าใช้งาน
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Input
              label="ชื่อผู้ใช้"
              placeholder="กรอกชื่อผู้ใช้"
              value={username}
              error={loginFailed ? errorMessage : undefined}
              onChange={(e) => {
                setUsername(e.target.value);
                setLoginFailed(false);
              }}
              className="h-11"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLogin();
              }}
            />
            <Input
              label="รหัสผ่าน"
              placeholder="กรอกรหัสผ่าน"
              type="password"
              value={password}
              error={loginFailed ? errorMessage : undefined}
              onChange={(e) => {
                setPassword(e.target.value);
                setLoginFailed(false);
              }}
              className="h-11"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLogin();
              }}
            />
          </div>

          <Button
            className="w-full h-11"
            disabled={isLoading}
            onClick={handleLogin}
          >
            {isLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </Button>

          <div className="flex items-center gap-2 my-1">
            <div className="flex-1 h-px bg-[var(--cmms-border)]" />
            <span className="text-xs text-[var(--cmms-text-muted)]">หรือ</span>
            <div className="flex-1 h-px bg-[var(--cmms-border)]" />
          </div>

          <Button
            variant="secondary"
            className="w-full h-11"
            onClick={() => { window.location.href = '/line_login.php'; }}
            style={{ backgroundColor: 'var(--cmms-line-green)', color: '#fff', border: 'none' }}
          >
            {LINE_SVG} เข้าสู่ระบบด้วย LINE
          </Button>
          <p style={{ textAlign: 'center', color: 'var(--cmms-text-secondary)', fontSize: '0.75rem', margin: 0 }}>
            ครั้งแรก: ล็อกอินด้วยชื่อผู้ใช้/รหัสผ่านด้านบนก่อน แล้วกดปุ่ม LINE อีกครั้ง
            ระบบจะผูกบัญชีให้อัตโนมัติ — ครั้งต่อไปล็อกอินผ่าน LINE ได้ทันที (รับการแจ้งเตือน LINE)
          </p>
        </div>
      </div>
    </div>
  );
}