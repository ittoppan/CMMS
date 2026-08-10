"use client";

import { useState, useEffect, useMemo } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { CheckCircleIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

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

// สีแถวบทบาท (ตามสี badge sidebar เดิม)
const ROLE_COLOR: Record<string, { bg: string; fg: string }> = {
  Admin: { bg: "#ffe4e6", fg: "#e11d48" },
  Manager: { bg: "#fef3c7", fg: "#d97706" },
  Technician: { bg: "#e0e7ff", fg: "#4f46e5" },
  Operator: { bg: "#dcfce7", fg: "#16a34a" },
  Viewer: { bg: "#f1f5f9", fg: "#64748b" },
};

export default function MenuPermissionsPage() {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [perms, setPerms] = useState<Record<number, Record<string, number>>>({});
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

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      for (const role of roles) {
        if (!perms[role.id]) continue;
        const res = await fetch("/api/v1/menu_permissions.php", {
          method: "POST",
          headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
          body: JSON.stringify({ role_id: role.id, grants: perms[role.id] }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `บันทึกบทบาท ${role.name} ไม่สำเร็จ`);
        }
      }
      setSaveMsg("บันทึกสิทธิ์เมนูทั้งหมดสำเร็จ — ผู้ใช้ที่เข้าสู่ระบบใหม่จะเห็นเมนูตามบทบาททันที");
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

  return (
    <VStack gap={6}>
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
            <Heading level={2}>สิทธิ์เมนูตามบทบาท (PWA)</Heading>
            <Badge label={`${menus.length} เมนู × ${roles.length} บทบาท`} variant="info" />
          </HStack>
          <Text type="body" color="secondary">
            เลือกว่าแต่ละบทบาทเห็นเมนูใดในแอป — เช่น ช่างเห็น "งานซ่อมของฉัน" หัวหน้าเห็น "ศูนย์เบิก-จ่าย (อนุมัติอะไหล่)"
          </Text>
        </VStack>
        <Button label={`บันทึกการตั้งค่า`} variant="primary" isLoading={saving} onClick={handleSave} />
      </HStack>

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

      <Card padding={3} style={{ background: "var(--cmms-bg-muted)", border: "1px dashed var(--cmms-border)" }}>
        <VStack gap={1}>
          <Text type="body" size="sm" weight="bold">หมายเหตุ</Text>
          <Text type="body" size="sm" color="secondary">
            • ติ๊ก = เมนูนี้แสดงกับบทบาทนั้น ・ ว่าง = ซ่อนเมนู
            {" "}• เมนูที่ไม่ได้ตั้งค่าไว้จะแสดงเป็นค่าเริ่มต้น (เห็นทั้งหมด)
            {" "}• การเปลี่ยนแปลงมีผลกับผู้ใช้ที่เปิดแอปใหม่ (รีเฟรช/เข้าสู่ระบบใหม่)
          </Text>
        </VStack>
      </Card>
    </VStack>
  );
}
