"use client";

import { useEffect, useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  UserIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";

declare global {
  interface Window {
    liff: any;
  }
}

/**
 * หน้าลงทะเบียนผูกบัญชี LINE กับเลขพนักงาน (เปิดจาก LIFF ใน LINE)
 * - พนักงานเปิดฟอร์มแจ้งซ่อมครั้งแรก → เห็นแบนเนอร์ "ผูกบัญชี"
 * - กรอกเลขพนักงาน → ระบบเช็คกับ users.employee_code → ตรงกัน = ผูกสำเร็จ
 * - ครั้งต่อไปฟอร์มจะรู้ชื่ออัตโนมัติ + แจ้งเตือน LINE ไปถึงตัว
 */

const apiFetch = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, headers: { "ngrok-skip-browser-warning": "1", ...(init?.headers || {}) } });

export default function RegisterPage() {
  const [lineUserId, setLineUserId] = useState("");
  const [lineName, setLineName] = useState("");
  const [linePic, setLinePic] = useState("");
  const [liffStatus, setLiffStatus] = useState<"loading" | "ready" | "external" | "error">("loading");
  const [boundUser, setBoundUser] = useState<{ full_name: string; employee_code: string } | null>(null);

  const [empCode, setEmpCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  /* ---- 1. init LIFF + โหลดสถานะผูกปัจจุบัน ---- */
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // endpoint สาธารณะ (ไม่ต้อง login) — line_notify.php ตอบ 401 เมื่อไม่มี session
        const res = await apiFetch("/api/v1/line_register.php?liff_id=1");
        const json = await res.json().catch(() => ({}));
        const liffId = json?.line_liff_id || "";

        const q = new URLSearchParams(window.location.search);
        const uid = q.get("uid");

        // ไม่มี LIFF id (ยังไม่ตั้งค่า) → ใช้ flow นอก LINE เท่านั้น
        if (!liffId) {
          if (cancelled) return;
          if (uid) {
            setLineUserId(uid);
            if (q.get("name")) setLineName(q.get("name"));
            setLiffStatus("ready");
            const r = await apiFetch(`/api/v1/line_register.php?line_user_id=${encodeURIComponent(uid)}`);
            const j = await r.json().catch(() => ({}));
            if (!cancelled && j?.bound && j?.user) setBoundUser(j.user);
          } else {
            setLiffStatus("external");
          }
          return;
        }

        if (!window.liff) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("LIFF SDK failed"));
            document.head.appendChild(s);
          });
        }
        await window.liff.init({ liffId });
        if (cancelled) return;

        if (window.liff.isInClient?.()) {
          const profile = await window.liff.getProfile();
          if (cancelled) return;
          setLineUserId(profile.userId || "");
          setLineName(profile.displayName || "");
          setLinePic(profile.pictureUrl || "");
          setLiffStatus("ready");

          // เช็คสถานะผูกแล้วหรือยัง
          if (profile.userId) {
            const r = await apiFetch(`/api/v1/line_register.php?line_user_id=${encodeURIComponent(profile.userId)}`);
            const j = await r.json().catch(() => ({}));
            if (!cancelled && j?.bound && j?.user) setBoundUser(j.user);
          }
        } else {
          setLiffStatus("external");
          // นอก LINE: ยังให้กรอกได้ ถ้ามี line_user_id ผ่าน URL (?uid=)
          // (flow: /line_login.php → callback → redirect กลับมาพร้อม ?uid=&name=)
          if (uid) {
            setLineUserId(uid);
            if (q.get("name")) setLineName(q.get("name"));
            setLiffStatus("ready");
            const r = await apiFetch(`/api/v1/line_register.php?line_user_id=${encodeURIComponent(uid)}`);
            const j = await r.json().catch(() => ({}));
            if (!cancelled && j?.bound && j?.user) setBoundUser(j.user);
          }
        }
      } catch (e) {
        console.warn("LIFF init:", e);
        if (!cancelled) setLiffStatus("error");
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  /* ---- 2. ผูกบัญชี ---- */
  const   handleBind = async () => {
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

  /* ---- 3. UI ---- */
  if (done && boundUser) {
    return (
      <main
        className="min-h-screen"
        style={{
          background:
            "radial-gradient(1200px 400px at 50% -100px, rgba(37,99,235,0.08), transparent 60%), linear-gradient(160deg, #f8fafc 0%, #eef2f7 100%)",
          padding: "20px 16px 0",
        }}
      >
        <SuccessDialog
          title="ผูกบัญชีสำเร็จ!"
          message={<>ลงทะเบียน LINE ID กับ<Text type="body" color="primary" weight="bold" as="span">{boundUser.full_name}</Text></>}
          primaryLabel="ไปแจ้งซ่อมเลย"
          secondaryLabel="แจ้งซ่อมอีกทีหลัง"
          stackButtons
          onPrimary={() => (window.location.href = "/repair/request")}
          onSecondary={() => { setDone(false); setEmpCode(""); }}
        >
          <Text type="body" size="sm" color="secondary" style={{ textAlign: "center" }}>
            เลขพนักงาน {boundUser.employee_code} · ต่อไปแจ้งซ่อมจะรู้ชื่ออัตโนมัติ
            {"\n"}และช่างจะได้รับแจ้งเตือนทาง LINE 📲
          </Text>
        </SuccessDialog>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen"
      style={{
        background:
          "radial-gradient(1200px 400px at 50% -100px, rgba(37,99,235,0.08), transparent 60%), linear-gradient(160deg, #f8fafc 0%, #eef2f7 100%)",
        padding: "20px 16px 0",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 100 }}>
        <div style={{ padding: "4px 0 16px" }}>
          <HStack gap={3} vAlign="center">
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                flexShrink: 0,
                background: "linear-gradient(135deg, #FEF2F2, #FEE2E2)",
                border: "1px solid #FECACA",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.5rem",
              }}
            >
              🔗
            </div>
            <VStack gap={0} style={{ flex: 1 }}>
              <Heading level={3} style={{ margin: 0 }}>ลงทะเบียนผูกบัญชี LINE</Heading>
              <Text type="body" size="sm" color="secondary">CMMS-TPT · LINE REGISTRATION</Text>
            </VStack>
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
                  background: "var(--cmms-gradient-primary)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <UserIcon style={{ width: 18, height: 18 }} />
              </div>
            )}
          </HStack>
        </div>

        <div style={{ padding: 16 }}>
          <Card padding={5} style={{ borderRadius: 16, boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
            <VStack gap={4}>
              {liffStatus === "loading" && (
                <Text type="body" size="sm" color="secondary">กำลังโหลดข้อมูล LINE...</Text>
              )}

              {liffStatus === "external" && (
                <div style={{
                  margin: "10px 0 0", padding: "10px 14px", borderRadius: "var(--cmms-radius)",
                  background: "#eff6ff", border: "1px solid #93c5fd", color: "#1e40af",
                  fontSize: "0.8rem", fontWeight: 600, lineHeight: 1.5,
                }}>
                  ยังไม่ได้ล็อกอินด้วย LINE — กดปุ่มด้านล่างเพื่อเริ่มผูกบัญชี
                  (หรือเปิดลิงก์นี้จากแชท LINE เพื่อผูกอัตโนมัติ)
                </div>
              )}

              {boundUser ? (
                <VStack gap={2}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 0 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 700, fontSize: "0.85rem",
                      background: "var(--cmms-success)", border: "2px solid var(--cmms-success)", color: "#fff",
                    }}>✓</div>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--cmms-success)" }}>
                      บัญชีนี้ผูกกับ {boundUser.full_name} แล้ว
                    </span>
                  </div>
                  <Text type="body" size="sm" color="secondary">
                    LINE ID นี้ผูกกับเลขพนักงาน {boundUser.employee_code} อยู่แล้ว — ไปแจ้งซ่อมได้เลย
                  </Text>
                  <Button label="ไปแจ้งซ่อม" variant="primary" width="100%" onClick={() => (window.location.href = "/repair/request")} />
                </VStack>
              ) : (
                <VStack gap={4}>
                  <div style={{
                    background: "var(--cmms-bg-muted)",
                    border: "1px dashed var(--cmms-border)",
                    borderRadius: "var(--cmms-radius)",
                    padding: 14,
                  }}>
                    <HStack gap={3} vAlign="center">
                      <div style={{
                        width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                        background: "linear-gradient(135deg, #FEF2F2, #FEE2E2)",
                        border: "1px solid #FECACA",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 20,
                      }}>🪪</div>
                      <VStack gap={0} style={{ flex: 1 }}>
                        <Text type="body" weight="bold">เลขพนักงาน (Employee Code)</Text>
                        <Text type="body" size="sm" color="secondary">
                          {lineName ? `สำหรับ ${lineName}` : "ต้องผูกกับผู้ใช้ที่แอดมินสร้างไว้ในระบบ"}
                        </Text>
                      </VStack>
                    </HStack>
                    <TextInput
                      label="เลขพนักงาน"
                      isLabelHidden
                      placeholder="เช่น E01117"
                      value={empCode}
                      onChange={(value: string) => {
                        const upper = value.toUpperCase();
                        setEmpCode(upper.length > 6 ? upper.slice(0, 6) : upper);
                      }}
                    />
                  </div>

                  {error && (
                    <div style={{
                      margin: "10px 0 0", padding: "10px 14px", borderRadius: "var(--cmms-radius)",
                      background: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c",
                      fontSize: "0.8rem", fontWeight: 600, lineHeight: 1.5,
                    }}>
                      {error}
                    </div>
                  )}

                  <VStack gap={2}>
                    {liffStatus === "external" && !lineUserId ? (
                      <>
                        <Button
                          label="ล็อกอินด้วย LINE เพื่อผูกบัญชี"
                          variant="primary"
                          width="100%"
                          onClick={() => (window.location.href = "/line_login.php")}
                        />
                        <Text type="body" size="sm" color="secondary" style={{ textAlign: "center" }}>
                          ระบบจะพากลับมาที่หน้านี้พร้อม LINE ID ของคุณ — กรอกเลขพนักงานแล้วกดผูก
                        </Text>
                      </>
                    ) : (
                      <>
                        <Button
                          label={submitting ? "กำลังตรวจสอบ..." : "ผูกบัญชีกับเลขพนักงานนี้"}
                          variant="primary"
                          width="100%"
                          isDisabled={submitting || !lineUserId}
                          onClick={handleBind}
                        />
                        <Text type="body" size="sm" color="secondary" style={{ textAlign: "center" }}>
                          ตรวจเลขพนักงานกับฐานข้อมูลระบบหลังบ้านอัตโนมัติ
                        </Text>
                      </>
                    )}
                  </VStack>
                </VStack>
              )}
            </VStack>
          </Card>

          <Card padding={5} style={{ borderRadius: 16, boxShadow: "0 8px 24px -8px rgba(15,23,42,0.12)", border: "1px solid rgba(255,255,255,0.6)", marginTop: 12 }}>
            <HStack gap={3} vAlign="start">
              <ShieldCheckIcon style={{ width: 20, height: 20, color: "var(--cmms-success)", flexShrink: 0 }} />
              <Text type="body" size="sm" color="secondary">
                <b>ทำไมต้องผูก?</b> ผูกครั้งเดียวจบ — ระบบจะจำชื่อคุณได้ งานที่แจ้งจะมีชื่อผู้แจ้ง
                และช่าง/กลุ่ม LINE จะได้รับแจ้งเตือนพร้อมรูปและรายละเอียดทันที
              </Text>
            </HStack>
          </Card>
        </div>
      </div>
    </main>
  );
}
