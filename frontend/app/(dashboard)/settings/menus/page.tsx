"use client";

import { useState, useEffect, useMemo, type ComponentType } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import {
  CheckCircleIcon,
  ShieldCheckIcon,
  HomeIcon,
  ClipboardDocumentCheckIcon,
  WrenchScrewdriverIcon,
  MapIcon,
  ClipboardDocumentListIcon,
  CalendarDaysIcon,
  BuildingOffice2Icon,
  MagnifyingGlassIcon,
  ChartBarIcon,
  BellAlertIcon,
  TableCellsIcon,
  DocumentArrowDownIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";

interface MenuItem {
  key: string;
  href: string;
  label: string;
  section: string;
}

interface RoleItem {
  id: number;
  name: string;
  description: string;
}

interface BnKeyItem {
  key: string;
  label: string;
}

// สีแถวบทบาท (ตามสี badge sidebar เดิม)
const ROLE_COLOR: Record<string, { bg: string; fg: string }> = {
  Admin: { bg: "#ffe4e6", fg: "#e11d48" },
  Manager: { bg: "#fef3c7", fg: "#d97706" },
  Technician: { bg: "#e0e7ff", fg: "#4f46e5" },
  Operator: { bg: "#dcfce7", fg: "#16a34a" },
  Viewer: { bg: "#f1f5f9", fg: "#64748b" },
};

// ไอคอนพรีวิวปุ่มล่าง (ตัวเดียวกับ layout.tsx — สำหรับวาดภาพบนหน้าจอมือถือจำลอง)
const BN_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  dashboard: HomeIcon,
  "repair/my_tasks": ClipboardDocumentCheckIcon,
  "repair/request": WrenchScrewdriverIcon,
  "repair/tracking": MapIcon,
  "pm_am/checksheet": ClipboardDocumentListIcon,
  "pm_am/calendar": CalendarDaysIcon,
  asset_registry: BuildingOffice2Icon,
  "qr-sheet": MagnifyingGlassIcon,
  notifications: BellAlertIcon,
  analytics: ChartBarIcon,
  "reports/export_excel": TableCellsIcon,
  "reports/monthly_pdf": DocumentArrowDownIcon,
  settings: Cog6ToothIcon,
};

const MAX_BN = 5; // ปุ่มล่างสูงสุดที่แนะนำ (flex:1 ต่อปุ่ม เหมือนแอปจริง)

export default function MenuPermissionsPage() {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [perms, setPerms] = useState<Record<number, Record<string, number>>>({});
  const [bottomNav, setBottomNav] = useState<Record<number, string[]>>({}); // role_id => [menu_key]
  const [bnKeys, setBnKeys] = useState<BnKeyItem[]>([]); // pool ปุ่มที่เลือกได้
  const [previewRoleId, setPreviewRoleId] = useState<number | null>(null); // บทบาทที่พรีวิวบนมือถือ
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/menu_permissions.php", {
        headers: { "ngrok-skip-browser-warning": "1" },
      });
      const json = await res.json();
      setMenus(json.menus || []);
      setRoles(json.roles || []);
      setPerms(json.permissions || {});
      setBottomNav(json.bottom_nav || {});
      setBnKeys(json.bottom_nav_keys || []);
      setPreviewRoleId((prev) => prev ?? json.roles?.[0]?.id ?? null);
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดข้อมูลสิทธิ์เมนูได้");
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const sections = useMemo(() => {
    const order = ["งานซ่อมบำรุง", "PM & เครื่องจักร", "คลังอะไหล่", "วิเคราะห์ & รายงาน", "ระบบ & ตั้งค่า"];
    const present = Array.from(new Set(menus.map((m) => m.section)));
    return order.filter((s) => present.includes(s));
  }, [menus]);

  const toggle = (roleId: number, menuKey: string) => {
    setPerms((prev) => {
      const nextRole = { ...(prev[roleId] || {}) };
      nextRole[menuKey] = nextRole[menuKey] === 1 ? 0 : 1;
      return { ...prev, [roleId]: nextRole };
    });
  };

  const toggleRoleAll = (roleId: number, granted: boolean) => {
    setPerms((prev) => {
      const nextRole: Record<string, number> = {};
      menus.forEach((m) => { nextRole[m.key] = granted ? 1 : 0; });
      return { ...prev, [roleId]: nextRole };
    });
  };

  // ═══════════ ปุ่มล่าง: เพิ่ม / ลบ / เลื่อน ═══════════
  const bnLabelOf = (key: string): string => bnKeys.find((b) => b.key === key)?.label || key;

  const bnAdd = (roleId: number, key: string) => {
    setBottomNav((prev) => ({ ...prev, [roleId]: [...(prev[roleId] || []), key] }));
  };
  const bnRemove = (roleId: number, idx: number) => {
    setBottomNav((prev) => ({ ...prev, [roleId]: (prev[roleId] || []).filter((_, i) => i !== idx) }));
  };
  const bnMove = (roleId: number, idx: number, dir: number) => {
    setBottomNav((prev) => {
      const arr = [...(prev[roleId] || [])];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return { ...prev, [roleId]: arr };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      for (const role of roles) {
        if (!perms[role.id]) continue;
        const res = await fetch("/api/v1/menu_permissions.php", {
          method: "POST",
          headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
          body: JSON.stringify({
            role_id: role.id,
            grants: perms[role.id],
            bottom_nav: bottomNav[role.id] || [],
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `บันทึกบทบาท ${role.name} ไม่สำเร็จ`);
        }
      }
      setSaveMsg("บันทึกสิทธิ์เมนูและปุ่มล่างทั้งหมดสำเร็จ — ผู้ใช้ที่เปิดแอปใหม่จะเห็นผลทันที");
      setTimeout(() => setSaveMsg(""), 6000);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "บันทึกไม่สำเร็จ");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดสิทธิ์เมนู...</Text>
      </HStack>
    );
  }

  // ═══════════ ข้อมูลสำหรับพรีวิวโทรศัพท์ฝั่งขวา ═══════════
  const previewRole = roles.find((r) => r.id === previewRoleId) || roles[0];
  const previewKeys = previewRole ? bottomNav[previewRole.id] || [] : [];
  const previewItems = previewKeys.map((k, i) => ({
    key: k,
    label: bnLabelOf(k),
    icon: BN_ICONS[k],
    hidden: (previewRole ? perms[previewRole.id]?.[k] ?? 1 : 1) === 0,
    active: i === 0,
  }));
  const previewColor = previewRole
    ? (ROLE_COLOR[previewRole.name] || { fg: "#475569", bg: "#f1f5f9" })
    : { fg: "#475569", bg: "#f1f5f9" };

  return (
    <VStack gap={6}>
      <style>{`
        .bn-config-grid { display: grid; grid-template-columns: 1fr 340px; gap: 24px; align-items: start; }
        .bn-preview-sticky { position: sticky; top: 16px; }
        @media (max-width: 1200px) {
          .bn-config-grid { grid-template-columns: 1fr; }
          .bn-preview-sticky { position: static; }
        }
        .bn-chip-btn { border: none; background: transparent; cursor: pointer; padding: 0 2px; font-size: 0.72rem; line-height: 1; color: var(--cmms-text-muted); border-radius: 4px; }
        .bn-chip-btn:hover { color: var(--cmms-primary); background: var(--cmms-primary-light); }
        .bn-chip-btn.danger:hover { color: #dc2626; background: #fee2e2; }
      `}</style>

      {error && <Banner status="error" title="Error" description={error} isDismissable={false} />}

      {saveMsg && (
        <Card padding={4} style={{ background: "var(--cmms-success-bg)", border: "1px solid var(--cmms-success)" }}>
          <HStack gap={3} vAlign="center">
            <Icon icon={CheckCircleIcon} size="md" color="success" />
            <Text type="body" weight="bold" style={{ color: "var(--cmms-success)" }}>{saveMsg}</Text>
          </HStack>
        </Card>
      )}

      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>สิทธิ์เมนูและปุ่มล่างตามบทบาท (PWA)</Heading>
            <Badge label={`${menus.length} เมนู × ${roles.length} บทบาท`} variant="info" />
          </HStack>
          <Text type="body" color="secondary">
            เลือกว่าแต่ละบทบาทเห็นเมนูใดในแอป และปุ่มล่างมือถือแบบไหน — พรีวิวทางขวาจะอัปเดตสดทุกครั้งที่แก้
          </Text>
        </VStack>
        <Button label={`บันทึกการตั้งค่า`} variant="primary" isLoading={saving} onClick={handleSave} />
      </HStack>

      <div className="bn-config-grid">
        {/* ═══════════ คอลัมน์ซ้าย: ตารางสิทธิ์ + ตั้งค่าปุ่มล่าง ═══════════ */}
        <VStack gap={6}>
          <Card padding={4}>
            <VStack gap={5}>
              {/* หัวตารางบทบาท */}
              <div style={{ overflowX: "auto" }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: `minmax(220px, 2fr) repeat(${roles.length}, minmax(90px, 1fr))`,
                  gap: 4,
                  alignItems: "center",
                  padding: "4px 0",
                  borderBottom: "2px solid var(--cmms-border)",
                }}>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--cmms-text-muted)", padding: "6px 4px" }}>
                    หมวดเมนู
                  </div>
                  {roles.map((r) => (
                    <div key={r.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: 4 }} title={r.description || ""}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: 999,
                          whiteSpace: "nowrap",
                          background: (ROLE_COLOR[r.name] || { bg: "#f1f5f9", fg: "#475569" }).bg,
                          color: (ROLE_COLOR[r.name] || { fg: "#475569" }).fg,
                        }}
                      >
                        {r.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleRoleAll(r.id, true)}
                        title="เปิดทุกเมนู"
                        style={{
                          border: "none", background: "transparent", cursor: "pointer",
                          fontSize: "0.68rem", color: "var(--cmms-primary)", textDecoration: "underline", padding: 0,
                        }}
                      >
                        เลือกทั้งหมด
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleRoleAll(r.id, false)}
                        title="ปิดทุกเมนู"
                        style={{
                          border: "none", background: "transparent", cursor: "pointer",
                          fontSize: "0.68rem", color: "var(--cmms-text-muted)", textDecoration: "underline", padding: 0,
                        }}
                      >
                        ปิดทั้งหมด
                      </button>
                    </div>
                  ))}
                </div>

                {/* แถวเมนูเรียงตามหมวด */}
                {sections.map((section) => (
                  <div key={section}>
                    <div style={{
                      display: "flex", alignItems: "center", fontWeight: 700, fontSize: "0.8rem",
                      color: "var(--cmms-primary)", margin: "14px 0 4px", padding: "6px 8px",
                      background: "var(--cmms-primary-light)", borderRadius: "var(--cmms-radius)",
                    }}>
                      <ShieldCheckIcon width={14} height={14} style={{ marginRight: 6 }} />
                      {section}
                    </div>
                    {menus
                      .filter((m) => m.section === section)
                      .map((m) => (
                        <div key={m.key} style={{
                          display: "grid",
                          gridTemplateColumns: `minmax(220px, 2fr) repeat(${roles.length}, minmax(90px, 1fr))`,
                          gap: 4,
                          alignItems: "center",
                          padding: "4px 0",
                          borderBottom: "1px solid var(--cmms-border)",
                        }}>
                          <div title={m.href} style={{ display: "flex", flexDirection: "column", gap: 1, padding: "2px 4px", minWidth: 0 }}>
                            <span style={{
                              fontSize: "0.82rem", fontWeight: 600, color: "var(--cmms-text-primary)",
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            }}>{m.label}</span>
                            <span style={{ fontSize: "0.68rem", color: "var(--cmms-text-muted)", fontFamily: "monospace" }}>{m.href}</span>
                          </div>
                          {roles.map((r) => (
                            <div key={r.id} style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 4 }}>
                              <input
                                type="checkbox"
                                style={{ width: 18, height: 18, cursor: "pointer", accentColor: "var(--cmms-primary, #0D4785)", borderRadius: 4 }}
                                checked={(perms[r.id]?.[m.key] ?? 1) === 1}
                                onChange={() => toggle(r.id, m.key)}
                                aria-label={`${r.name}: ${m.label}`}
                              />
                            </div>
                          ))}
                        </div>
                      ))}
                  </div>
                ))}
              </div>

              <HStack hAlign="end">
                <Button
                  label={saving ? "กำลังบันทึก..." : "บันทึกสิทธิ์เมนูทั้งหมด"}
                  variant="primary"
                  isLoading={saving}
                  onClick={handleSave}
                />
              </HStack>
            </VStack>
          </Card>

          {/* ═══════════ ตั้งค่าปุ่มล่างมือถือต่อบทบาท ═══════════ */}
          <Card padding={4}>
            <VStack gap={4}>
              <VStack gap={1}>
                <Heading level={3}>ปุ่มล่างมือถือ (Bottom Nav)</Heading>
                <Text type="body" size="sm" color="secondary">
                  เลือกปุ่มที่ผู้ใช้ของบทบาทนั้นเห็นที่แถบด้านล่างสุดของแอปมือถือ — กดการ์ดบทบาทเพื่อดูพรีวิวฝั่งขวา
                  {" "}ปุ่มที่เมนูถูกปิดสิทธิ์ (ติ๊กออกด้านบน) จะขึ้นเป็นปุ่มจางในพรีวิว และไม่แสดงบนมือถือจริง
                </Text>
              </VStack>

              {roles.map((r) => {
                const rc = ROLE_COLOR[r.name] || { bg: "#f1f5f9", fg: "#475569" };
                const list = bottomNav[r.id] || [];
                const isPreview = previewRoleId === r.id;
                const available = bnKeys.filter((b) => !list.includes(b.key));
                const hiddenCount = list.filter((k) => (perms[r.id]?.[k] ?? 1) === 0).length;
                return (
                  <div
                    key={r.id}
                    onClick={() => setPreviewRoleId(r.id)}
                    style={{
                      border: isPreview ? `2px solid ${rc.fg}` : "1px solid var(--cmms-border)",
                      borderRadius: 12,
                      padding: "12px 14px",
                      cursor: "pointer",
                      background: isPreview ? rc.bg : "var(--cmms-bg-wash, #f8fafc)",
                      transition: "all .15s ease",
                    }}
                  >
                    <HStack hAlign="between" vAlign="center">
                      <HStack gap={3} vAlign="center">
                        <span
                          style={{
                            fontSize: "0.75rem", fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                            background: rc.bg, color: rc.fg,
                          }}
                        >
                          {r.name}
                        </span>
                        <Badge label={`${list.length} ปุ่ม`} variant={list.length > MAX_BN ? "warning" : "neutral"} />
                        {hiddenCount > 0 && (
                          <Badge label={`${hiddenCount} ปุ่มถูกปิดสิทธิ์`} variant="warning" />
                        )}
                      </HStack>
                      <Text type="body" size="sm" color="secondary">
                        {isPreview ? "กำลังพรีวิว 👈" : "กดเพื่อพรีวิว"}
                      </Text>
                    </HStack>

                    {/* แถวปุ่มที่เลือกไว้ */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {list.map((k, i) => {
                        const hidden = (perms[r.id]?.[k] ?? 1) === 0;
                        return (
                          <div
                            key={k}
                            title={hidden ? "เมนูนี้ถูกปิดสิทธิ์ → จะไม่แสดงบนมือถือจริง" : bnLabelOf(k)}
                            style={{
                              display: "flex", alignItems: "center", gap: 6,
                              border: hidden ? "1px dashed #f59e0b" : "1px solid var(--cmms-border)",
                              background: "#fff", borderRadius: 999,
                              padding: "5px 8px 5px 10px",
                              opacity: hidden ? 0.75 : 1,
                            }}
                          >
                            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: rc.fg, minWidth: 14 }}>
                              {i + 1}
                            </span>
                            <span style={{ fontSize: "0.78rem", fontWeight: 600, whiteSpace: "nowrap", color: "var(--cmms-text-primary)" }}>
                              {bnLabelOf(k)}
                            </span>
                            {hidden && <span style={{ fontSize: "0.62rem", color: "#b45309", fontWeight: 700 }}>ปิดสิทธิ์</span>}
                            <div style={{ display: "flex", gap: 1, marginLeft: 2 }} onClick={(e) => e.stopPropagation()}>
                              <button type="button" className="bn-chip-btn" disabled={i === 0} onClick={() => bnMove(r.id, i, -1)} title="เลื่อนซ้าย (ก่อนหน้า)">▲</button>
                              <button type="button" className="bn-chip-btn" disabled={i === list.length - 1} onClick={() => bnMove(r.id, i, 1)} title="เลื่อนขวา (ถัดไป)">▼</button>
                              <button type="button" className="bn-chip-btn danger" onClick={() => bnRemove(r.id, i)} title="ลบปุ่ม">✕</button>
                            </div>
                          </div>
                        );
                      })}
                      {list.length === 0 && (
                        <Text type="body" size="sm" color="secondary" style={{ padding: "4px 0" }}>
                          ยังไม่มีปุ่มที่ตั้งเอง — จะใช้ค่าเริ่มต้นของบทบาท
                        </Text>
                      )}
                    </div>

                    {/* เพิ่มปุ่ม */}
                    {available.length > 0 ? (
                      <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                        <select
                          value=""
                          onChange={(e) => { if (e.target.value) bnAdd(r.id, e.target.value); }}
                          style={{
                            fontSize: "0.78rem", padding: "5px 10px", borderRadius: 8,
                            border: "1px solid var(--cmms-border)", background: "#fff",
                            color: "var(--cmms-text-primary)", cursor: "pointer", maxWidth: "100%",
                          }}
                          aria-label={`เพิ่มปุ่มให้บทบาท ${r.name}`}
                        >
                          <option value="">＋ เพิ่มปุ่ม…</option>
                          {available.map((b) => (
                            <option key={b.key} value={b.key}>{b.label} ({b.key})</option>
                          ))}
                        </select>
                        {list.length >= MAX_BN && (
                          <Text type="body" size="sm" color="secondary" style={{ marginTop: 6 }}>
                            แนะนำไม่เกิน {MAX_BN} ปุ่ม — ถ้าเกิน ปุ่มจะเล็กลง (flex:1)
                          </Text>
                        )}
                      </div>
                    ) : (
                      <Text type="body" size="sm" color="secondary" style={{ marginTop: 10 }}>
                        เลือกครบทุกปุ่มแล้ว
                      </Text>
                    )}
                  </div>
                );
              })}
            </VStack>
          </Card>
        </VStack>

        {/* ═══════════ คอลัมน์ขวา: พรีวิวโทรศัพท์ (สดทุกครั้งที่แก้) ═══════════ */}
        <div className="bn-preview-sticky">
          <Card padding={4}>
            <VStack gap={4}>
              <HStack hAlign="between" vAlign="center" wrap="wrap" gap={2}>
                <VStack gap={0}>
                  <Heading level={4}>พรีวิวมือถือ</Heading>
                  <Text type="body" size="sm" color="secondary">เห็นผลสดขณะแก้ไข</Text>
                </VStack>
                <select
                  value={previewRole?.id ?? ""}
                  onChange={(e) => setPreviewRoleId(Number(e.target.value))}
                  style={{
                    fontSize: "0.78rem", padding: "5px 10px", borderRadius: 8,
                    border: "1px solid var(--cmms-border)", background: "#fff", cursor: "pointer",
                  }}
                  aria-label="เลือกบทบาทสำหรับพรีวิว"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </HStack>

              {/* กรอบโทรศัพท์ */}
              <div style={{ background: "#0f172a", borderRadius: 34, padding: 10, boxShadow: "0 20px 40px -12px rgba(15,23,42,.35)", width: 264, margin: "0 auto" }}>
                <div style={{
                  background: "#fff", borderRadius: 24, overflow: "hidden",
                  display: "flex", flexDirection: "column", minHeight: 480,
                }}>
                  {/* status bar */}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 16px 4px", fontSize: 10, fontWeight: 700, color: "#334155" }}>
                    <span>9:41</span>
                    <span>📶 🔋</span>
                  </div>
                  {/* app header */}
                  <div style={{ background: previewColor.fg, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: 6, background: "#fff", display: "inline-flex",
                      alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, color: previewColor.fg,
                    }}>C</span>
                    <span style={{ color: "#fff", fontWeight: 800, fontSize: 12 }}>CMMS-TOPPAN</span>
                    <span style={{ marginLeft: "auto", background: "rgba(255,255,255,.25)", borderRadius: 999, padding: "2px 8px", fontSize: 9, fontWeight: 700, color: "#fff" }}>
                      {previewRole?.name || "-"}
                    </span>
                  </div>
                  {/* เนื้อหาจำลอง */}
                  <div style={{ flex: 1, padding: 14, background: "#f1f5f9", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ height: 12, width: "55%", background: "#e2e8f0", borderRadius: 6 }} />
                    <div style={{ height: 8, width: "85%", background: "#e2e8f0", borderRadius: 4 }} />
                    <div style={{ height: 8, width: "70%", background: "#e2e8f0", borderRadius: 4 }} />
                    <div style={{ height: 56, background: "#fff", borderRadius: 10, marginTop: 4, border: "1px solid #e2e8f0" }} />
                    <div style={{ height: 56, background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0" }} />
                    <div style={{ height: 56, background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0" }} />
                  </div>
                  {/* ปุ่มล่างจำลอง (เดียวกับ cmms-mobile-bottom-nav) */}
                  <div style={{ display: "flex", borderTop: "1px solid #e2e8f0", background: "#fff", padding: "7px 2px 9px" }}>
                    {previewItems.length === 0 && (
                      <div style={{ flex: 1, textAlign: "center", fontSize: 10, color: "#94a3b8", padding: "8px 0" }}>
                        ยังไม่มีปุ่ม — จะใช้ค่าเริ่มต้นของบทบาท
                      </div>
                    )}
                    {previewItems.map((it) => {
                      const ItemIcon = it.icon;
                      return (
                        <div
                          key={it.key}
                          title={`${it.label}${it.hidden ? " (เมนูถูกปิดสิทธิ์ → ไม่แสดงจริง)" : ""}`}
                          style={{
                            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                            color: it.hidden ? "#cbd5e1" : it.active ? previewColor.fg : "#94a3b8",
                            opacity: it.hidden ? 0.4 : 1,
                            minWidth: 0, padding: "0 2px",
                          }}
                        >
                          {ItemIcon ? <ItemIcon className="w-5 h-5" /> : <span style={{ width: 20, height: 20, borderRadius: 4, background: "#e2e8f0" }} />}
                          <span style={{
                            fontSize: 8, fontWeight: 700, whiteSpace: "nowrap",
                            overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%",
                          }}>
                            {it.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <VStack gap={1}>
                {previewKeys.length > MAX_BN && (
                  <Text type="body" size="sm" style={{ color: "#b45309", fontWeight: 600 }}>
                    ⚠️ {previewKeys.length} ปุ่ม — เกินที่แนะนำ ({MAX_BN}) ปุ่มจะเล็กลงบนมือถือจริง
                  </Text>
                )}
                {previewItems.some((it) => it.hidden) && (
                  <Text type="body" size="sm" style={{ color: "#b45309", fontWeight: 600 }}>
                    ⚠️ ปุ่มจาง = เมนูถูกปิดสิทธิ์ จะไม่แสดงบนมือถือจริง
                  </Text>
                )}
                <Text type="body" size="sm" color="secondary">
                  แถบนี้ตรงกับแถบล่างสุดของแอปบนมือถือ — เรียงจากซ้ายไปขวาตามลำดับปุ่ม
                </Text>
              </VStack>
            </VStack>
          </Card>
        </div>
      </div>

      <Card padding={3} style={{ background: "var(--cmms-bg-muted)", border: "1px dashed var(--cmms-border)" }}>
        <VStack gap={1}>
          <Text type="body" size="sm" weight="bold">หมายเหตุ</Text>
          <Text type="body" size="sm" color="secondary">
            • ติ๊ก = เมนูนี้แสดงกับบทบาทนั้น ・ ว่าง = ซ่อนเมนู (ปุ่มล่างที่เมนูถูกปิดจะไม่แสดงบนมือถือ)
            {" "}• ปุ่มล่างถ้ายังไม่ตั้งค่า (การ์ดว่าง) จะใช้ค่าเริ่มต้นของบทบาท
            {" "}• การเปลี่ยนแปลงมีผลกับผู้ใช้ที่เปิดแอปใหม่ (รีเฟรช/เข้าสู่ระบบใหม่)
          </Text>
        </VStack>
      </Card>
    </VStack>
  );
}
