"use client";

import { useEffect, useState } from "react";
import LiffBridge from "../../components/LiffBridge";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Divider } from "@astryxdesign/core/Divider";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";

/**
 * หน้า Scan Landing — ปลายทางของ QR บนเครื่องจักร
 * สแกนแล้วโชว์เครื่อง + ให้เลือก: 🔧 แจ้งซ่อมด่วน หรือ 📋 ทำเช็คชีท PM
 * URL: /scan?asset_code=A-PT-01
 */
type Asset = {
  id: number;
  code: string;
  name: string;
  department?: string;
  criticality?: string;
  status?: string;
};

const API = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, headers: { "ngrok-skip-browser-warning": "1", ...(init?.headers || {}) } });

export default function ScanLandingPage() {
  const [assetCode, setAssetCode] = useState("");
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deptName, setDeptName] = useState<string>("");
  // แผน PM ที่รอดำเนินการของเครื่องที่สแกน (จากตาราง pm_am จริง)
  const [pmPlans, setPmPlans] = useState<any[]>([]);
  const [pmLoading, setPmLoading] = useState(false);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("asset_code");
      if (p) setAssetCode(p.trim().toUpperCase());
    } catch { /* ignore */ }
  }, []);

  // แมป department id/ชื่อ -> ชื่อเต็ม (ใช้หน้า scan เท่านั้น ไม่แตะ API กลาง)
  useEffect(() => {
    API("/api/v1/departments.php")
      .then((r) => r.json())
      .then((rows: any[]) => {
        if (!Array.isArray(rows)) return;
        const map: Record<string, string> = {};
        rows.forEach((d) => { if (d?.id != null && d?.name) map[String(d.id)] = d.name; });
        const norm = (s: string) => String(s).replace(/\s+/g, "").toLowerCase().replace("ฝ่าย", "");
        const lookup = (key: string): string | null => {
          if (!key) return null;
          const k = String(key).trim();
          if (map[k]) return map[k];
          const kn = norm(k);
          if (!kn) return null;
          for (const d of rows) {
            if (d?.name && norm(d.name) === kn) return d.name;
          }
          for (const d of rows) {
            if (d?.name) {
              const dn = norm(d.name);
              if (dn.includes(kn) || kn.includes(dn)) return d.name;
            }
          }
          return null;
        };
        if (asset?.department) {
          const name = lookup(asset.department);
          if (name) setDeptName(name);
        }
      })
      .catch(() => { /* แสดง id ได้ถ้าไม่มีชื่อ */ });
  }, [asset]);

  useEffect(() => {
    if (!assetCode) {
      setLoading(false);
      setError("ไม่พบเครื่องจักรจาก QR — กรุณาสแกน QR ที่ตัวเครื่องอีกครั้ง");
      return;
    }
    API("/api/v1/asset_registry.php")
      .then((r) => r.json())
      .then((rows: Asset[]) => {
        const list = Array.isArray(rows) ? rows : [];
        const hit = list.find((a) => a.code === assetCode) || null;
        setAsset(hit);
        if (!hit) setError(`ไม่พบเครื่องจักร "${assetCode}" ในระบบ — กรุณาติดต่อช่างซ่อมบำรุง`);
        else setError(null);
      })
      .catch(() => setError("โหลดข้อมูลเครื่องจักรไม่สำเร็จ กรุณาลองใหม่"))
      .finally(() => setLoading(false));

    // โหลดแผน PM ที่รอดำเนินการของเครื่องนี้ด้วย
    if (assetCode) {
      setPmLoading(true);
      API("/api/v1/index.php?resource=pm-plans")
        .then((r) => r.json())
        .then((json) => {
          const list = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
          const done = ["completed", "skipped"];
          setPmPlans(
            list.filter((p: any) =>
              p.asset_code && String(p.asset_code).toUpperCase() === assetCode &&
              !done.includes(String(p.status || ""))
            )
          );
        })
        .catch(() => { /* ไม่มี PM = แสดงว่าง */ })
        .finally(() => setPmLoading(false));
    }
  }, [assetCode]);

  const goRepair = () => {
    window.location.href = `/repair-request?asset_code=${encodeURIComponent(assetCode)}`;
  };
  const goPM = () => {
    window.location.href = `/pm_am/checksheet?asset_code=${encodeURIComponent(assetCode)}`;
  };

  const criticalityColor: Record<string, string> = {
    A: "#dc2626", B: "#d97706", C: "#16a34a",
  };

  return (
    <main className="min-h-screen">
      <LiffBridge />
      <div
        style={{
          minHeight: "100dvh",
          background: "linear-gradient(160deg, #0f172a 0%, #1e293b 55%, #0f172a 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Card
          padding={6}
          style={{ width: "100%", maxWidth: 460, boxShadow: "0 24px 60px rgba(0,0,0,0.4)" }}
        >
          {loading ? (
            <VStack gap={4} hAlign="center" style={{ padding: "40px 0" }}>
              <Spinner />
              <Text type="body" color="secondary">กำลังตรวจสอบเครื่องจักร...</Text>
            </VStack>
          ) : error ? (
            <VStack gap={4} hAlign="center">
              <Badge label="QR SCAN" variant="warning" />
              <Text type="display-1" style={{ fontSize: 40, marginBottom: 0 }}>❓</Text>
              <Card padding={4} style={{ background: "#fef2f2", border: "1px solid #fecaca", width: "100%" }}>
                <Text type="body" className="text-red-700" style={{ textAlign: "center" }}>{error}</Text>
              </Card>
              {assetCode && (
                <Text type="body" size="sm" color="secondary">
                  รหัสจาก QR: <Text type="body" size="sm" weight="bold">{assetCode}</Text>
                </Text>
              )}
              <Text type="body" size="sm" color="secondary">
                ต้องการแจ้งซ่อมแม้ไม่พบเครื่อง? <Link href="/repair-request">ไปฟอร์มแจ้งซ่อม →</Link>
              </Text>
            </VStack>
          ) : asset ? (
            <VStack gap={3} hAlign="center">
              <Badge label="🔍 สแกนเครื่องจักรสำเร็จ" variant="success" />
              <Heading level={2} style={{ margin: 0, letterSpacing: 1 }}>{asset.code}</Heading>
              <Text type="body" color="secondary">{asset.name}</Text>

              <HStack gap={4} vAlign="center" wrap="wrap" style={{ justifyContent: "center" }}>
                {asset.department && (
                  <Text type="body" size="sm" color="secondary">🏭 {deptName || asset.department}</Text>
                )}
                {asset.criticality && (
                  <Text
                    type="body"
                    size="sm"
                    weight="bold"
                    style={{ color: criticalityColor[asset.criticality] || "#64748b" }}
                  >
                    ⚠️ Criticality: {asset.criticality}
                  </Text>
                )}
              </HStack>

              <Divider style={{ width: "100%" }} />

              <Text type="supporting" weight="bold" style={{ alignSelf: "flex-start" }}>
                เลือกการทำงานสำหรับเครื่องนี้
              </Text>

              <ClickableCard
                label="แจ้งซ่อมด่วน"
                onClick={goRepair}
                padding={5}
                width="100%"
                style={{ background: "#ef4444", color: "#ffffff", boxShadow: "0 8px 20px rgba(239,68,68,0.35)" }}
              >
                <HStack gap={4} vAlign="center">
                  <Text type="display-1" style={{ fontSize: 26, margin: 0 }}>🔧</Text>
                  <VStack gap={0}>
                    <Text type="body" weight="bold" className="text-white">แจ้งซ่อมด่วน</Text>
                    <Text type="body" size="xs" className="text-white" style={{ opacity: 0.85 }}>
                      เครื่องเสีย / หยุดทำงาน — ส่งใบแจ้งซ่อมทันที
                    </Text>
                  </VStack>
                </HStack>
              </ClickableCard>

              <ClickableCard
                label="ทำเช็คชีท PM"
                onClick={goPM}
                padding={5}
                width="100%"
                style={{ background: "#2563eb", color: "#ffffff", boxShadow: "0 8px 20px rgba(37,99,235,0.35)" }}
              >
                <HStack gap={4} vAlign="center">
                  <Text type="display-1" style={{ fontSize: 26, margin: 0 }}>📋</Text>
                  <VStack gap={0}>
                    <Text type="body" weight="bold" className="text-white">ทำเช็คชีท PM</Text>
                    <Text type="body" size="xs" className="text-white" style={{ opacity: 0.85 }}>
                      บำรุงเชิงป้องกัน — ทำตามแผน PM ของเครื่องนี้
                    </Text>
                  </VStack>
                </HStack>
              </ClickableCard>

              {/* 🗓️ แผน PM ที่ต้องทำของเครื่องนี้ (กดทำได้เลย) */}
              {pmLoading ? null : pmPlans.length > 0 ? (
                <VStack gap={2} style={{ width: "100%" }}>
                  <Text type="supporting" weight="bold" style={{ alignSelf: "flex-start", color: "#f59e0b" }}>
                    🗓️ แผน PM ที่ต้องทำของเครื่องนี้ ({pmPlans.length})
                  </Text>
                  {pmPlans.map((p) => {
                    const overdue = p.due_date && String(p.due_date) < new Date().toISOString().slice(0, 10);
                    return (
                      <Card
                        key={p.id}
                        padding={3}
                        width="100%"
                        style={{
                          background: overdue ? "#fef2f2" : "#fffbeb",
                          border: `1px solid ${overdue ? "#fecaca" : "#fde68a"}`,
                        }}
                      >
                        <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
                          <VStack gap={0} style={{ flex: 1, minWidth: 160 }}>
                            <Text type="body" weight="bold" size="sm" style={{ lineHeight: 1.4 }}>
                              {overdue ? "⏰ " : "📅 "}{p.title || `แผน PM #${p.id}`}
                            </Text>
                            <Text type="body" size="xs" color="secondary">
                              ครบกำหนด {p.due_date || "-"}{p.assigned_to_name ? ` · ผู้รับผิดชอบ: ${p.assigned_to_name}` : ""}
                            </Text>
                          </VStack>
                          <Button
                            label="ทำเช็ค"
                            size="sm"
                            variant="primary"
                            onClick={() => window.location.href = `/pm_am/checksheet?plan_id=${p.id}&asset_code=${encodeURIComponent(assetCode)}`}
                          />
                        </HStack>
                      </Card>
                    );
                  })}
                </VStack>
              ) : null}

              <Text type="body" size="sm" color="secondary">
                <Link href={`/repair-request?asset_code=${encodeURIComponent(assetCode)}`}>
                  ข้ามไปฟอร์มแจ้งซ่อมตรงๆ →
                </Link>
              </Text>
            </VStack>
          ) : (
            <VStack gap={3} hAlign="center" style={{ padding: "40px 0" }}>
              <Text type="body" color="secondary">ไม่มีข้อมูล</Text>
            </VStack>
          )}
        </Card>
      </div>
    </main>
  );
}
