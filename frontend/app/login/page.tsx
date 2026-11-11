'use client';

import { useEffect, useState } from 'react';
import ThemeProvider from '../../components/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { Wrench, ChartBar, Clock, Box, Eye, EyeOff, AlertCircle, ShieldCheck } from 'lucide-react';

// LINE Login button — ไอคอนทางการจาก LINE Login button template
// (line-login-64.png = 32dp 2x, line-login-88.png = 44dp 2x) ห้ามใช้ SVG วาดเอง
// ข้อความไทยที่แนะนำตาม guideline: "ล็อกอินด้วย LINE"
function LineLoginIcon() {
  return (
    <img
      src="/icons/line-login-88.png"
      srcSet="/icons/line-login-64.png 1x, /icons/line-login-88.png 1.375x"
      alt=""
      aria-hidden="true"
      width={22}
      height={22}
      style={{ width: 22, height: 22, flexShrink: 0 }}
    />
  );
}

const FEATURES = [
  { icon: Clock, text: 'ติดตามงานซ่อมแบบ Real-time' },
  { icon: ChartBar, text: 'วิเคราะห์ข้อมูล MTBF/MTTR' },
  { icon: Box, text: 'บริหารคลังอะไหล่อัจฉริยะ' },
];

const STATUS = ['ระบบ', 'ฐานข้อมูล', 'LINE แจ้งเตือน'];

// แปลงข้อความ error จากฝั่ง PHP/query → ภาษาไทยที่เข้าใจได้
// (ห้ามโชว์ internal code หรือข้อความ System Error ดิบๆ ให้ผู้ใช้)
function friendlyAuthError(raw: string): string {
  const s = (raw || '').trim();
  const lower = s.toLowerCase();
  if (lower.includes('invalid_credentials')) return 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
  if (lower.includes('validation_error')) return 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
  if (lower.includes('cancelled')) return 'คุณยกเลิกการเข้าสู่ระบบด้วย LINE';
  if (lower.includes('profile') || lower.includes('line login')) {
    return 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ — กรุณาลองอีกครั้งหรือล็อกอินด้วยชื่อผู้ใช้';
  }
  if (/system error|failed|unable|expired|error/.test(lower)) {
    return 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง';
  }
  return s;
}

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
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [bindLine, setBindLine] = useState(false);
  const [nextPath, setNextPath] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setBindLine(params.get('bind_line') === '1');
    setNextPath(params.get('next') || '');
  }, []);

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get('error');
    if (e) {
      setLoginFailed(true);
      setErrorMessage(friendlyAuthError(e));
    }
  }, []);

  const clearError = () => {
    if (loginFailed) {
      setLoginFailed(false);
      setErrorMessage('');
    }
  };

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
        setErrorMessage(friendlyAuthError(data.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'));
      }
    } catch {
      setLoginFailed(true);
      setErrorMessage('ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoading) handleLogin();
  };

  return (
    <div className="cmms-login-container">
      {/* Mobile compact brand band */}
      <div className="cmms-login-band">
        <div className="cmms-login-brand">
          <div className="cmms-login-brand-mark"><Wrench size={22} strokeWidth={1.75} /></div>
          <div>
            <div className="cmms-login-brand-name">CMMS-TOPPAN</div>
            <div className="cmms-login-brand-sub">Enterprise Maintenance Suite</div>
          </div>
        </div>
        <div className="cmms-login-status">
          {STATUS.map((s) => (
            <span key={s} className="cmms-login-status-item">
              <span className="cmms-login-lamp" />{s}
            </span>
          ))}
        </div>
      </div>

      {/* Desktop brand hero */}
      <aside className="cmms-login-hero">
        <div className="cmms-login-hero-mark" aria-hidden="true"><span /><span /><span /></div>

        <div className="cmms-login-brand">
          <div className="cmms-login-brand-mark"><Wrench size={22} strokeWidth={1.75} /></div>
          <div>
            <div className="cmms-login-brand-name">CMMS-TOPPAN</div>
            <div className="cmms-login-brand-sub">Enterprise Maintenance Suite</div>
          </div>
        </div>

        <div className="cmms-login-hero-body">
          <div>
            <p className="cmms-login-hero-eyebrow">CMMS · Enterprise Maintenance</p>
            <h1>ระบบจัดการ<br />งานซ่อมบำรุง</h1>
          </div>
          <p className="cmms-login-hero-lede">
            CMMS-TOPPAN — Computerized Maintenance Management System สำหรับ TOPPAN Flexible Packaging (Thailand)
          </p>
          <ul className="cmms-login-features">
            {FEATURES.map((f) => (
              <li key={f.text} className="cmms-login-feature">
                <span className="cmms-login-feature-icon"><f.icon size={18} strokeWidth={1.75} /></span>
                <span className="cmms-login-feature-text">{f.text}</span>
              </li>
            ))}
          </ul>
          <div className="cmms-login-status">
            {STATUS.map((s) => (
              <span key={s} className="cmms-login-status-item">
                <span className="cmms-login-lamp" />{s}
              </span>
            ))}
          </div>
        </div>
      </aside>

      {/* Login form */}
      <main className="cmms-login-panel">
        <form className="cmms-login-form" onSubmit={onSubmit} noValidate>
          <h1 className="sr-only">เข้าสู่ระบบ CMMS-TOPPAN</h1>
          <div className="cmms-login-logo">
            <div className="cmms-login-logo-icon"><Wrench size={20} strokeWidth={1.75} /></div>
            <div>
              <div className="cmms-login-logo-text">CMMS-TOPPAN</div>
              <div className="cmms-login-logo-sub">Enterprise Maintenance</div>
            </div>
          </div>

          <header className="flex flex-col gap-1.5">
            <p className="cmms-eyebrow">Secure Sign-in</p>
            <h2 className="cmms-login-title">เข้าสู่ระบบ</h2>
            <p className="cmms-login-subtitle">กรอกชื่อผู้ใช้และรหัสผ่านเพื่อเข้าใช้งาน</p>
          </header>

          {loginFailed && errorMessage && (
            <div className="cmms-login-error" role="alert" aria-live="assertive">
              <AlertCircle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <Input
              label="ชื่อผู้ใช้"
              placeholder="เช่น E01117"
              value={username}
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={loginFailed || undefined}
              onChange={(e) => { setUsername(e.target.value); clearError(); }}
              className={cn('h-11', loginFailed && '!border-[var(--cmms-danger)]')}
            />

            <div className="relative">
              <Input
                label="รหัสผ่าน"
                type={showPassword ? 'text' : 'password'}
                value={password}
                autoComplete="current-password"
                aria-invalid={loginFailed || undefined}
                onChange={(e) => { setPassword(e.target.value); clearError(); }}
                onKeyUp={(e) => { if (typeof e.getModifierState === 'function') setCapsOn(e.getModifierState('CapsLock')); }}
                onBlur={() => setCapsOn(false)}
                className={cn('h-11 pr-11', loginFailed && '!border-[var(--cmms-danger)]')}
              />
              <button
                type="button"
                className="cmms-login-peek"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
              </button>
            </div>

            {capsOn && !showPassword && (
              <p className="cmms-login-caps"><AlertCircle size={13} strokeWidth={2} /> Caps Lock เปิดอยู่ — รหัสผ่านอาจพิมพ์ผิด</p>
            )}
          </div>

          <Button type="submit" className="w-full h-11" loading={isLoading} loadingText="กำลังเข้าสู่ระบบ…">
            <ShieldCheck size={18} strokeWidth={1.75} /> เข้าสู่ระบบ
          </Button>

          <div className="flex items-center gap-3">
            <span className="cmms-login-rule" />
            <span className="text-xs text-[var(--cmms-text-muted)]">หรือ</span>
            <span className="cmms-login-rule" />
          </div>

          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="secondary"
              className="w-full h-11 cmms-login-line"
              style={{ paddingLeft: 22, paddingRight: 22 }}
              onClick={() => { window.location.href = '/line_login.php'; }}
            >
              <LineLoginIcon />
              <span className="cmms-login-line-divider" aria-hidden="true" />
              <span>ล็อกอินด้วย LINE</span>
            </Button>
            {bindLine && (
              <p className="cmms-login-note">ล็อกอินสำเร็จแล้วระบบจะพาไปผูกบัญชี LINE เพื่อรับการแจ้งเตือนงาน</p>
            )}
            <p className="cmms-login-note">
              ครั้งแรก: ล็อกอินด้วยชื่อผู้ใช้/รหัสผ่านก่อน แล้วกด LINE อีกครั้งเพื่อผูกบัญชีให้อัตโนมัติ —
              ครั้งถัดไปล็อกอินผ่าน LINE ได้ทันที พร้อมรับการแจ้งเตือนงาน
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
