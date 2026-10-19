"use client";

import { useEffect, useState } from "react";
import ThemeProvider from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, LinkIcon, User, AlertCircle } from "lucide-react";
import SuccessDialog from "@/components/SuccessDialog";

declare global {
  interface Window {
    liff: any;
  }
}

const apiFetch = (url: string, init?: RequestInit) =>
  fetch(url, { ...init });

function LineAvatar({
  src,
  name,
  className = "",
}: {
  src?: string | null;
  name?: string;
  className?: string;
}) {
  const initial = (name || "U").charAt(0).toUpperCase();
  if (src) return <img src={src} alt={name || ""} className={`cmms-reg-avatar ${className}`} />;
  return <div className={`cmms-reg-avatar ${className}`}>{initial}</div>;
}

export default function RegisterPage() {
  return (
    <>
      <ThemeProvider />
      <RegisterContent />
    </>
  );
}

function RegisterContent() {
  useEffect(() => {
    const prev = document.title;
    document.title = "ลงทะเบียนผูกบัญชี LINE · CMMS-TOPPAN";
    return () => { document.title = prev; };
  }, []);

  const [lineUserId, setLineUserId] = useState("");
  const [lineName, setLineName] = useState("");
  const [linePic, setLinePic] = useState("");
  const [liffStatus, setLiffStatus] = useState<"loading" | "ready" | "external" | "error">("loading");
  const [boundUser, setBoundUser] = useState<{ full_name: string; employee_code: string; avatar_path?: string | null } | null>(null);

  const [empCode, setEmpCode] = useState("");
  const [previewUser, setPreviewUser] = useState<{ full_name: string; employee_code: string; avatar_path?: string | null; position?: string | null; department?: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let profile: { userId: string; displayName?: string; pictureUrl?: string } | null = null;

    // UID/ชื่อจาก LINE Login callback ( /register?uid=..&name=.. ) — ใช้ได้ทั้งในและนอก LINE
    const sp = new URLSearchParams(window.location.search);
    const uid = (sp.get("uid") || "").trim();
    const name = (sp.get("name") || "").trim();

    async function boot() {
      let liffId = "";
      try {
        const res = await fetch("/api/v1/line_register.php?liff_id=1");
        const json = await res.json().catch(() => ({}));
        // LIFF App ของหน้า /register (line_liff_register_id) ก่อน ถ้ายังไม่ได้ตั้ง → ใช้ตัวเดิม (frontend จะ fallback เป็น external)
        liffId = (json?.line_liff_register_id || json?.line_liff_id || "") as string;
      } catch { /* ignore */ }
      if (cancelled) return;

      // ลอง init LIFF (ปกติ open จากใน LINE โดยตรง จะ init ไม่ได้เพราะ endpoint ไม่ตรง → fallback)
      if (liffId) {
        try {
          if (!window.liff) {
            await new Promise<void>((resolve, reject) => {
              const s = document.createElement("script");
              s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
              s.onload = () => resolve();
              s.onerror = () => reject(new Error("LIFF SDK failed to load"));
              document.head.appendChild(s);
            });
          }
          await window.liff.init({ liffId });
          if (window.liff.isInClient?.()) {
            profile = await window.liff.getProfile();
          }
        } catch { /* non-LIFF endpoint → ใช้ uid จาก callback แทน */ }
      }
      if (cancelled) return;

      const pUid = profile?.userId || uid;
      if (profile?.displayName) setLineName(profile.displayName);
      else if (name) setLineName(name);
      if (profile?.pictureUrl) setLinePic(profile.pictureUrl);

      if (pUid) {
        setLineUserId(pUid);
        setLiffStatus(profile?.userId ? "ready" : "external");
        try {
          const res = await fetch(`/api/v1/line_register.php?line_user_id=${encodeURIComponent(pUid)}`);
          const json = await res.json().catch(() => ({}));
          if (!cancelled && json?.bound && json?.user) setBoundUser({
            full_name: json.user.full_name,
            employee_code: json.user.employee_code,
            avatar_path: json.user.avatar_path ?? null,
          });
        } catch { /* ignore */ }
      } else {
        setLiffStatus("external");
      }
    }

    boot();
    return () => { cancelled = true; };
  }, []);

  // Preview user by employee code (debounced) — public lookup รวมรูปเพื่อยืนยันว่าใช่คุณเอง
  useEffect(() => {
    const code = empCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(code)) { setPreviewUser(null); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/user_lookup.php?employee_code=${encodeURIComponent(code)}`);
        if (res.ok) {
          const json = await res.json();
          setPreviewUser({
            full_name: json.full_name,
            employee_code: json.employee_code,
            avatar_path: json.avatar_path ?? null,
            position: json.position ?? null,
            department: json.department ?? null,
          });
        } else {
          setPreviewUser(null);
        }
      } catch {
        setPreviewUser(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [empCode]);

  const handleBind = async () => {
    const code = empCode.trim().toUpperCase();
    if (!lineUserId || code === "") {
      setError("กรุณากรอกเลขพนักงานก่อน");
      return;
    }
    if (!/^[A-Z0-9]{3,10}$/.test(code)) {
      setError("รูปแบบรหัสพนักงานไม่ถูกต้อง (ตัวอย่าง: E01117 หรือ EMP005)");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/v1/line_register.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_user_id: lineUserId, employee_code: code }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.success && json.user) {
        setBoundUser({
          full_name: json.user.full_name,
          employee_code: json.user.employee_code,
          avatar_path: json.user.avatar_path ?? null,
        });
        setDone(true);
        try { localStorage.setItem("cmms_line_bound", "1"); } catch { /* ignore */ }
      } else {
        setError(json.error || "ลงทะเบียนไม่สำเร็จ ลองอีกครั้ง");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
    }
    setSubmitting(false);
  };

  const heroAvatar = boundUser
    ? { src: boundUser.avatar_path, name: boundUser.full_name }
    : linePic
      ? { src: linePic, name: lineName || "LINE" }
      : null;

  if (done && boundUser) {
    return (
      <main className="cmms-gate-page">
        <div className="cmms-gate-wrap cmms-reg-wrap">
          <SuccessDialog
            title="ผูกบัญชีสำเร็จ!"
            message={
              <>
                ลงทะเบียน LINE ID กับ{" "}
                <span style={{ fontWeight: "bold", color: "var(--cmms-primary)" }}>
                  {boundUser.full_name}
                </span>
              </>
            }
            primaryLabel="ไปแจ้งซ่อมเลย"
            secondaryLabel="แจ้งซ่อมอีกทีหลัง"
            stackButtons
            onPrimary={() => (window.location.href = "/repair/request")}
            onSecondary={() => { setDone(false); setEmpCode(""); }}
          >
            <div className="text-center mb-3">
              <LineAvatar
                src={boundUser.avatar_path}
                name={boundUser.full_name}
                className="cmms-reg-avatar-lg"
              />
            </div>
            <p className="text-sm text-[var(--cmms-text-secondary)] text-center">
              เลขพนักงาน {boundUser.employee_code} · ต่อไปแจ้งซ่อมจะรู้ชื่ออัตโนมัติ
              <br />
              และช่างจะได้รับแจ้งเตือนทาง LINE
              <br />
              <span className="text-[0.92em] opacity-85">
                ระบบส่งข้อความยืนยันผูกสำเร็จทาง LINE และแจ้งผู้ดูแลแล้ว
              </span>
            </p>
          </SuccessDialog>
        </div>
      </main>
    );
  }

  return (
    <main className="cmms-gate-page">
      <div className="cmms-gate-wrap cmms-reg-wrap">
        <section className="cmms-reg-hero">
          <div className="flex items-center gap-3">
            <div className="cmms-reg-mark">
              <LinkIcon className="w-6 h-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h1 className="cmms-reg-hero-title">ลงทะเบียนผูกบัญชี LINE</h1>
              <p className="cmms-reg-hero-sub">CMMS-TOPPAN · LINE REGISTRATION</p>
            </div>
            {heroAvatar ? (
              <LineAvatar src={heroAvatar.src} name={heroAvatar.name} />
            ) : (
              <div className="cmms-reg-avatar">
                <User className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
              </div>
            )}
          </div>
        </section>

        <Card>
          <CardContent className="p-5">
            <div className="flex flex-col gap-4">
              {liffStatus === "loading" && (
                <p className="text-sm text-[var(--cmms-text-secondary)]">กำลังโหลดข้อมูล LINE...</p>
              )}

              {liffStatus === "external" && (
                <div className={`cmms-reg-status${lineUserId ? " ok" : ""}`}>
                  {lineUserId
                    ? "LINE ID ของคุณพร้อมแล้ว — กรอกรหัสพนักงาน แล้วกดปุ่มผูกบัญชีด้านล่าง"
                    : "ยังไม่ได้ล็อกอินด้วย LINE — กดปุ่มด้านล่างเพื่อเริ่มผูกบัญชี (หรือเปิดลิงก์นี้จากแชท LINE เพื่อผูกอัตโนมัติ)"}
                </div>
              )}

              {boundUser ? (
                <div className="flex flex-col gap-4">
                  <div className="cmms-reg-tile ok">
                    <LineAvatar src={boundUser.avatar_path} name={boundUser.full_name} className="cmms-reg-avatar-md" />
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <div className="cmms-reg-check">✓</div>
                        <span className="cmms-reg-tile-title">บัญชีนี้ผูกกับ {boundUser.full_name} แล้ว</span>
                      </div>
                      <p className="cmms-reg-tile-sub">เลขพนักงาน {boundUser.employee_code} — ไปแจ้งซ่อมได้เลย</p>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => (window.location.href = "/repair/request")}
                  >
                    ไปแจ้งซ่อม
                  </Button>
                </div>
              ) : (
                <div className="cmms-register-box">
                  <div className="flex items-center gap-2">
                    <div className="cmms-reg-mark-soft">
                      <User className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
                    </div>
                    <p className="cmms-reg-tile-sub flex-1">
                      {lineName ? `สำหรับ ${lineName}` : "ต้องผูกกับผู้ใช้ที่แอดมินสร้างไว้ในระบบ"}
                    </p>
                  </div>

                  <div className="mt-3">
                    <Input
                      label="เลขพนักงาน"
                      placeholder="เช่น E01117"
                      maxLength={10}
                      value={empCode}
                      onChange={(e) => {
                        const upper = e.target.value.toUpperCase();
                        setEmpCode(upper.length > 10 ? upper.slice(0, 10) : upper);
                      }}
                    />
                  </div>

                  {previewUser && (
                    <div className="cmms-reg-tile ok mt-3" style={{ alignItems: "center" }}>
                      <LineAvatar src={previewUser.avatar_path} name={previewUser.full_name} className="cmms-reg-avatar-xl" />
                      <div className="flex flex-col">
                        <span className="cmms-reg-tile-title">ใช่คุณหรือไม่ — {previewUser.full_name}</span>
                        <span className="cmms-reg-tile-sub">
                          เลขพนักงาน {previewUser.employee_code}
                          {previewUser.position && ` · ตำแหน่ง ${previewUser.position}`}
                          {previewUser.department && ` · ${previewUser.department}`}
                        </span>
                        <span className="cmms-reg-tile-sub">
                          {previewUser.avatar_path
                            ? "ตรวจรูปให้ตรงกับตัวเองก่อนกดผูกบัญชี — ถ้าไม่ใช่คุณ อย่าผูก และแจ้งผู้ดูแลระบบ"
                            : "ยังไม่มีรูปในระบบ — ให้แอดมินอัปโหลดรูปพนักงาน (ชื่อไฟล์ = รหัสพนักงาน) เพื่อยืนยันตัวตน"}
                        </span>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="cmms-reg-status error mt-3" role="alert" aria-live="assertive">
                      <AlertCircle size={15} strokeWidth={1.75} aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 mt-3">
                    {liffStatus === "external" && !lineUserId ? (
                      <>
                        <Button
                          className="w-full"
                          onClick={() => (window.location.href = "/line_login.php")}
                        >
                          ล็อกอินด้วย LINE เพื่อผูกบัญชี
                        </Button>
                        <p className="text-sm text-[var(--cmms-text-secondary)] text-center">
                          ระบบจะพากลับมาที่หน้านี้พร้อม LINE ID ของคุณ — กรอกเลขพนักงานแล้วกดผูก
                        </p>
                      </>
                    ) : (
                      <>
                        <Button
                          className="w-full"
                          disabled={submitting || !lineUserId}
                          onClick={handleBind}
                        >
                          {submitting ? "กำลังตรวจสอบ..." : "ผูกบัญชีกับเลขพนักงานนี้"}
                        </Button>
                        <p className="text-sm text-[var(--cmms-text-secondary)] text-center">
                          ระบบตรวจสอบเลขพนักงานอัตโนมัติ
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="cmms-reg-note">
          <ShieldCheck className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
          <p>
            <b>ทำไมต้องผูก?</b> ผูกครั้งเดียวจบ — ระบบจะจำชื่อคุณได้ งานที่แจ้งจะมีชื่อผู้แจ้ง
            และช่าง/กลุ่ม LINE จะได้รับแจ้งเตือนพร้อมรูปและรายละเอียดทันที
          </p>
        </div>
      </div>
    </main>
  );
}
