"use client";

// settings/notification-prefs — การแจ้งเตือนของฉัน (per-user matrix: type × channel)
// อ่าน/บันทึก จริงผ่าน /api/v1/notifications.php (notification_preferences)

import { useEffect, useMemo, useState, useCallback } from "react";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CheckCheck, Info, Settings2 } from "lucide-react";
import { fetchMeta, fetchPreferences, savePreferences, dispatchNotificationsChanged, type NotifMeta } from "@/lib/notifications";

const CHANNEL_LABEL: Record<string, { th: string; en: string; note: string }> = {
  app: { th: "ในแอป (Inbox)", en: "In-App", note: "แจ้งในกล่องข้อความ + กระดิ่ง" },
  line: { th: "LINE", en: "LINE", note: "ส่งผ่าน LINE Notify / Rich Menu" },
  email: { th: "อีเมล", en: "Email", note: "อีเมลตามที่อยู่ในโปรไฟล์" },
  telegram: { th: "Telegram", en: "Telegram", note: "Telegram Admin Alert" },
  push: { th: "Web Push", en: "Web Push", note: "Push เบราว์เซอร์ (ถ้าอนุญาต)" },
};

const MASTER_SWITCH: Record<string, string> = {
  line: "line_notify_enabled",
  email: "email_notify_enabled",
  telegram: "telegram_enabled",
  push: "push_alert_enabled",
};

export default function NotificationPrefsPage() {
  const [meta, setMeta] = useState<NotifMeta | null>(null);
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [m, p] = await Promise.all([fetchMeta(), fetchPreferences()]);
        setMeta(m);
        const initial: Record<string, Record<string, boolean>> = {};
        for (const t of m.types) {
          initial[t] = {};
          for (const c of m.channels) initial[t][c] = p.rows[t]?.[c] ?? true;
        }
        setMatrix(initial);
      } catch {
        setError("ไม่สามารถโหลดการตั้งค่าการแจ้งเตือนได้");
      }
      setLoaded(true);
    })();
  }, []);

  const toggle = (type: string, channel: string, on: boolean) => {
    setMatrix((prev) => ({ ...prev, [type]: { ...prev[type], [channel]: on } }));
  };

  const allTypesOn = useCallback(
    (channel: string) => meta?.types.every((t) => matrix[t]?.[channel] !== false) ?? false,
    [meta, matrix]
  );

  const setChannelAll = (channel: string, on: boolean) => {
    setMatrix((prev) => {
      const next: Record<string, Record<string, boolean>> = {};
      for (const t of meta?.types ?? []) next[t] = { ...prev[t], [channel]: on };
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSavedMsg("");
    try {
      const rows: { type: string; channel: string; enabled: boolean }[] = [];
      for (const t of meta?.types ?? []) for (const c of meta?.channels ?? []) rows.push({ type: t, channel: c, enabled: matrix[t]?.[c] ?? true });
      await savePreferences(rows);
      dispatchNotificationsChanged();
      setSavedMsg("บันทึกค่าการแจ้งเตือนของฉันแล้ว");
      setTimeout(() => setSavedMsg(""), 5000);
    } catch {
      setError("บันทึกไม่สำเร็จ");
    }
    setSaving(false);
  };

  const typeDot: Record<string, string> = useMemo(() => ({
    work_order: "var(--cmms-primary)", priority: "var(--cmms-danger)",
    sla: "var(--cmms-warning)", pm: "var(--cmms-info)", inspection: "var(--cmms-success)",
    spare_part: "var(--cmms-warning)", request: "var(--cmms-primary)",
    system: "var(--cmms-text-secondary)", calibration: "var(--cmms-info)", maintenance: "var(--cmms-success)",
  }), []);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center gap-3" style={{ padding: 60 }}>
        <Spinner size={20} />
        <p className="text-sm text-muted-foreground">กำลังโหลดการตั้งค่า...</p>
      </div>
    );
  }

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">NOTIFICATION PREFERENCES · CMMS-TOPPAN</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ตั้งค่า", href: "/settings" }, { label: "การแจ้งเตือนของฉัน" }]}
      title="การแจ้งเตือนของฉัน"
      description="เลือกว่าต้องการรับการแจ้งเตือนแต่ละประเภทผ่านช่องทางใด — ติ๊ก = รับการแจ้งเตือน (ค่าเริ่มต้นเปิดทั้งหมด)"
      actions={
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </Button>
      }
    >
      <div className="space-y-4 pb-24 lg:pb-8">
        {(error || savedMsg) && (
          <Alert
            variant={error ? "danger" : "success"}
            title={error ? "Error" : "สำเร็จ"}
            description={error || savedMsg}
          />
        )}

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-info-light)] text-[var(--cmms-info)]">
                <Settings2 size={18} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold">แมทริกซ์การรับแจ้งเตือน</h3>
                <p className="text-sm text-muted-foreground">
                  ใช้กับตัวเอง (ผู้ใช้ปัจจุบัน) — ช่องทางที่สวิตช์กลางระบบปิดอยู่จะไม่ส่ง แม้ติ๊กไว้ เรียงตามหมวดการแจ้งเตือน
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `minmax(210px, 2.4fr) repeat(${meta?.channels.length ?? 0}, minmax(120px, 1fr))`,
                  gap: 8,
                  alignItems: "center",
                  minWidth: 680,
                }}
              >
                {/* header */}
                <div />
                {meta?.channels.map((c) => (
                  <div key={c} className="flex flex-col items-center gap-1.5 py-2">
                    <span className="text-center text-sm font-bold text-foreground">
                      {CHANNEL_LABEL[c]?.th ?? c}
                    </span>
                    <span className="text-center text-[0.68rem] text-muted-foreground">
                      {CHANNEL_LABEL[c]?.note ?? ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => setChannelAll(c, !allTypesOn(c))}
                      className="text-[0.7rem] font-semibold text-[var(--cmms-primary)] underline-offset-2 hover:underline"
                    >
                      {allTypesOn(c) ? "ปิดทั้งหมด" : "เปิดทั้งหมด"}
                    </button>
                  </div>
                ))}

                {/* rows */}
                {meta?.types.map((t) => (
                  <div key={t} className="contents">
                    <div
                      className="flex items-center gap-2.5"
                      style={{ borderTop: "1px solid var(--cmms-border)", padding: "10px 2px" }}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: typeDot[t] ?? "var(--cmms-text-secondary)" }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{meta.type_labels[t]?.th ?? t}</p>
                        <p className="truncate text-[0.68rem] text-muted-foreground">{t}</p>
                      </div>
                    </div>
                    {meta.channels.map((c) => (
                      <div key={c} className="flex justify-center" style={{ borderTop: "1px solid var(--cmms-border)", padding: "10px 0" }}>
                        <Switch
                          checked={matrix[t]?.[c] ?? true}
                          onCheckedChange={(on) => toggle(t, c, on)}
                          aria-label={`${meta.type_labels[t]?.th ?? t} — ${CHANNEL_LABEL[c]?.th ?? c}`}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Info size={15} strokeWidth={1.75} aria-hidden="true" className="text-[var(--cmms-info)]" />
                หมายเหตุ
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                  ปิด <Badge variant="neutral">ในแอป (Inbox)</Badge> = ระบบจะไม่สร้างข้อความในศูนย์แจ้งเตือนและกระดิ่งสำหรับประเภทนั้น
                </li>
                <li>
                  {Object.entries(CHANNEL_LABEL)
                    .filter(([k]) => MASTER_SWITCH[k])
                    .map(([k, v]) => `${v.th} (${MASTER_SWITCH[k]})`)
                    .join(" · ")}{" "}
                  — สวิตช์กลางควบคุมในหน้าตั้งค่าระบบ (ไม่ได้อยู่ในหน้านี้)
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            <CheckCheck size={16} strokeWidth={1.75} aria-hidden="true" />
            {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}