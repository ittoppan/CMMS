"use client";

/**
 * PushTemplateEditor — ตั้งค่ารูปแบบข้อความแจ้งเตือน (Web Push / PWA + ทุกช่องทาง)
 * ข้อมูลมาจาก notification_templates (module:event) — ตัวแปร {var} แทนค่าแท้จากระบบ
 * ปุ่มทดสอบส่ง Web Push ถึงผู้ที่กำลังล็อกอิน (อุปกรณ์ที่อนุญาตไว้)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { VStack, HStack } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Send, Smartphone, RefreshCw } from "lucide-react";

interface Tpl {
  id: number;
  module: string;
  event: string;
  title_template: string;
  message_template: string;
  priority: string;
  url_template: string;
  enabled: string | number;
  sample_vars: Record<string, string>;
}
interface Meta {
  push_enabled: boolean;
  line_enabled: boolean;
  email_enabled: boolean;
  subscriptions: number;
}

const MODULE_LABELS: Record<string, string> = {
  repair: "งานซ่อม (Work Order)",
  pm_am: "PM/AM",
  inspections: "การตรวจสอบ",
  spare_parts: "อะไหล่",
  spare_optimization: "การจัดการสต็อก",
  maintenance_requests: "คำขอซ่อม",
  calibration: "สอบเทียบ",
  system: "ระบบ",
  budget: "งบประมาณ",
  asset_reliability: "ความน่าเชื่อถือเครื่องจักร",
  reliability: "ความน่าเชื่อถือ (วิเคราะห์)",
  contractor: "ผู้รับจ้าง",
  document: "เอกสาร",
  engineering_change: "เปลี่ยนแปลงวิศวกรรม",
  iot: "IoT / เฝ้าระวัง",
  knowledge: "ศูนย์ความรู้",
  rca: "วิเคราะห์รากเหตุ (RCA)",
  work_permit: "ใบอนุญาตทำงาน",
  workforce: "ช่าง & กำลังคน",
};
const PRIORITY_LABELS: Record<string, string> = {
  critical: "วิกฤต (แดง)", high: "สูง", medium: "กลาง", low: "ต่ำ", info: "ข้อมูล",
};

const fill = (text: string, vars: Record<string, string>) =>
  (text || "").replace(/\{([a-z_0-9]+)\}/gi, (m, k) => (vars[k] ?? m));

export default function PushTemplateEditor() {
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [openModule, setOpenModule] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(0);
  const [testingId, setTestingId] = useState(0);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [err, setErr] = useState("");
  const [drafts, setDrafts] = useState<Record<number, Tpl>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/v1/notifications.php?action=templates");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "โหลดไม่สำเร็จ");
      setTpls(json.items ?? []);
      setMeta({
        push_enabled: !!json.push_enabled,
        line_enabled: !!json.line_enabled,
        email_enabled: !!json.email_enabled,
        subscriptions: json.subscriptions ?? 0,
      });
    } catch (e: any) {
      setErr(e.message || "โหลดรูปแบบข้อความไม่สำเร็จ");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const draft = (t: Tpl): Tpl => drafts[t.id] ?? t;
  const setField = (t: Tpl, key: keyof Tpl, v: string) => {
    setDrafts((d) => ({ ...d, [t.id]: { ...draft(t), [key]: v } as Tpl }));
  };
  const dirty = useMemo(
    () => Object.values(drafts).filter((d) => {
      const orig = tpls.find((t) => t.id === d.id);
      return orig && (orig.title_template !== d.title_template || orig.message_template !== d.message_template || orig.priority !== d.priority || orig.url_template !== d.url_template);
    }),
    [drafts, tpls],
  );

  const save = async (t: Tpl) => {
    setSavingId(t.id);
    setFlash(null);
    try {
      const res = await fetch("/api/v1/notifications.php?action=template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft(t)),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "บันทึกไม่สำเร็จ");
      setDrafts((d) => { const c = { ...d }; delete c[t.id]; return c; });
      setFlash({ ok: true, text: `บันทึกรูปแบบ ${MODULE_LABELS[t.module] ?? t.module} / ${t.event} แล้ว` });
      load();
    } catch (e: any) {
      setFlash({ ok: false, text: e.message || "บันทึกไม่สำเร็จ" });
    }
    setSavingId(0);
  };

  const test = async (t: Tpl) => {
    setTestingId(t.id);
    setFlash(null);
    try {
      // ส่งทดสอบด้วยสิ่งที่กำลังแก้อยู่ (ยังไม่ต้องบันทึก)
      await fetch("/api/v1/notifications.php?action=template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft(t)),
      });
      const res = await fetch("/api/v1/notifications.php?action=test_push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id }),
      });
      const json = await res.json();
      setFlash({ ok: res.ok && json.success !== false, text: json.message || json.error || "ส่งทดสอบแล้ว" });
    } catch (e: any) {
      setFlash({ ok: false, text: e.message || "ส่งทดสอบไม่สำเร็จ" });
    }
    setTestingId(0);
  };

  const byModule = useMemo(() => {
    const g: Record<string, Tpl[]> = {};
    for (const t of tpls) (g[t.module] ??= []).push(t);
    return g;
  }, [tpls]);

  if (loading) {
    return <Card><CardContent className="flex items-center gap-3 p-6"><Spinner size={18} /> <span className="text-sm text-muted-foreground">โหลดรูปแบบข้อความ…</span></CardContent></Card>;
  }
  if (err) {
    return <Alert variant="danger" title="เกิดข้อผิดพลาด" description={err} />;
  }

  return (
    <VStack gap={5}>
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <HStack gap={3} vAlign="center">
              <h2 className="text-base font-semibold">รูปแบบข้อความแจ้งเตือน</h2>
              <Badge variant={meta?.push_enabled ? "success" : "neutral"}>
                {meta?.push_enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}
              </Badge>
              <Badge variant="info">
                <Smartphone className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                อุปกรณ์รับแจ้งเตือน: {meta?.subscriptions ?? 0}
              </Badge>
            </HStack>
            <Button variant="secondary" size="sm" onClick={load} aria-label="โหลดใหม่">
              <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              โหลดใหม่
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            รูปแบบเดียว ใช้กับทุกช่องทาง — แจ้งเตือนบนหน้าเว็บ (App), Web Push บนมือถือ/เดสก์ท็อป, อีเมล, และ LINE (เมื่อเปิด)
            ใส่ตัวแปรรูปแบบ {"{"}ชื่อตัวแปร{"}"} เช่น {"{work_order_no}"} {"{asset_name}"} — ระบบแทนค่าจริงตอนเกิดเหตุการณ์
          </p>
          {flash && (
            <Alert variant={flash.ok ? "success" : "danger"} title={flash.ok ? "สำเร็จ" : "ไม่สำเร็จ"} description={flash.text} />
          )}
          {dirty.length > 0 && (
            <span className="block text-sm text-warning">มี {dirty.length} รูปแบบที่แก้ไขยังไม่บันทึก</span>
          )}
        </CardContent>
      </Card>

      {Object.entries(byModule).map(([mod, list]) => {
        const open = openModule === mod || dirty.some((d) => list.some((t) => t.id === d.id));
        return (
          <Card key={mod}>
            <CardContent className="divide-y divide-border p-0">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-5 text-left"
                onClick={() => setOpenModule(open ? "" : mod)}
                aria-expanded={open}
              >
                <HStack gap={3} vAlign="center">
                  <h3 className="text-sm font-semibold">{MODULE_LABELS[mod] ?? mod}</h3>
                  <Badge variant="neutral">{list.length} รูปแบบ</Badge>
                </HStack>
                <span className="text-sm text-muted-foreground">{open ? "▾" : "▸"}</span>
              </button>
              {open && (
                <VStack gap={0} className="pt-1">
                  {list.map((t) => (
                    <TemplateRow key={t.id} t={t} onSet={setField} onSave={save} onTest={test} saving={savingId === t.id} testing={testingId === t.id} />
                  ))}
                </VStack>
              )}
            </CardContent>
          </Card>
        );
      })}
    </VStack>
  );
}

function TemplateRow({
  t, onSet, onSave, onTest, saving, testing,
}: {
  t: Tpl;
  onSet: (t: Tpl, k: keyof Tpl, v: string) => void;
  onSave: (t: Tpl) => void;
  onTest: (t: Tpl) => void;
  saving: boolean;
  testing: boolean;
}) {
  const d = t as Tpl;
  const sample = d.sample_vars ?? {};
  const priority = d.priority === "" ? "info" : (PRIORITY_LABELS[d.priority] ? d.priority : "info");
  return (
    <div className="space-y-3 px-5 pb-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{MODULE_LABELS[d.module] ?? d.module} · {d.event}</span>
        <Badge variant={String(d.enabled) === "1" ? "success" : "neutral"}>
          {String(d.enabled) === "1" ? "ใช้อยู่" : "ปิด"}
        </Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
        <div>
          <label className="text-xs text-muted-foreground" htmlFor={`title-${d.id}`}>หัวข้อแจ้งเตือน</label>
          <Input id={`title-${d.id}`} value={d.title_template} onChange={(e) => onSet(t, "title_template", e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground" htmlFor={`prio-${d.id}`}>ความสำคัญ</label>
          <select
            id={`prio-${d.id}`}
            className="h-9 w-full rounded-[var(--cmms-radius-sm)] border bg-[var(--cmms-bg-card)] px-2 text-sm"
            value={priority}
            onChange={(e) => onSet(t, "priority", e.target.value)}
          >
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground" htmlFor={`msg-${d.id}`}>ข้อความ</label>
        <Textarea id={`msg-${d.id}`} rows={3} value={d.message_template} onChange={(e) => onSet(t, "message_template", e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-muted-foreground" htmlFor={`url-${d.id}`}>ลิงก์เมื่อกดแจ้งเตือน</label>
        <Input id={`url-${d.id}`} className="font-mono text-xs" value={d.url_template} onChange={(e) => onSet(t, "url_template", e.target.value)} />
      </div>
      {Object.keys(sample).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {Object.keys(sample).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onSet(t, "message_template", `${d.message_template} {${v}}`)}
              className="rounded-full border bg-muted px-2 py-0.5 text-[11px] font-mono"
              title="กดเพื่อแทรกตัวแปร"
            >
              {`{${v}}`}
            </button>
          ))}
        </div>
      )}
      {/* พรีวิวสไตล์ notification push */}
      <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3" aria-hidden="true">
        <div className="mt-1 rounded-lg bg-[var(--cmms-primary)] px-2 py-1 text-[10px] font-bold text-white">CMMS</div>
        <VStack gap={0.5}>
          <span className="truncate text-sm font-semibold">{fill(d.title_template, sample) || "(ไม่มีหัวข้อ)"}</span>
          <span className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{fill(d.message_template, sample) || "(ไม่มีข้อความ)"}</span>
        </VStack>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">ตอนนี้</span>
      </div>
      <HStack gap={2}>
        <Button size="sm" onClick={() => onSave(t)} disabled={saving}>
          {saving ? <Spinner size={14} /> : null}
          บันทึก
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onTest(t)} disabled={testing} title="บันทึก + ส่ง push ทดสอบถึงอุปกรณ์ฉัน">
          {testing ? <Spinner size={14} /> : <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
          ส่งทดสอบถึงฉัน
        </Button>
      </HStack>
    </div>
  );
}
