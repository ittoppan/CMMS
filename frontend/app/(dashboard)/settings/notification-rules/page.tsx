"use client";

// settings/notification-rules — กฎการแจ้งเตือนอัตโนมัติ (admin/supervisor)
// อ่าน/บันทึกจริงผ่าน /api/v1/notifications.php (notification_rules)
// เครื่องมืออ่านตอนนี้: scripts/notification_engine.php (scheduler) + hooks ใน supervisor/repair

import { useEffect, useMemo, useState, useCallback } from "react";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Plus, Pencil, Trash2, Clock, Repeat, Layers, ShieldCheck } from "lucide-react";
import { fetchRules, saveRule, deleteRule, fetchMeta, type NotifRule, type NotifMeta, type NotifChannel } from "@/lib/notifications";

const MODULES: Record<string, string> = {
  repair: "งานซ่อม (WO)",
  maintenance_requests: "คำขอแจ้งซ่อม",
  pm_am: "แผน PM/AM",
  spare_parts: "อะไหล่/สต็อก",
  calibration: "สอบเทียบ",
  inspections: "ตรวจเช็ครอบ",
};

const EVENTS_BY_MODULE: Record<string, string[]> = {
  repair: ["*", "created", "accepted", "assigned", "paused", "resumed", "completed", "reopened", "verified", "closed", "sla_at_risk", "sla_breached", "escalated"],
  maintenance_requests: ["*", "created", "approved", "rejected"],
  pm_am: ["*", "due", "overdue"],
  spare_parts: ["*", "low_stock"],
  calibration: ["*", "due"],
  inspections: ["*", "failed"],
};

const CHANNEL_LABEL: Record<string, string> = {
  app: "ในแอป (Inbox)",
  line: "LINE",
  email: "อีเมล",
  telegram: "Telegram",
  push: "Web Push",
};

const badgeVariant: Record<string, "danger" | "warning" | "primary" | "neutral"> = {
  critical: "danger",
  high: "warning",
  medium: "primary",
  low: "neutral",
  info: "neutral",
};

function parseList(v: string | null | undefined): string[] {
  if (!v) return [];
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}

type RuleRow = NotifRule & {
  channels_json?: string;
  recipients_role_json?: string;
  recipients_user_json?: string;
};

interface FormState {
  name: string;
  module: string;
  event: string;
  priority: string;
  channels: NotifChannel[];
  recipients_role: string[];
  delay_minutes: string;
  repeat_every_minutes: string;
  max_repeats: string;
  dedup_hours: string;
  notify_creator: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  module: "repair",
  event: "*",
  priority: "medium",
  channels: ["app"],
  recipients_role: ["1"],
  delay_minutes: "0",
  repeat_every_minutes: "0",
  max_repeats: "1",
  dedup_hours: "24",
  notify_creator: false,
};

export default function NotificationRulesPage() {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [meta, setMeta] = useState<NotifMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, m] = await Promise.all([fetchRules(), fetchMeta()]);
      setRules(r as RuleRow[]);
      setMeta(m);
    } catch {
      setError("ไม่สามารถโหลดกฎการแจ้งเตือนได้");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (rule: RuleRow) => {
    setEditingId(rule.id ?? null);
    setForm({
      name: rule.name ?? "",
      module: rule.module ?? "repair",
      event: rule.event ?? "*",
      priority: rule.priority ?? "medium",
      channels: parseList(rule.channels_json ?? String(rule.channels ?? "")) as NotifChannel[],
      recipients_role: parseList(rule.recipients_role_json ?? String(rule.recipients_role ?? "")),
      delay_minutes: String(rule.delay_minutes ?? 0),
      repeat_every_minutes: String(rule.repeat_every_minutes ?? 0),
      max_repeats: String(rule.max_repeats ?? 1),
      dedup_hours: String(rule.dedup_hours ?? 24),
      notify_creator: Boolean(rule.notify_creator),
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.module) {
      setError("ต้องระบุชื่อกฎและหมวด");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveRule({
        id: editingId ?? undefined,
        name: form.name.trim(),
        module: form.module,
        event: form.event || "*",
        priority: form.priority,
        channels: form.channels.length ? form.channels : ["app"],
        recipients_role: form.recipients_role.length ? form.recipients_role.map(Number) : [],
        delay_minutes: Number(form.delay_minutes || 0),
        repeat_every_minutes: Number(form.repeat_every_minutes || 0),
        max_repeats: Math.max(1, Number(form.max_repeats || 1)),
        dedup_hours: Math.max(1, Number(form.dedup_hours || 24)),
        notify_creator: form.notify_creator,
        enabled: 1,
      });
      setFormOpen(false);
      await load();
      setSavedMsg(editingId ? "อัปเดตกฎแล้ว" : "สร้างกฎใหม่แล้ว");
      setTimeout(() => setSavedMsg(""), 4000);
    } catch {
      setError("บันทึกกฎไม่สำเร็จ");
    }
    setSaving(false);
  };

  const handleDelete = async (rule: RuleRow) => {
    if (!rule.id) return;
    if (!window.confirm(`ลบกฎ "${rule.name}" ?`)) return;
    setError(null);
    try {
      await deleteRule(rule.id);
      await load();
      setSavedMsg("ลบกฎแล้ว");
      setTimeout(() => setSavedMsg(""), 4000);
    } catch {
      setError("ลบกฎไม่สำเร็จ");
    }
  };

  const handleToggleEnabled = async (rule: RuleRow, on: boolean) => {
    try {
      await saveRule({ id: rule.id, enabled: on ? 1 : 0 });
      await load();
    } catch {
      setError("เปลี่ยนสถานะกฎไม่สำเร็จ");
    }
  };

  const columns: SimpleColumn<RuleRow>[] = [
    {
      key: "name",
      header: "กฎ",
      renderCell: (r) => (
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-foreground">{r.name}</p>
          <p className="text-xs text-muted-foreground">Rule #{r.id}</p>
        </div>
      ),
    },
    {
      key: "module",
      header: "หมวด / เหตุการณ์",
      renderCell: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="primary" className="normal-case tracking-normal">{MODULES[String(r.module ?? "")] ?? r.module}</Badge>
          <span className="text-xs font-bold text-muted-foreground">{String(r.event)}</span>
        </div>
      ),
    },
    {
      key: "priority",
      header: "ระดับ",
      renderCell: (r) => (
        <Badge variant={badgeVariant[r.priority ?? "info"] ?? "neutral"} className="normal-case tracking-normal">
          {String((r.priority ?? "info").toUpperCase())}
        </Badge>
      ),
    },
    {
      key: "channels",
      header: "ช่องทาง",
      renderCell: (r) => {
        const chs = parseList(r.channels_json ?? (r.channels ? String(r.channels) : ""));
        return (
          <div className="flex flex-wrap gap-1">
            {chs.length === 0 && <span className="text-xs text-muted-foreground">-</span>}
            {chs.map((c) => (
              <Badge key={c} variant="neutral" className="normal-case tracking-normal">{CHANNEL_LABEL[c] ?? c}</Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: "recipients",
      header: "ผู้รับ",
      renderCell: (r) => {
        const roles = parseList(r.recipients_role_json ?? (r.recipients_role ? String(r.recipients_role) : ""))
          .map((x) => meta?.roles.find((ro) => ro.id === Number(x))?.name ?? x);
        return (
          <div className="flex flex-wrap items-center gap-1">
            {roles.length === 0 ? <span className="text-xs text-muted-foreground">ตาม hook</span> : roles.map((n) => (
              <Badge key={n} variant="neutral" className="normal-case tracking-normal">{n}</Badge>
            ))}
            {Boolean(r.notify_creator) && <Badge variant="info" className="normal-case tracking-normal">+ผู้แจ้ง</Badge>}
          </div>
        );
      },
    },
    {
      key: "timing",
      header: "ดีเลย์ / ซ้ำ / Dedup",
      renderCell: (r) => (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock size={13} strokeWidth={1.75} aria-hidden="true" />{r.delay_minutes || 0}m</span>
          <span className="flex items-center gap-1"><Repeat size={13} strokeWidth={1.75} aria-hidden="true" />{r.max_repeats || 1}x</span>
          <span className="flex items-center gap-1"><Layers size={13} strokeWidth={1.75} aria-hidden="true" />{r.dedup_hours || 24}h</span>
        </div>
      ),
    },
    {
      key: "enabled",
      header: "เปิด/ปิด",
      renderCell: (r) => (
        <Switch
          checked={Number(r.enabled) === 1}
          onCheckedChange={(on) => handleToggleEnabled(r, on)}
          aria-label={`เปิด/ปิดกฎ ${r.name}`}
        />
      ),
    },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      renderCell: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="secondary" size="sm" onClick={() => openEdit(r)}>
            <Pencil size={13} strokeWidth={1.75} aria-hidden="true" />
            แก้ไข
          </Button>
          <Button variant="ghost" size="sm" className="text-[var(--cmms-danger)] hover:text-[var(--cmms-danger)]" onClick={() => handleDelete(r)}>
            <Trash2 size={13} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>
      ),
    },
  ];

  const eventOptions = useMemo(() => EVENTS_BY_MODULE[form.module] ?? ["*"], [form.module]);

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">NOTIFICATION RULES · CMMS-TOPPAN</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ตั้งค่า", href: "/settings" }, { label: "กฎการแจ้งเตือนอัตโนมัติ" }]}
      title="กฎการแจ้งเตือนอัตโนมัติ"
      description="กฎ (rule) ที่ scheduler และ hook เหตุการณ์อ้างอิง: เลือกผู้รับ ช่องทาง ดีเลย์ วนซ้ำ และดีดัป — เฉพาะผู้ดูแล/หัวหน้างาน"
      actions={
        <Button onClick={openCreate}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          สร้างกฎใหม่
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

        {meta && (
          <Card className="border-dashed" style={{ background: "var(--cmms-bg-muted)" }}>
            <CardContent className="flex flex-wrap items-start gap-3 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary)]">
                <ShieldCheck size={17} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-semibold text-foreground">เครื่องมือที่อ่านกฎนี้</p>
                <p className="text-sm text-muted-foreground">
                  scripts/notification_engine.php (scheduler: PM, low-stock, SLA, escalation, calibration, inspection, retry)
                  {" · "}hooks เหตุการณ์ใน supervisor/repair — event ที่ระบุตรง (module, event) จะถูกนำมาแทนค่าค่าเริ่มต้น
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-3" style={{ padding: 60 }}>
            <Spinner size={20} />
            <p className="text-sm text-muted-foreground">กำลังโหลดกฎ...</p>
          </div>
        ) : (
          <SimpleDataTable
            columns={columns}
            data={rules}
            idKey="id"
            pageSize={10}
            emptyTitle="ยังไม่มีกฎการแจ้งเตือน"
            emptyDescription="กด “สร้างกฎใหม่” เพื่อเพิ่มกฎตัวแรก"
          />
        )}

        <Dialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title={editingId ? "แก้ไขกฎ" : "สร้างกฎใหม่"}
          description="เลือกเงื่อนไข (module + event) และช่องทางส่งของกฎนี้"
          footer={
            <>
              <Button variant="outline" onClick={() => setFormOpen(false)}>ยกเลิก</Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "สร้างกฎ"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Input label="ชื่อกฎ" isLabelHidden={false} placeholder="เช่น SLA breach → เตือน supervisors" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">หมวด (module)</span>
                <Select value={form.module} onValueChange={(v) => setForm({ ...form, module: v, event: "*" })}>
                  <SelectTrigger aria-label="หมวด">
                    <SelectValue placeholder="เลือกหมวด" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MODULES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">เหตุการณ์ (event)</span>
                <Select value={form.event} onValueChange={(v) => setForm({ ...form, event: v })}>
                  <SelectTrigger aria-label="เหตุการณ์">
                    <SelectValue placeholder="เลือกเหตุการณ์" />
                  </SelectTrigger>
                  <SelectContent>
                    {eventOptions.map((e) => (
                      <SelectItem key={e} value={e}>{e === "*" ? "ทุกเหตุการณ์ (*)" : e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">ระดับความสำคัญ (priority)</span>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger aria-label="ระดับความสำคัญ">
                    <SelectValue placeholder="เลือกระดับ" />
                  </SelectTrigger>
                  <SelectContent>
                    {meta?.priorities.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.toUpperCase()} — {String(meta.priority_labels[p]?.th ?? "")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">ช่องทางส่ง</span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {meta?.channels.map((c) => (
                    <label key={c} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Checkbox
                        checked={form.channels.includes(c)}
                        onCheckedChange={(on) =>
                          setForm({
                            ...form,
                            channels: on === true ? [...form.channels, c] : form.channels.filter((x) => x !== c),
                          })
                        }
                      />
                      {CHANNEL_LABEL[c] ?? c}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">ผู้รับ (บทบาท)</span>
              <div className="flex flex-wrap gap-2">
                {meta?.roles.map((r) => (
                  <label key={r.id} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Checkbox
                      checked={form.recipients_role.includes(String(r.id))}
                      onCheckedChange={(on) =>
                        setForm({
                          ...form,
                          recipients_role: on === true
                            ? [...form.recipients_role, String(r.id)]
                            : form.recipients_role.filter((x) => x !== String(r.id)),
                        })
                      }
                    />
                    {r.name}
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Checkbox
                  checked={form.notify_creator}
                  onCheckedChange={(on) => setForm({ ...form, notify_creator: on === true })}
                />
                + แจ้งผู้ที่สร้าง/เกี่ยวข้องในเหตุการณ์นี้ด้วย
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Input label="ดีเลย์ (นาที)" placeholder="0" type="number" min={0} value={form.delay_minutes} onChange={(e) => setForm({ ...form, delay_minutes: e.target.value })} />
              <Input label="ซ้ำทุก (นาที)" placeholder="0" type="number" min={0} value={form.repeat_every_minutes} onChange={(e) => setForm({ ...form, repeat_every_minutes: e.target.value })} />
              <Input label="ซ้ำสูงสุด (ครั้ง)" placeholder="1" type="number" min={1} value={form.max_repeats} onChange={(e) => setForm({ ...form, max_repeats: e.target.value })} />
              <Input label="Dedup (ชม.)" placeholder="24" type="number" min={1} value={form.dedup_hours} onChange={(e) => setForm({ ...form, dedup_hours: e.target.value })} />
            </div>
          </div>
        </Dialog>
      </div>
    </PageShell>
  );
}