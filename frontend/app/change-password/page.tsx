'use client';

import { useEffect, useState } from 'react';
import ThemeProvider from '@/components/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { Key, ShieldCheck, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function ChangePasswordPage() {
  return (
    <>
      <ThemeProvider />
      <ChangePasswordContent />
    </>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  error,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
  error?: string;
  invalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        label={label}
        type={show ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        error={error}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn('h-11 pr-11', invalid && '!border-[var(--cmms-danger)]')}
      />
      <button
        type="button"
        className="cmms-login-peek"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
        aria-pressed={show}
      >
        {show ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
      </button>
    </div>
  );
}

function ChangePasswordContent() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'เปลี่ยนรหัสผ่าน · CMMS-TOPPAN';
    return () => { document.title = prev; };
  }, []);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    if (!current || !next || !confirm) {
      setError('กรุณากรอกรหัสผ่านเดิม รหัสใหม่ และยืนยันรหัสใหม่ให้ครบ');
      return;
    }
    if (next.length < 6) {
      setError('รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (next !== confirm) {
      setError('รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/v1/profile.php', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: current,
          new_password: next,
          confirm_password: confirm,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
      window.location.href = '/';
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(/failed|network|fetch|system|unable/i.test(msg) ? 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง' : msg);
      setLoading(false);
    }
  };

  const mismatch = next !== confirm && confirm.length > 0;

  return (
    <main className="cmms-gate-page">
      <div className="cmms-gate-wrap">
        <div className="cmms-gate-brand">
          <div className="cmms-login-logo-icon">
            <Key size={20} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div>
            <div className="cmms-login-logo-text">CMMS-TOPPAN</div>
            <div className="cmms-login-logo-sub">Enterprise Maintenance</div>
          </div>
        </div>

        <form className="cmms-gate-card" onSubmit={handleSubmit} noValidate>
          <header className="flex flex-col gap-1.5">
            <p className="cmms-eyebrow">First Login · ครั้งแรก</p>
            <h1 className="cmms-gate-title">เปลี่ยนรหัสผ่านก่อนใช้งาน</h1>
            <p className="cmms-gate-lede">
              ระบบขอให้ตั้งรหัสผ่านใหม่ครั้งแรก เพราะบัญชีนี้ใช้รหัสเริ่มต้นจากผู้ดูแล —
              กรอกรหัสเดิม แล้วตั้งรหัสใหม่ส่วนตัว เสร็จแล้วใช้งานได้ทันที
            </p>
          </header>

          {error && (
            <div className="cmms-login-error" role="alert" aria-live="assertive">
              <AlertCircle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <PasswordField
              label="รหัสผ่านเดิม (รหัสเริ่มต้น)"
              value={current}
              onChange={setCurrent}
              placeholder="รหัสที่ผู้ดูแลตั้งให้"
              autoComplete="current-password"
            />
            <PasswordField
              label="รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)"
              value={next}
              onChange={setNext}
              placeholder="ตั้งรหัสใหม่ส่วนตัว"
              autoComplete="new-password"
            />
            <PasswordField
              label="ยืนยันรหัสผ่านใหม่"
              value={confirm}
              onChange={setConfirm}
              placeholder="พิมพ์รหัสใหม่อีกครั้ง"
              autoComplete="new-password"
              error={mismatch ? 'รหัสผ่านไม่ตรงกัน' : undefined}
              invalid={mismatch}
            />
          </div>

          <Button type="submit" className="w-full h-11" loading={loading} loadingText="กำลังบันทึก…">
            <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" /> ตั้งรหัสผ่านใหม่และเข้าใช้ระบบ
          </Button>
        </form>

        <p className="cmms-gate-note">
          <ShieldCheck size={15} strokeWidth={1.75} aria-hidden="true" />
          รหัสถูกเก็บแบบเข้ารหัส (bcrypt) — ไม่มีใครรวมถึงผู้ดูแลดูรหัสของคุณได้
        </p>
      </div>
    </main>
  );
}
