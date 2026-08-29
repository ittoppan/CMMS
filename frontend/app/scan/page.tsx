"use client";

import { useEffect, useState } from "react";
import LiffBridge from "../../components/LiffBridge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Wrench, ClipboardList } from "lucide-react";
import Link from "next/link";
import LiffLangToggle from "../../components/LiffLangToggle";
import { tliff, useLiffLang } from "@/lib/i18n-liff";

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
  useLiffLang();
  const [assetCode, setAssetCode] = useState("");
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deptName, setDeptName] = useState<string>("");
  const [pmPlans, setPmPlans] = useState<any[]>([]);
  const [pmLoading, setPmLoading] = useState(false);
  const [repairHistory, setRepairHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [manual, setManual] = useState("");

  const handleManualLookup = () => {
    const code = manual.trim().toUpperCase();
    if (!code) return;
    setAssetCode(code);
    setLoading(true);
  };

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("asset_code");
      if (p) setAssetCode(p.trim().toUpperCase());
    } catch { /* ignore */ }
  }, []);

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
    window.location.href = `/repair/request?asset_code=${encodeURIComponent(assetCode)}`;
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
        <Card style={{ width: "100%", maxWidth: 460, boxShadow: "0 24px 60px rgba(0,0,0,0.4)" }}>
          <CardContent className="p-6">
            {loading ? (
              <div className="flex flex-col items-center gap-4 py-10">
                <Spinner />
                <p className="text-[var(--cmms-text-secondary)]">{tliff("liff.scan_loading")}</p>
              </div>
            ) : !assetCode ? (
              <div className="flex flex-col items-center gap-4 py-6">
                <Badge variant="info">QR SCAN</Badge>
                <p style={{ fontSize: 40, marginBottom: 0 }}>?</p>
                <p className="font-bold m-0" style={{ color: "var(--cmms-text-primary)" }}>
                  ใส่รหัสเครื่องจักรเพื่อดูข้อมูล
                </p>
                <p className="text-sm text-[var(--cmms-text-secondary)] m-0">
                  สแกน QR ที่ตัวเครื่อง หรือกรอกรหัสได้ด้านล่างนี้
                </p>
                <form
                  className="w-full flex gap-2"
                  onSubmit={(e) => { e.preventDefault(); handleManualLookup(); }}
                >
                  <input
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    placeholder="เช่น EN-2608-064"
                    className="flex-1 min-w-0 rounded-lg border px-4 py-3 text-base outline-none"
                    style={{ borderColor: "var(--cmms-border)", color: "var(--cmms-text-primary)", background: "var(--cmms-bg)" }}
                  />
                  <Button type="submit">ดูข้อมูล</Button>
                </form>
                <p className="text-sm text-[var(--cmms-text-secondary)]">
                  {tliff("liff.scan_repair_anyway")}<Link href="/repair/request">{tliff("liff.scan_to_form")}</Link>
                </p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-4">
                <Badge variant="info">QR SCAN</Badge>
                <p style={{ fontSize: 40, marginBottom: 0 }}>?</p>
                <Card className="w-full" style={{ background: "var(--cmms-danger-light)", border: "1px solid var(--cmms-danger)" }}>
                  <CardContent className="p-4">
                    <p className="text-red-700 text-center">{error}</p>
                  </CardContent>
                </Card>
                {assetCode && (
                  <p className="text-sm text-[var(--cmms-text-secondary)]">
                    {tliff("liff.scan_qr_code")} <strong>{assetCode}</strong>
                  </p>
                )}
                <p className="text-sm text-[var(--cmms-text-secondary)]">
                  {tliff("liff.scan_repair_anyway")}<Link href="/repair/request">{tliff("liff.scan_to_form")}</Link>
                </p>
              </div>
            ) : asset ? (
              <div className="flex flex-col items-center gap-3">
                <span className="cmms-status ok"><span className="cmms-status-dot" />{tliff("liff.scan_ok")}</span>
                <h2 style={{ margin: 0, letterSpacing: 1 }}>{asset.code}</h2>
                <p className="text-[var(--cmms-text-secondary)] m-0">{asset.name}</p>

                <div className="flex items-center gap-4 flex-wrap justify-center">
                  {asset.department && (
                    <p className="text-sm text-[var(--cmms-text-secondary)] m-0">{deptName || asset.department}</p>
                  )}
                  {asset.criticality && (
                    <p
                      className="text-sm font-bold m-0"
                      style={{ color: criticalityColor[asset.criticality] || "var(--cmms-text-secondary)" }}
                    >
                      Criticality: {asset.criticality}
                    </p>
                  )}
                </div>

                <hr className="w-full border-[var(--cmms-border)] my-2" />

                <p className="font-bold w-full text-left" style={{ color: "var(--cmms-text-primary)" }}>
                  {tliff("liff.scan_choose_action")}
                </p>

                <Button
                  className="w-full"
                  onClick={goRepair}
                  style={{ background: "var(--cmms-danger)", boxShadow: "0 8px 20px rgba(239,68,68,0.35)" }}
                >
                  <div className="flex items-center gap-4">
                    <Wrench className="w-6 h-6" strokeWidth={1.75} />
                    <div className="flex flex-col">
                      <p className="font-bold text-white m-0">{tliff("liff.scan_repair_btn")}</p>
                      <p className="text-sm text-white m-0" style={{ opacity: 0.85 }}>{tliff("liff.scan_repair_desc")}</p>
                    </div>
                  </div>
                </Button>

                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={goPM}
                  style={{ background: "var(--cmms-primary)", boxShadow: "0 8px 20px rgba(0,104,181,0.35)" }}
                >
                  <div className="flex items-center gap-4">
                    <ClipboardList className="w-6 h-6" strokeWidth={1.75} />
                    <div className="flex flex-col">
                      <p className="font-bold text-white m-0">{tliff("liff.scan_pm_btn")}</p>
                      <p className="text-sm text-white m-0" style={{ opacity: 0.85 }}>{tliff("liff.scan_pm_desc")}</p>
                    </div>
                  </div>
                </Button>

                {!pmLoading && pmPlans.length > 0 && (
                  <div className="w-full flex flex-col gap-2">
                    <p className="font-bold w-full text-left" style={{ color: "var(--cmms-warning)" }}>
                      {tliff("liff.scan_pm_due")} ({pmPlans.length})
                    </p>
                    {pmPlans.map((p) => {
                      const overdue = p.due_date && String(p.due_date) < new Date().toISOString().slice(0, 10);
                      return (
                        <Card
                          key={p.id}
                          className="w-full"
                          style={{
                            background: overdue ? "var(--cmms-danger-light)" : "var(--cmms-warning-light)",
                            border: `1px solid ${overdue ? "var(--cmms-danger-light)" : "var(--cmms-warning)"}`,
                          }}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex-1 min-w-[160px]">
                                <p className="font-bold text-sm m-0" style={{ lineHeight: 1.4 }}>
                                  {p.title || `แผน PM #${p.id}`}
                                </p>
                                <p className="text-sm text-[var(--cmms-text-secondary)] m-0">
                                  {tliff("liff.scan_due")} {p.due_date || "-"}{p.assigned_to_name ? ` · ${tliff("liff.scan_responsible")}: ${p.assigned_to_name}` : ""}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => window.location.href = `/pm_am/checksheet?plan_id=${p.id}&asset_code=${encodeURIComponent(assetCode)}`}
                              >
                                {tliff("liff.scan_do_check")}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {!historyLoading && repairHistory.length > 0 && (
                  <div className="w-full flex flex-col gap-2">
                    <p className="font-bold w-full text-left">{tliff("liff.scan_history")} ({repairHistory.length})</p>
                    {repairHistory.map((h) => (
                      <Card key={h.id} className="w-full" style={{ border: "1px solid var(--cmms-border)" }}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex-1 min-w-[160px]">
                              <p className="font-bold text-sm m-0" style={{ lineHeight: 1.4 }}>
                                {h.work_order_no || `ใบซ่อม #${h.id}`}
                              </p>
                              <p className="text-sm text-[var(--cmms-text-secondary)] m-0">
                                {h.title || h.issue_description || "-"}
                              </p>
                            </div>
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
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                <p className="text-sm text-[var(--cmms-text-secondary)]">
                  <Link href={`/repair/request?asset_code=${encodeURIComponent(assetCode)}`}>
                    {tliff("liff.scan_skip_form")}
                  </Link>
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10">
                <p className="text-[var(--cmms-text-secondary)]">{tliff("liff.scan_no_data")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}