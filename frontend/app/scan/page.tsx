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
import { WrenchScrewdriverIcon, ClipboardDocumentListIcon } from "@heroicons/react/24/outline";
import { Link } from "@astryxdesign/core/Link";
import LiffLangToggle from "../../components/LiffLangToggle";
import { tliff, useLiffLang } from "@/lib/i18n-liff";

/**
 * หน้า Scan Landing — ปลายทางของ QR บนเครื่องจักร
 * สแกนแล้วโชว์เครื่อง + ให้เลือก: แจ้งซ่อมด่วน หรือ ทำเช็คชีท PM
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

const API = (url: string, init?: RequestInit) => fetch(url, init);

export default function ScanLandingPage() {
  useEffect(() => {
    const t = setTimeout(() => { document.title = "สแกน QR เครื่องจักร · CMMS-TOPPAN"; }, 350);
    return () => clearTimeout(t);
  }, []);
  useLiffLang(); // re-render ตามภาษาที่สลับ (tliff อ่านค่าตอน render)
  const [assetCode, setAssetCode] = useState("");
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deptName, setDeptName] = useState<string>("");
  // แผน PM ที่รอดำเนินการของเครื่องที่สแกน (จากตาราง pm_am จริง)
  const [pmPlans, setPmPlans] = useState<any[]>([]);
  const [pmLoading, setPmLoading] = useState(false);
  // ประวัติการซ่อมล่าสุดของเครื่องนี้ (จาก repair จริง — ต้องล็อกอิน ไม่งั้นซ่อน)
  const [repairHistory, setRepairHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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

      // ประวัติการซ่อมของเครื่องนี้ (ล่าสุด 5 ใบ) — ถ้าไม่ล็อกอิน (401) จะซ่อนหัวข้อ
      setHistoryLoading(true);
      API(`/api/v1/repair.php?asset_code=${encodeURIComponent(assetCode)}`)
        .then((r) => {
          if (!r.ok) throw new Error("unauthorized");
          return r.json();
        })
        .then((rows: any[]) => setRepairHistory(Array.isArray(rows) ? rows.slice(0, 5) : []))
        .catch(() => setRepairHistory([]))
        .finally(() => setHistoryLoading(false));
    }
  }, [assetCode]);

  const goRepair = () => {
    window.location.href = `/repair-request?asset_code=${encodeURIComponent(assetCode)}`;
  };
  const goPM = () => {
    window.location.href = `/pm_am/checksheet?asset_code=${encodeURIComponent(assetCode)}`;
  };

  const criticalityColor: Record<string, string> = {
    A: "var(--cmms-danger)", B: "var(--cmms-warning)", C: "var(--cmms-success)",
  };

  return (
    <main className="min-h-screen" style={{ position: "relative" }}>
      <div style={{ position: "fixed", top: 12, right: 12, zIndex: 60 }}>
        <LiffLangToggle />
      </div>
      <LiffBridge />
      <div
        style={{
          minHeight: "100dvh",
          background: "var(--cmms-text-primary)",
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
              <Text type="body" color="secondary">{tliff("liff.scan_loading")}</Text>
            </VStack>
          ) : error ? (
            <VStack gap={4} hAlign="center">
              <Badge label="QR SCAN" variant="info" />
              <Text type="display-1" style={{ fontSize: 40, marginBottom: 0 }}>?</Text>
              <Card padding={4} style={{ background: "var(--cmms-danger-light)", border: "1px solid var(--cmms-danger)", width: "100%" }}>
                <Text type="body" className="text-red-700" style={{ textAlign: "center" }}>{error}</Text>
              </Card>
              {assetCode && (
                <Text type="body" size="sm" color="secondary">
                  {tliff("liff.scan_qr_code")} <Text type="body" size="sm" weight="bold">{assetCode}</Text>
                </Text>
              )}
              <Text type="body" size="sm" color="secondary">
                {tliff("liff.scan_repair_anyway")}<Link href="/repair-request">{tliff("liff.scan_to_form")}</Link>
              </Text>
            </VStack>
          ) : asset ? (
            <VStack gap={3} hAlign="center">
              <span className="cmms-status ok"><span className="cmms-status-dot" />{tliff("liff.scan_ok")}</span>
              <Heading level={2} style={{ margin: 0, letterSpacing: 1 }}>{asset.code}</Heading>
              <Text type="body" color="secondary">{asset.name}</Text>

              <HStack gap={4} vAlign="center" wrap="wrap" style={{ justifyContent: "center" }}>
                {asset.department && (
                  <Text type="body" size="sm" color="secondary">{deptName || asset.department}</Text>
                )}
                {asset.criticality && (
                  <Text
                    type="body"
                    size="sm"
                    weight="bold"
                    style={{ color: criticalityColor[asset.criticality] || "var(--cmms-text-secondary)" }}
                  >
                    Criticality: {asset.criticality}
                  </Text>
                )}
              </HStack>

              <Divider style={{ width: "100%" }} />

              <Text type="supporting" weight="bold" style={{ alignSelf: "flex-start" }}>
                {tliff("liff.scan_choose_action")}
              </Text>

              <ClickableCard
                label={tliff("liff.scan_repair_btn")}
                onClick={goRepair}
                padding={5}
                width="100%"
                style={{ background: "var(--cmms-danger)", color: "#ffffff", boxShadow: "0 8px 20px rgba(239,68,68,0.35)" }}
              >
                <HStack gap={4} vAlign="center">
                  <WrenchScrewdriverIcon className="w-6 h-6" />
                  <VStack gap={0}>
                    <Text type="body" weight="bold" className="text-white">{tliff("liff.scan_repair_btn")}</Text>
                    <Text type="body" size="sm" className="text-white" style={{ opacity: 0.85 }}>
                      {tliff("liff.scan_repair_desc")}
                    </Text>
                  </VStack>
                </HStack>
              </ClickableCard>

              <ClickableCard
                label={tliff("liff.scan_pm_btn")}
                onClick={goPM}
                padding={5}
                width="100%"
                style={{ background: "var(--cmms-primary)", color: "#ffffff", boxShadow: "0 8px 20px rgba(0,104,181,0.35)" }}
              >
                <HStack gap={4} vAlign="center">
                  <ClipboardDocumentListIcon className="w-6 h-6" />
                  <VStack gap={0}>
                    <Text type="body" weight="bold" className="text-white">{tliff("liff.scan_pm_btn")}</Text>
                    <Text type="body" size="sm" className="text-white" style={{ opacity: 0.85 }}>
                      {tliff("liff.scan_pm_desc")}
                    </Text>
                  </VStack>
                </HStack>
              </ClickableCard>

              {/* แผน PM ที่ต้องทำของเครื่องนี้ (กดทำได้เลย) */}
              {pmLoading ? null : pmPlans.length > 0 ? (
                <VStack gap={2} style={{ width: "100%" }}>
                  <Text type="supporting" weight="bold" style={{ alignSelf: "flex-start", color: "var(--cmms-warning)" }}>
                    {tliff("liff.scan_pm_due")} ({pmPlans.length})
                  </Text>
                  {pmPlans.map((p) => {
                    const overdue = p.due_date && String(p.due_date) < new Date().toISOString().slice(0, 10);
                    return (
                      <Card
                        key={p.id}
                        padding={3}
                        width="100%"
                        style={{
                          background: overdue ? "var(--cmms-danger-light)" : "var(--cmms-warning-light)",
                          border: `1px solid ${overdue ? "var(--cmms-danger-light)" : "var(--cmms-warning)"}`,
                        }}
                      >
                        <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
                          <VStack gap={0} style={{ flex: 1, minWidth: 160 }}>
                            <Text type="body" weight="bold" size="sm" style={{ lineHeight: 1.4 }}>
                              {p.title || `แผน PM #${p.id}`}
                            </Text>
                            <Text type="body" size="sm" color="secondary">
                              {tliff("liff.scan_due")} {p.due_date || "-"}{p.assigned_to_name ? ` · ${tliff("liff.scan_responsible")}: ${p.assigned_to_name}` : ""}
                            </Text>
                          </VStack>
                          <Button
                            label={tliff("liff.scan_do_check")}
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

              {/* ประวัติการซ่อมล่าสุดของเครื่องนี้ (จากใบซ่อมจริง) */}
              {!historyLoading && repairHistory.length > 0 && (
                <VStack gap={2} style={{ width: "100%" }}>
                  <Text type="supporting" weight="bold" style={{ alignSelf: "flex-start" }}>
                    {tliff("liff.scan_history")} ({repairHistory.length})
                  </Text>
                  {repairHistory.map((h) => (
                    <Card
                      key={h.id}
                      padding={3}
                      width="100%"
                      style={{ border: "1px solid var(--cmms-border)" }}
                    >
                      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
                        <VStack gap={0} style={{ flex: 1, minWidth: 160 }}>
                          <Text type="body" weight="bold" size="sm" style={{ lineHeight: 1.4 }}>
                            {h.work_order_no || `ใบซ่อม #${h.id}`}
                          </Text>
                          <Text type="body" size="sm" color="secondary">
                            {h.title || h.issue_description || "-"}
                          </Text>
                        </VStack>
                        <span
                          className="cmms-andon-chip"
                          style={{
                            background:
                              String(h.status || "") === "completed" ? "var(--cmms-success)" :
                              String(h.status || "") === "in_progress" ? "var(--cmms-primary)" :
                              String(h.status || "") === "open" ? "var(--cmms-warning)" :
                              String(h.status || "") === "rejected" ? "var(--cmms-danger)" : "var(--cmms-bg-muted)",
                            color: String(h.status || "") === "completed" || String(h.status || "") === "in_progress" || String(h.status || "") === "rejected" ? "#ffffff" : "var(--cmms-text-secondary)",
                          }}
                        >
                          {String(h.status || "-")}
                        </span>
                      </HStack>
                    </Card>
                  ))}
                </VStack>
              )}

              <Text type="body" size="sm" color="secondary">
                <Link href={`/repair-request?asset_code=${encodeURIComponent(assetCode)}`}>
                  {tliff("liff.scan_skip_form")}
                </Link>
              </Text>
            </VStack>
          ) : (
            <VStack gap={3} hAlign="center" style={{ padding: "40px 0" }}>
              <Text type="body" color="secondary">{tliff("liff.scan_no_data")}</Text>
            </VStack>
          )}
        </Card>
      </div>
    </main>
  );
}
