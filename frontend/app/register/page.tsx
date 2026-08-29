"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, ArrowRight, LinkIcon, User } from "lucide-react";
import SuccessDialog from "@/components/SuccessDialog";

declare global {
  interface Window {
    liff: any;
  }
}

const apiFetch = (url: string, init?: RequestInit) =>
  fetch(url, { ...init });

export default function RegisterPage() {
  useEffect(() => {
    const t = setTimeout(() => {
      document.title = "ลงทะเบียนผูกบัญชี LINE · CMMS-TOPPAN";
    }, 350);
    return () => clearTimeout(t);
  }, []);

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
        liffId = (json?.line_liff_id || "") as string;
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
          if (!cancelled && json?.bound && json?.user) setBoundUser(json.user);
        } catch { /* ignore */ }
      } else {
        setLiffStatus("external");
      }
    }

    boot();
    return () => { cancelled = true; };
  }, []);

  const [lineUserId, setLineUserId] = useState("");
  const [lineName, setLineName] = useState("");
  const [linePic, setLinePic] = useState("");
  const [liffStatus, setLiffStatus] = useState<"loading" | "ready" | "external" | "error">("loading");
  const [boundUser, setBoundUser] = useState<{ full_name: string; employee_code: string } | null>(null);

  const [empCode, setEmpCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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
        setBoundUser(json.user);
        setDone(true);
        try { localStorage.setItem("cmms_line_bound", "1"); } catch { /* ignore */ }
      } else {
        setError(json.error || "ลงทะเบียนไม่สำเร็จ ลองอีกครั้ง");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    }
    setSubmitting(false);
  };

  if (done && boundUser) {
    return (
      <main
        className="min-h-screen"
        style={{
          background: "var(--cmms-bg-muted)",
          padding: "20px 16px 0",
        }}
      >
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
          <p className="text-sm text-[var(--cmms-text-secondary)]" style={{ textAlign: "center" }}>
            เลขพนักงาน {boundUser.employee_code} · ต่อไปแจ้งซ่อมจะรู้ชื่ออัตโนมัติ
            <br />
            และช่างจะได้รับแจ้งเตือนทาง LINE
            <br />
            <span style={{ fontSize: "0.92em", opacity: 0.85 }}>
              ระบบส่งข้อความยืนยันผูกสำเร็จทาง LINE และแจ้งผู้ดูแลแล้ว
            </span>
          </p>
        </SuccessDialog>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen"
      style={{
        background: "var(--cmms-bg-muted)",
        padding: "20px 16px 0",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 100 }}>
        <div style={{ padding: "4px 0 16px" }}>
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                flexShrink: 0,
                background: "var(--cmms-danger-light)",
                border: "1px solid var(--cmms-danger-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.5rem",
              }}
            >
              <LinkIcon className="w-6 h-6" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>ลงทะเบียนผูกบัญชี LINE</h3>
              <p className="text-sm text-[var(--cmms-text-secondary)]">CMMS-TOPPAN · LINE REGISTRATION</p>
            </div>
            {linePic ? (
              <img
                src={linePic}
                alt="LINE profile"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "2px solid #fff",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "var(--cmms-primary)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <User className="w-5 h-5" />
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: 16 }}>
          <Card style={{ borderRadius: 16, boxShadow: "0 1px 3px rgba(15,23,42,0.06)", border: "1px solid rgba(255,255,255,0.6)" }}>
            <CardContent className="p-5">
              <div className="flex flex-col gap-4">
                {liffStatus === "loading" && (
                  <p className="text-sm text-[var(--cmms-text-secondary)]">กำลังโหลดข้อมูล LINE...</p>
                )}

                {liffStatus === "external" && (
                  <div
                    style={{
                      margin: "10px 0 0",
                      padding: "10px 14px",
                      borderRadius: "var(--cmms-radius)",
                      background: lineUserId ? "var(--cmms-success-light)" : "var(--cmms-info-light)",
                      border: `1px solid ${lineUserId ? "var(--cmms-success)" : "var(--cmms-primary-light)"}`,
                      color: lineUserId ? "var(--cmms-success)" : "var(--cmms-primary)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      lineHeight: 1.5,
                    }}
                  >
                    {lineUserId
                      ? "LINE ID ของคุณพร้อมแล้ว — กรอกรหัสพนักงาน แล้วกดปุ่มผูกบัญชีด้านล่าง"
                      : "ยังไม่ได้ล็อกอินด้วย LINE — กดปุ่มด้านล่างเพื่อเริ่มผูกบัญชี (หรือเปิดลิงก์นี้จากแชท LINE เพื่อผูกอัตโนมัติ)"}
                  </div>
                )}

                {boundUser ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          background: "var(--cmms-success)",
                          border: "2px solid var(--cmms-success)",
                          color: "#fff",
                        }}
                      >
                        ✓
                      </div>
                      <span className="text-sm font-semibold" style={{ color: "var(--cmms-success)" }}>
                        บัญชีนี้ผูกกับ {boundUser.full_name} แล้ว
                      </span>
                    </div>
                    <p className="text-sm text-[var(--cmms-text-secondary)]">
                      LINE ID นี้ผูกกับเลขพนักงาน {boundUser.employee_code} อยู่แล้ว — ไปแจ้งซ่อมได้เลย
                    </p>
                    <Button
                      className="w-full"
                      onClick={() => (window.location.href = "/repair/request")}
                    >
                      ไปแจ้งซ่อม
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div
                      style={{
                        background: "var(--cmms-bg-muted)",
                        border: "1px dashed var(--cmms-border)",
                        borderRadius: "var(--cmms-radius)",
                        padding: 14,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 14,
                            flexShrink: 0,
                            background: "var(--cmms-danger-light)",
                            border: "1px solid var(--cmms-danger-light)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 20,
                          }}
                        >
                          <User className="w-5 h-5" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <p className="font-semibold text-sm">เลขพนักงาน (Employee Code)</p>
                          <p className="text-sm text-[var(--cmms-text-secondary)]">
                            {lineName ? `สำหรับ ${lineName}` : "ต้องผูกกับผู้ใช้ที่แอดมินสร้างไว้ในระบบ"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3">
                        <Input
                          placeholder="เช่น E01117"
                          value={empCode}
                          onChange={(e) => {
                            const upper = e.target.value.toUpperCase();
                            setEmpCode(upper.length > 6 ? upper.slice(0, 6) : upper);
                          }}
                        />
                      </div>

                      {error && (
                        <div
                          style={{
                            margin: "10px 0 0",
                            padding: "10px 14px",
                            borderRadius: "var(--cmms-radius)",
                            background: "var(--cmms-danger-light)",
                            border: "1px solid var(--cmms-danger-light)",
                            color: "var(--cmms-danger)",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            lineHeight: 1.5,
                          }}
                        >
                          {error}
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
                            <p className="text-sm text-[var(--cmms-text-secondary)]" style={{ textAlign: "center" }}>
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
                            <p className="text-sm text-[var(--cmms-text-secondary)]" style={{ textAlign: "center" }}>
                              ตรวจเลขพนักงานกับฐานข้อมูลระบบหลังบ้านอัตโนมัติ
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card
            className="mt-3"
            style={{
              borderRadius: 16,
              boxShadow: "0 8px 24px -8px rgba(15,23,42,0.12)",
              border: "1px solid rgba(255,255,255,0.6)",
            }}
          >
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5" style={{ color: "var(--cmms-success)", flexShrink: 0 }} />
                <p className="text-sm text-[var(--cmms-text-secondary)]">
                  <b>ทำไมต้องผูก?</b> ผูกครั้งเดียวจบ — ระบบจะจำชื่อคุณได้ งานที่แจ้งจะมีชื่อผู้แจ้ง
                  และช่าง/กลุ่ม LINE จะได้รับแจ้งเตือนพร้อมรูปและรายละเอียดทันที
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
