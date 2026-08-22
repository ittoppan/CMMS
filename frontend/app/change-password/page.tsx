'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Key, ShieldCheck, ArrowRight } from 'lucide-react';

export default function ChangePasswordPage() {
  useEffect(() => {
    const t = setTimeout(() => { document.title = 'เปลี่ยนรหัสผ่าน · CMMS-TOPPAN'; }, 350);
    return () => clearTimeout(t);
  }, []);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
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
      setError('รหัสผ่านใหม่ไม่ตรงกับการยืนยัน');
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
    } catch (e: any) {
      setError(e.message || 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง');
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        position: 'relative',
        background: 'linear-gradient(135deg, var(--tp-navy-dark, #0B1B3A) 0%, var(--cmms-bg-sidebar, #0F1E3D) 55%, var(--cmms-primary) 100%)',
      }}
    >
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 0, opacity: 0.2,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
        }}
      />

      <div
        style={{
          position: 'relative', zIndex: 1, width: '100%', maxWidth: 460,
          background: '#fff', borderRadius: 18, padding: '36px 32px',
          boxShadow: '0 24px 60px rgba(2, 10, 30, 0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div
            style={{
              width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--cmms-primary-light, #E3F0FA)', color: 'var(--cmms-primary)',
            }}
          >
            <Key style={{ width: 24, height: 24 }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cmms-primary)' }}>
              First Login · ครั้งแรก
            </div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--cmms-text-primary, #0F172A)', fontFamily: "'Barlow', sans-serif" }}>
              เปลี่ยนรหัสผ่านก่อนใช้งาน
            </h1>
          </div>
        </div>

        <p style={{ margin: '10px 0 22px', fontSize: 13.5, lineHeight: 1.6, color: 'var(--cmms-text-secondary, #475569)' }}>
          ระบบขอให้คุณตั้งรหัสผ่านใหม่ เพราะบัญชีนี้ใช้รหัสเริ่มต้นจากผู้ดูแล
          กรอกรหัสเดิม (รหัสเริ่มต้น) แล้วตั้งรหัสใหม่ส่วนตัว — เสร็จแล้วใช้งานได้ทันที
        </p>

        <div className="flex flex-col gap-4">
          <Input
            label="รหัสผ่านเดิม (รหัสเริ่มต้น)"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="รหัสที่ผู้ดูแลตั้งให้"
            autoComplete="current-password"
          />

          <Input
            label="รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="ตั้งรหัสใหม่ส่วนตัว"
            autoComplete="new-password"
          />

          <Input
            label="ยืนยันรหัสผ่านใหม่"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="พิมพ์รหัสใหม่อีกครั้ง"
            autoComplete="new-password"
            error={next !== confirm && confirm.length > 0 ? 'รหัสผ่านไม่ตรงกัน' : undefined}
          />
        </div>

        {error && (
          <div
            style={{
              marginTop: 14, padding: '10px 14px', borderRadius: 10, fontSize: 13,
              background: 'var(--cmms-danger-light, #FEE2E2)', color: 'var(--cmms-danger, #DC2626)',
              border: '1px solid rgba(220,38,38,0.25)',
            }}
          >
            {error}
          </div>
        )}

        <Button
          className="w-full"
          disabled={loading}
          onClick={handleSubmit}
        >
          {loading ? 'กำลังบันทึก...' : (
            <>
              ตั้งรหัสผ่านใหม่และเข้าใช้ระบบ
              <ArrowRight style={{ width: 18, height: 18 }} />
            </>
          )}
        </Button>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--cmms-text-muted, #64748B)' }}>
          <ShieldCheck style={{ width: 16, height: 16, color: 'var(--cmms-success, #16A34A)' }} />
          รหัสถูกเก็บแบบเข้ารหัส (bcrypt) — ไม่มีใครรวมถึงผู้ดูแลดูรหัสของคุณได้
        </div>
      </div>
    </div>
  );
}