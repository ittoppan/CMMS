"use client";

import { useState, useEffect, useRef } from "react";
import {
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  ShieldCheck,
  Building2,
  User,
  Clock,
  Camera,
  Phone,
  Mail,
  X,
  Paperclip,
  Link,
  Printer,
  Droplets,
  RotateCcw,
  Scissors,
  ShoppingBag,
  Factory,
  Cog,
  Wrench,
  Hammer,
  FileText,
  HardHat,
  Zap,
  CircleHelp,
  Check,
  ShieldAlert,
  Loader2,
  Info,
  AlertCircle,
  CircleCheck,
  CircleX,
  Minus,
  MessageSquare,
  Send,
  Lock,
  Key,
  RefreshCw,
  Home,
  ChevronRight,
  ListChecks,
} from "lucide-react";
import LiffLangToggle from "./LiffLangToggle";
import { tliff, useLiffLang } from "@/lib/i18n-liff";
import { runQueueMigrationOnce, exposeQueueMigration } from "@/lib/queue-migration";
import { serverResponds } from "@/lib/server-check";
import { useToast } from "@/components/ToastProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/* =========================================================
   ฟอร์มแจ้งซ่อม MAINTENANCE JOB REQUEST (F-EN-03)
   - ฟิลด์ผู้แจ้ง / เครื่องจักร / Job Type / Job Description
     อ้างอิงแบบฟอร์ม LIFF ที่ใช้งานจริง + ใบ F-EN-03
   - เพิ่มจุดเด่น F-EN-03: ความเสี่ยงปนเปื้อน (GMP), Safety
   ========================================================= */

type Asset = {
  id: number;
  code: string;
  name: string;
  department: string;
  department_id: number | null;
  criticality: string;
  status: string;
  category: string;
};

type Dept = { id: number; code: string; name: string };

type LineProfile = { name: string; pic: string; userId: string } | null;

// Dynamic options from API
interface RepairOption {
  id: number;
  option_type: string;
  option_value: string;
  option_label: string;
  option_label_en: string | null;
  option_emoji: string | null;
  sort_order: number;
  is_active: boolean;
}

// Icon mapping for fallback constants
const ICON_MAP: Record<string, React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>> = {
  printer: Printer,
  droplets: Droplets,
  "rotate-ccw": RotateCcw,
  scissors: Scissors,
  "shopping-bag": ShoppingBag,
  factory: Factory,
  cog: Cog,
  wrench: Wrench,
  hammer: Hammer,
  file: FileText,
  "hard-hat": HardHat,
  zap: Zap,
  "circle-help": CircleHelp,
  check: Check,
  "shield-alert": ShieldAlert,
  info: Info,
  "alert-circle": AlertCircle,
  "circle-check": CircleCheck,
  "circle-x": CircleX,
  minus: Minus,
  message: MessageSquare,
  send: Send,
  lock: Lock,
  key: Key,
  "refresh-cw": RefreshCw,
  home: Home,
  chevron: ChevronRight,
  camera: Camera,
  phone: Phone,
  mail: Mail,
  user: User,
  clock: Clock,
  building: Building2,
  shield: ShieldCheck,
  triangle: AlertTriangle,
};

function Icon({ name, className, size = 16, strokeWidth = 1.75 }: { name: string; className?: string; size?: number; strokeWidth?: number }) {
  const Comp = ICON_MAP[name] || CircleHelp;
  return <Comp className={className} size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
}

// Default machine groups (fallback if API fails)
const MACHINE_GROUPS = [
  { label: "เครื่องพิมพ์", iconName: "printer", prefix: "A-PT" },
  { label: "ลามิเนต", iconName: "droplets", prefix: "A-DL" },
  { label: "รีไวเดอร์", iconName: "rotate-ccw", prefix: "A-RW" },
  { label: "สลิตเตอร์", iconName: "scissors", prefix: "A-ST" },
  { label: "เครื่องทำถุง", iconName: "shopping-bag", prefix: "A-BM" },
];

// Default options (fallback if API fails)
const DEFAULT_MACHINE_STATUS = [
  { value: "breakdown", label: "Break Down", th: "เครื่องหยุดทำงาน", iconName: "alert-circle", color: "var(--cmms-danger)" },
  { value: "wait", label: "Wait for Maintenance", th: "ยังทำงานได้ รอการซ่อม", iconName: "info", color: "var(--cmms-warning)" },
  { value: "running", label: "Still working", th: "รอโอกาสหยุดเครื่อง (เร็วๆ นี้)", iconName: "circle-check", color: "var(--cmms-success)" },
];

const DEFAULT_JOB_TYPES = [
  { value: "Machinery", label: "เครื่องจักร", en: "Machinery", iconName: "cog", desc: "งานเครื่องจักรผลิต" },
  { value: "Equipment Support", label: "อุปกรณ์สนับสนุน", en: "Equipment Support", iconName: "wrench", desc: "อุปกรณ์ประกอบการผลิต" },
  { value: "Facilities", label: "โครงสร้างพื้นฐาน", en: "Facilities", iconName: "factory", desc: "อาคาร / สาธารณูปโภค" },
  { value: "Other", label: "อื่นๆ", en: "Other", iconName: "message", desc: "งานอื่นที่ไม่อยู่หมวดข้างต้น" },
];

const DEFAULT_JOB_DESCRIPTIONS = [
  { value: "Maintenance", label: "ซ่อมบำรุง", en: "Maintenance", iconName: "hammer" },
  { value: "PM", label: "บำรุงเชิงป้องกัน", en: "PM / Preventive", iconName: "file" },
  { value: "Modify", label: "ปรับปรุง / ดัดแปลง", en: "Modify", iconName: "rotate-ccw" },
  { value: "Build", label: "สร้าง / จัดทำใหม่", en: "Build", iconName: "hard-hat" },
];

const DEFAULT_CONTAMINATE_CHECK = [
  { value: "not_checked", label: "ยังไม่ตรวจ", iconName: "circle-help" },
  { value: "clean", label: "ไม่พบการปนเปื้อน (ผ่าน)", iconName: "circle-check" },
  { value: "contaminated", label: "พบการปนเปื้อน", iconName: "shield-alert" },
  { value: "not_applicable", label: "ไม่เกี่ยวข้องกับงานนี้", iconName: "minus" },
];

const OFFICES = ["โรงงานอมตะซิตี้ (ระยอง)"];

const STEPS = [
  { key: "machine", label: "เครื่องจักร", iconName: "cog" },
  { key: "details", label: "รายละเอียดงาน", iconName: "file" },
  { key: "reporter", label: "ผู้แจ้ง & รูป", iconName: "user" },
  { key: "confirm", label: "ยืนยัน", iconName: "circle-check" },
];

/** ย่อรูปให้พอดีกับ LINE แล้วคืน data URI (max 1000px, JPEG 0.72) */
function resizeImageToDataUri(file: File, maxSize = 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("no ctx")); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => reject(new Error("img load failed"));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

/* ============ Offline Queue (IndexedDB) ============
   ถ้า submit ไม่ออกเพราะไม่มีเน็ต → เก็บไว้ใน queue
   พอออนไลน์กลับมา → ส่งอัตโนมัติ
   ข้อมูลเก็บในเครื่องของผู้ใช้เท่านั้น (ไม่มี secret) */
const QUEUE_DB = "cmms-offline-queue";
const QUEUE_STORE = "submissions";

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) { reject(new Error("no indexeddb")); return; }
    const req = indexedDB.open(QUEUE_DB);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function queueAdd(payload: unknown): Promise<number> {
  return openQueueDb().then((db) =>
    new Promise<number>((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, "readwrite");
      tx.objectStore(QUEUE_STORE).add({ payload, createdAt: Date.now() });
      tx.oncomplete = () => resolve(1);
      tx.onerror = () => reject(tx.error);
    })
  );
}

function queueAll(): Promise<{ id: number; payload: unknown }[]> {
  return openQueueDb().then((db) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, "readonly");
      const req = tx.objectStore(QUEUE_STORE).getAll();
      req.onsuccess = () => resolve((req.result || []) as { id: number; payload: unknown }[]);
      req.onerror = () => reject(req.error);
    })
  );
}

function queueRemove(id: number): Promise<void> {
  return openQueueDb().then((db) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, "readwrite");
      tx.objectStore(QUEUE_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    })
  );
}

export default function RepairRequestForm() {
  useLiffLang();
  const { showToast } = useToast();
  const [step, setStep] = useState(0);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [lineProfile, setLineProfile] = useState<LineProfile>(null);
  const [sessionName, setSessionName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [offlineNow, setOfflineNow] = useState(false);
  const [onlineBack, setOnlineBack] = useState(false);
  const [retryMsg, setRetryMsg] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [createdWoNo, setCreatedWoNo] = useState<string | null>(null);
  const [offlineQueued, setOfflineQueued] = useState(0);
  const [flushingQueue, setFlushingQueue] = useState(false);
  const [queueItems, setQueueItems] = useState<{ id: number; label: string }[]>([]);

  // Dynamic options from API
  const [dynamicOptions, setDynamicOptions] = useState<RepairOption[]>([]);
  const [machineStatusOptions, setMachineStatusOptions] = useState(DEFAULT_MACHINE_STATUS);
  const [jobTypeOptions, setJobTypeOptions] = useState(DEFAULT_JOB_TYPES);
  const [jobDescriptionOptions, setJobDescriptionOptions] = useState(DEFAULT_JOB_DESCRIPTIONS);
  const [contaminateCheckOptions, setContaminateCheckOptions] = useState(DEFAULT_CONTAMINATE_CHECK);
  const [rootCauseOptions, setRootCauseOptions] = useState<{ value: string; label: string; emoji?: string }[]>([]);

  const [lineBound, setLineBound] = useState<boolean | null>(null);
  const [bindGate, setBindGate] = useState<"checking" | "bound" | "unbound" | "anonymous" | "webchoice">("checking");
  const [bindEmpCode, setBindEmpCode] = useState("");
  const [bindError, setBindError] = useState<string | null>(null);
  const [bindSubmitting, setBindSubmitting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const offlineRef = useRef(false);

  const [form, setForm] = useState({
    machineCode: "",
    machineStatus: "",
    jobType: "",
    jobDescription: "",
    symptoms: "",
    lotNo: "",
    contaminateChecking: "not_checked",
    outsourceBy: "",
    reporterName: "",
    departmentCode: "",
    office: OFFICES[0],
    phone: "",
    email: "",
    contaminationRisk: false,
    safetyRelated: false,
    photos: [] as string[],
    note: "",
    isUrgent: false,
  });

  const update = (key: string, value: string | boolean | string[]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const apiFetch = (url: string, init?: RequestInit) => fetch(url, init);

  const qrPrefillRef = useRef<string | null>(null);
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("asset_code");
      if (p) qrPrefillRef.current = p.trim().toUpperCase();
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const update = () => {
      const isOff = !navigator.onLine;
      if (isOff) {
        offlineRef.current = true;
        setOfflineNow(true);
        setOnlineBack(false);
        setRetryMsg("");
      } else if (offlineRef.current) {
        setOnlineBack(true);
        setRetryMsg("");
      }
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  /* ---- โหลดข้อมูล ---- */
  useEffect(() => {
    apiFetch("/api/v1/asset_registry.php")
      .then((r) => r.json())
      .then((rows: Asset[]) => {
        const machines = (Array.isArray(rows) ? rows : [])
          .filter((a) => a.category === "Machine" || /^A-[A-Z]{2}-\d{2}$/.test(a.code))
          .sort((a, b) => a.code.localeCompare(b.code));
        setAssets(machines);
        if (qrPrefillRef.current) {
          const hit = machines.find((m) => m.code === qrPrefillRef.current);
          if (hit) {
            update("machineCode", hit.code);
            setStep((s) => (s === 0 ? 1 : s));
          }
        }
      })
      .catch(() => {});

    apiFetch("/api/v1/departments.php")
      .then((r) => r.json())
      .then((rows: Dept[]) => setDepts(Array.isArray(rows) ? rows : []))
      .catch(() => {});

    apiFetch("/api/v1/repair_options.php")
      .then((r) => r.json())
      .then((rows: RepairOption[]) => {
        if (!Array.isArray(rows)) return;
        setDynamicOptions(rows);

        const machineStatus = rows
          .filter(o => o.option_type === 'machine_status' && o.is_active)
          .map(o => ({
            value: o.option_value,
            label: o.option_label,
            th: o.option_label,
            iconName: o.option_emoji || 'circle-help',
            color: o.option_value === 'breakdown' ? 'var(--cmms-danger)' :
                   o.option_value === 'wait' ? 'var(--cmms-warning)' : 'var(--cmms-success)'
          }));
        if (machineStatus.length > 0) setMachineStatusOptions(machineStatus);

        const jobTypes = rows
          .filter(o => o.option_type === 'job_type' && o.is_active)
          .map(o => ({
            value: o.option_value,
            label: o.option_label,
            en: o.option_label_en || o.option_label,
            iconName: o.option_emoji || 'message',
            desc: o.option_label
          }));
        if (jobTypes.length > 0) setJobTypeOptions(jobTypes);

        const jobDescs = rows
          .filter(o => o.option_type === 'job_description' && o.is_active)
          .map(o => ({
            value: o.option_value,
            label: o.option_label,
            en: o.option_label_en || o.option_label,
            iconName: o.option_emoji || 'file'
          }));
        if (jobDescs.length > 0) setJobDescriptionOptions(jobDescs);

        const contamChecks = rows
          .filter(o => o.option_type === 'contaminate_check' && o.is_active)
          .map(o => ({
            value: o.option_value,
            label: o.option_label,
            iconName: o.option_emoji || 'circle-help'
          }));
        if (contamChecks.length > 0) setContaminateCheckOptions(contamChecks);

        const rootCauses = rows
          .filter(o => o.option_type === 'root_cause' && o.is_active)
          .map(o => ({
            value: o.option_value,
            label: o.option_label,
            iconName: o.option_emoji || 'circle-help'
          }));
        setRootCauseOptions(rootCauses);
      })
      .catch(() => {});

    apiFetch("/api/v1/line_notify.php")
      .then((r) => r.json())
      .then((j) => {
        setSessionName(j?.me?.full_name || "");
        if (j?.me?.id) setBindGate("bound");
      })
      .catch(() => {});

    const applyGate = (uid: string | null, bound: boolean) => {
      setBindGate(bound ? "bound" : uid ? "unbound" : "anonymous");
    };
    const checkBound = async (uid: string): Promise<boolean> => {
      try {
        const r = await fetch(`/api/v1/line_register.php?line_user_id=${encodeURIComponent(uid)}`);
        const j = await r.json().catch(() => ({}));
        return !!(j?.bound && j?.user);
      } catch {
        return false;
      }
    };

    try {
      if (localStorage.getItem("cmms_line_bound") === "1") {
        setLineBound(true);
        setBindGate("bound");
        const boundName = localStorage.getItem("cmms_line_full_name");
        if (boundName) setForm((prev) => ({ ...prev, reporterName: boundName || prev.reporterName }));
      } else {
        const storedUid = localStorage.getItem("cmms_line_user_id");
        if (storedUid) {
          setLineBound(false);
          checkBound(storedUid).then((b) => {
            setLineBound(b);
            applyGate(storedUid, b);
            if (b) {
              try {
                localStorage.setItem("cmms_line_bound", "1");
                const n = localStorage.getItem("cmms_line_full_name");
                if (n) setForm((prev) => ({ ...prev, reporterName: n || prev.reporterName }));
              } catch { /* ignore */ }
            }
          });
        } else {
          window.setTimeout(() => {
            const uid = localStorage.getItem("cmms_line_user_id");
            if (uid) {
              checkBound(uid).then((b) => {
                setLineBound(b);
                applyGate(uid, b);
              });
              return;
            }
            apiFetch("/api/v1/line_notify.php")
              .then((r) => r.json())
              .then((j) => {
                if (j?.me?.id) {
                  setSessionName(j.me.full_name || "");
                  setBindGate("bound");
                } else if ((window as any).liff?.isInClient?.()) {
                  setBindGate("unbound");
                } else {
                  setBindGate("webchoice");
                }
              })
              .catch(() => setBindGate("webchoice"));
          }, 2500);
        }
      }
    } catch { /* ignore */ }

    const simUid = new URLSearchParams(window.location.search).get("uid");
    if (simUid) {
      try { localStorage.setItem("cmms_line_user_id", simUid); } catch { /* ignore */ }
      fetch(`/api/v1/line_register.php?line_user_id=${encodeURIComponent(simUid)}`)
        .then((r) => r.json())
        .then((j) => {
          if (j?.bound && j?.user) {
            setLineBound(true);
            setBindGate("bound");
            setForm((prev) => ({ ...prev, reporterName: j.user.full_name || prev.reporterName }));
            try {
              localStorage.setItem("cmms_line_bound", "1");
              localStorage.setItem("cmms_line_full_name", j.user.full_name || "");
            } catch { /* ignore */ }
          } else {
            setLineBound(false);
            setBindGate("unbound");
          }
        })
        .catch(() => { setLineBound(false); setBindGate("unbound"); });
    }

    const tryLiff = () => {
      try {
        if ((window as any).liff?.isLoggedIn?.()) {
          (window as any).liff.getProfile().then((p: any) => {
            setLineProfile({ name: p.displayName || "", pic: p.pictureUrl || "", userId: p.userId || "" });
            setForm((prev) => ({ ...prev, reporterName: p.displayName || prev.reporterName }));
            if (p.userId) {
              fetch(`/api/v1/line_register.php?line_user_id=${encodeURIComponent(p.userId)}`)
                .then((r) => r.json())
                .then((j) => {
                  if (j?.bound && j?.user) {
                    setLineBound(true);
                    setBindGate("bound");
                    setForm((prev) => ({ ...prev, reporterName: j.user.full_name || prev.reporterName }));
                    try { localStorage.setItem("cmms_line_bound", "1"); localStorage.setItem("cmms_line_full_name", j.user.full_name); } catch { /* ignore */ }
                  } else {
                    setLineBound(false);
                    setBindGate("unbound");
                  }
                })
                .catch(() => {});
            }
          });
        }
      } catch { /* liff ยังไม่พร้อม */ }
    };
    const timer = window.setTimeout(tryLiff, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  const effectiveUid = (() => {
    try {
      return (
        lineProfile?.userId ||
        localStorage.getItem("cmms_line_user_id") ||
        new URLSearchParams(window.location.search).get("uid") ||
        ""
      );
    } catch {
      return lineProfile?.userId || "";
    }
  })();

  const handleInlineBind = async () => {
    const uid = effectiveUid;
    if (!uid) { setBindError("ยังไม่ได้รับ LINE ID — รอสักครู่แล้วลองอีกครั้ง"); return; }
    const code = bindEmpCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(code)) { setBindError("รูปแบบรหัสพนักงานไม่ถูกต้อง (เช่น E01117 หรือ EMP005)"); return; }
    setBindSubmitting(true);
    setBindError(null);
    try {
      const r = await apiFetch("/api/v1/line_register.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_user_id: uid, employee_code: code }),
      });
      const j = await r.json().catch(() => ({}));
      if (j?.success && j?.user) {
        try {
          localStorage.setItem("cmms_line_bound", "1");
          localStorage.setItem("cmms_line_user_id", uid);
          localStorage.setItem("cmms_line_full_name", j.user.full_name || "");
        } catch { /* ignore */ }
        setLineBound(true);
        setBindGate("bound");
        setForm((prev) => ({ ...prev, reporterName: j.user.full_name || prev.reporterName }));
        showToast("success", "ผูกบัญชี LINE สำเร็จ");
      } else {
        setBindError(j?.error || "ผูกไม่สำเร็จ — ตรวจรหัสพนักงานแล้วลองอีกครั้ง");
      }
    } catch {
      setBindError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ ลองอีกครั้ง");
    }
    setBindSubmitting(false);
  };

  const selectedAsset = assets.find((a) => a.code === form.machineCode) || null;

  const refreshQueueItems = async () => {
    try {
      const items = await queueAll();
      setQueueItems(
        items.map((it) => {
          const p = (it.payload || {}) as Record<string, unknown>;
          const title = String(p.title || p.description || "").trim();
          return { id: it.id, label: title ? title.slice(0, 60) : `งานแจ้งซ่อม #${it.id}` };
        })
      );
    } catch { /* offline store ไม่พร้อม */ }
  };

  const removeQueuedItem = async (id: number) => {
    try {
      await queueRemove(id);
      setOfflineQueued((n) => Math.max(0, n - 1));
      setQueueItems((prev) => prev.filter((x) => x.id !== id));
      try { window.dispatchEvent(new Event("cmms:offline-queued")); } catch { /* ignore */ }
    } catch { /* ลบไม่สำเร็จ */ }
  };

const flushQueue = async () => {
    if (!navigator.onLine) return;
    setFlushingQueue(true);
    try {
      const items = await queueAll();
      for (const item of items) {
        try {
          const res = await apiFetch("/api/v1/repair.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item.payload),
          });
          const json = await res.json().catch(() => ({}));
          if (json.success || json.id) {
            await queueRemove(item.id);
            setOfflineQueued((n) => Math.max(0, n - 1));
            try { window.dispatchEvent(new Event("cmms:offline-queued")); } catch { /* ignore */ }
          }
        } catch { /* ยังส่งไม่ได้ */ }
      }
      refreshQueueItems();
    } catch { /* ยังออฟไลน์อยู่ */ }
    setFlushingQueue(false);
  };

  useEffect(() => {
    exposeQueueMigration();
    runQueueMigrationOnce()
      .then(() => queueAll())
      .then((items) => {
        if (items.length > 0) setOfflineQueued(items.length);
        refreshQueueItems();
        if (navigator.onLine) flushQueue();
      })
      .catch(() => { /* ยังออฟไลน์อยู่ */ });
    window.addEventListener("online", flushQueue);
    return () => window.removeEventListener("online", flushQueue);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedAsset?.department_id) {
      const d = depts.find((x) => x.id === selectedAsset.department_id);
      if (d && !form.departmentCode) update("departmentCode", d.code);
    }
  }, [selectedAsset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const canNext = () => {
    if (step === 0) return !!form.machineCode && !!form.machineStatus;
    if (step === 1) return !!form.jobType && !!form.jobDescription && form.symptoms.trim().length >= 5;
    if (step === 2) {
      const phoneOk = /^[0-9+\-()\s]{9,}$/.test(form.phone.trim());
      return !!form.reporterName.trim() && !!form.departmentCode && phoneOk;
    }
    return true;
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next = [...form.photos];
    for (const f of Array.from(files).slice(0, 5 - next.length)) {
      try {
        const uri = await resizeImageToDataUri(f);
        next.push(uri);
      } catch { /* ข้ามไฟล์ที่อ่านไม่ได้ */ }
    }
    update("photos", next);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const priorityMap: Record<string, string> = { breakdown: "critical", wait: "high", running: "medium" };
      if (form.isUrgent) priorityMap[form.machineStatus] = "critical";
      const sourceTypeMap: Record<string, string> = { Maintenance: "breakdown", PM: "pm", Modify: "modify", Build: "build" };
      const jt = jobTypeOptions.find((j) => j.value === form.jobType);
      const jd = jobDescriptionOptions.find((j) => j.value === form.jobDescription);
      const dept = depts.find((d) => d.code === form.departmentCode);

      const payload = {
        title: `[${selectedAsset?.code || form.machineCode}] ${jt?.en || ""} / ${jd?.en || ""}`,
        description: form.symptoms,
        failure_report: `JobType: ${jt?.en || "-"} | JobDescription: ${jd?.en || "-"} | Lot: ${form.lotNo || "-"}`,
        asset_id: selectedAsset?.id || null,
        department_id: dept?.id || selectedAsset?.department_id || null,
        source_type: sourceTypeMap[form.jobDescription] || "breakdown",
        machine_status: machineStatusOptions.find((s) => s.value === form.machineStatus)?.label,
        contaminate_checking: form.contaminateChecking || "not_checked",
        outsource_by: form.outsourceBy?.trim() || null,
        priority: priorityMap[form.machineStatus] || "medium",
        status: "pending",
        safety_related: form.safetyRelated ? 1 : 0,
        product_lot_no: form.lotNo,
        before_image_path: form.photos.length > 0 ? form.photos.join("|") : null,
        notes: form.note || null,
        receiver_name: form.reporterName,
        reporter_phone: form.phone,
        is_urgent: form.isUrgent ? 1 : 0,
        reporter_email: form.email || null,
        office: form.office,
      };

      let res: Response;
      try {
        res = await apiFetch("/api/v1/repair.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        try {
          await queueAdd(payload);
          setOfflineQueued((n) => n + 1);
          try { window.dispatchEvent(new Event("cmms:offline-queued")); } catch { /* ignore */ }
          setSubmitted(true);
          setCreatedWoNo("SAVED-OFFLINE");
          showToast("info", "ไม่มีอินเทอร์เน็ต — บันทึกงานไว้ในเครื่องแล้ว จะส่งให้อัตโนมัติเมื่อกลับมาออนไลน์");
        } catch {
          showToast("error", "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ และบันทึก offline ก็ไม่สำเร็จ");
        }
        setSubmitting(false);
        return;
      }
      const json = await res.json();
      if (json.success || json.id) {
        setCreatedWoNo(json.work_order_no || `WO-${json.id}`);
        setSubmitted(true);
        showToast("success", "ส่งแจ้งซ่อมสำเร็จ");
      } else {
        showToast("error", json.error || "ส่งไม่สำเร็จ ลองอีกครั้ง");
      }
    } catch (e) {
      console.error("Submit failed", e);
      showToast("error", "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    }
    setSubmitting(false);
  };

  /* ---------- หน้า Success ---------- */
  if (submitted) {
    return (
      <div className="cmms-success-overlay" onClick={() => (window.location.href = "/repair")}>
        <div className="cmms-success-card" onClick={(e) => e.stopPropagation()}>
          <div className="cmms-success-icon">
            <CheckCircle size={36} strokeWidth={1.75} />
          </div>
          <h3 className="text-lg font-bold mb-2">{tliff("liff.repair_success")}</h3>
          <p className="text-sm text-[var(--cmms-text-secondary)] mb-1">
            ใบแจ้งซ่อม (F-EN-03) เลขที่
          </p>
          <div className="cmms-success-wo">{createdWoNo}</div>
          <p className="text-xs text-[var(--cmms-text-secondary)] text-center mb-5">
            {selectedAsset?.code} · {machineStatusOptions.find((s) => s.value === form.machineStatus)?.label}
            {"\n"}{offlineQueued > 0 ? "ไม่มีอินเทอร์เน็ต — งานถูกบันทึกไว้ในเครื่อง จะส่งให้อัตโนมัติเมื่อกลับมาออนไลน์" : "ช่างซ่อมได้รับแจ้งเตือนทาง LINE แล้ว"}
          </p>
          <div className="flex flex-col gap-2 w-full">
            <Button className="w-full" onClick={() => (window.location.href = "/repair")}>
              <ListChecks className="w-4 h-4" /> ดูรายการงานซ่อม
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => {
              setSubmitted(false); setStep(0);
              setForm({ machineCode: "", machineStatus: "", jobType: "", jobDescription: "", symptoms: "", lotNo: "", contaminateChecking: "not_checked", outsourceBy: "", reporterName: sessionName, departmentCode: "", office: OFFICES[0], phone: "", email: "", contaminationRisk: false, safetyRelated: false, photos: [], note: "", isUrgent: false });
            }}>
              แจ้งซ่อมอีก
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- เกต: บังคับผูกบัญชี LINE ---------- */
  if (bindGate !== "bound") {
    return (
      <div className="cmms-mobile-page">
<div className="cmms-page-header">
        <div className="flex items-center gap-3">
          <div className="cmms-header-emoji"><AlertTriangle size={24} strokeWidth={1.75} /></div>
            <div className="flex flex-col flex-1">
              <h3 className="text-lg font-bold m-0">{tliff("liff.repair_header")}</h3>
              <p className="text-sm text-[var(--cmms-text-secondary)] m-0">MAINTENANCE JOB REQUEST · F-EN-03</p>
            </div>
          </div>
        </div>

        <Card className="cmms-card-flat mx-4 my-4 p-5">
          {bindGate === "checking" && (
            <div className="flex flex-col gap-4 py-2 items-center text-center">
              <div className="cmms-header-emoji mb-1"><Loader2 size={24} strokeWidth={1.75} className="animate-spin" /></div>
              <h4 className="text-base font-bold m-0">{tliff("liff.repair_checking")}</h4>
              <p className="text-sm text-[var(--cmms-text-secondary)]">{tliff("liff.repair_wait")}</p>
            </div>
          )}

          {bindGate === "anonymous" && (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <div className="cmms-header-emoji mb-2"><Link size={24} strokeWidth={1.75} /></div>
                <h4 className="text-base font-bold m-0 mb-1.5">{tliff("liff.repair_need_login")}</h4>
                <p className="text-sm text-[var(--cmms-text-secondary)]">
                  {tliff("liff.repair_need_login_desc")}
                </p>
              </div>
              <Button className="w-full" onClick={() => (window.location.href = "/line_login.php")}>
                <Link className="w-4 h-4" /> {tliff("liff.repair_line_login_btn")}
              </Button>
              <p className="text-sm text-[var(--cmms-text-secondary)] text-center">
                {tliff("liff.repair_after_login")}
              </p>
            </div>
          )}

          {bindGate === "webchoice" && (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <div className="cmms-header-emoji mb-2"><Lock size={24} strokeWidth={1.75} /></div>
                <h4 className="text-base font-bold m-0 mb-1.5">{tliff("liff.repair_confirm_identity")}</h4>
                <p className="text-sm text-[var(--cmms-text-secondary)]">
                  {tliff("liff.repair_confirm_desc")}
                </p>
              </div>
              <Button className="w-full" onClick={() => (window.location.href = "/login?next=/repair/request")}>
                <User className="w-4 h-4" /> {tliff("liff.repair_userpass_btn")}
              </Button>
              <Button
                variant="secondary"
                className="w-full bg-[#06C755] text-white border-none hover:bg-[#05b34c]"
                onClick={() => (window.location.href = "/line_login.php")}
              >
                <Link className="w-4 h-4" /> เข้าด้วย LINE
              </Button>
            </div>
          )}

          {bindGate === "unbound" && (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <div className="cmms-header-emoji mb-2"><Link size={24} strokeWidth={1.75} /></div>
                <h4 className="text-base font-bold m-0 mb-1.5">ผูกบัญชี LINE กับเลขพนักงาน</h4>
                <p className="text-sm text-[var(--cmms-text-secondary)]">
                  {lineProfile?.name ? `สวัสดีคุณ ${lineProfile.name}` : "สวัสดี"}
                  {"\n"}กรอกรหัสพนักงานเพื่อเริ่มแจ้งซ่อม (ครั้งเดียวจบ)
                </p>
              </div>
              <Input
                label="เลขพนักงาน"
                isLabelHidden
                placeholder="เช่น E01117"
                value={bindEmpCode}
                onChange={(e) => setBindEmpCode(e.target.value.toUpperCase().slice(0, 6))}
              />
              {bindError && (
                <div className="bg-[#FEE2E2] text-[#B91C1C] rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                  <AlertCircle size={16} strokeWidth={1.75} /> {bindError}
                </div>
              )}
              <Button
                className="w-full"
                disabled={bindSubmitting || !effectiveUid}
                loading={bindSubmitting}
                loadingText="กำลังผูก…"
                onClick={handleInlineBind}
              >
                ผูกบัญชีและไปแจ้งซ่อม
              </Button>
              {!effectiveUid && (
                <p className="text-sm text-[var(--cmms-text-secondary)] text-center">
                  กำลังโหลดข้อมูล LINE…
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    );
  }

  const displayName = form.reporterName || sessionName || "...";

  return (
    <div className="cmms-mobile-page">
      {/* Header */}
<div className="cmms-page-header">
        <div className="flex items-center gap-3">
          <LiffLangToggle />
          <div className="cmms-header-emoji"><AlertTriangle size={24} strokeWidth={1.75} /></div>
          <div className="flex flex-col flex-1">
            <h3 className="text-lg font-bold m-0">{tliff("liff.repair_header")}</h3>
            <p className="text-sm text-[var(--cmms-text-secondary)] m-0">MAINTENANCE JOB REQUEST · F-EN-03</p>
          </div>
          <LiffLangToggle />
          {lineProfile?.pic ? (
            <img src={lineProfile.pic} alt="LINE profile" className="cmms-avatar" />
          ) : (
            <div className="cmms-avatar cmms-avatar-fallback"><User size={18} strokeWidth={1.75} /></div>
          )}
        </div>
      </div>

      {/* Step Indicator */}
      <div className="cmms-steps">
{STEPS.map((s, i) => (
            <div key={i} className={`cmms-step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
              onClick={() => { if (i < step) setStep(i); }}>
              <div className="cmms-step-number">{i < step ? <Check size={14} strokeWidth={2} /> : <Icon name={s.iconName} size={14} />}</div>
              <span className="cmms-step-label">{tliff(`liff.step_${s.key}`)}</span>
            </div>
          ))}
      </div>

      {/* Offline status */}
      {(offlineNow || onlineBack) && (
        <div className={`cmms-offline-banner${onlineBack ? " success" : ""}`}>
          <div className="flex items-center justify-between gap-2.5 flex-wrap">
            <span>
              {onlineBack
                ? "เชื่อมต่อกลับมาแล้ว — ข้อมูลยังไม่ทันสมัย"
                : "ไม่มีอินเทอร์เน็ต — ยังกรอกฟอร์มได้ ระบบจะส่งงานให้อัตโนมัติเมื่อกลับมาออนไลน์"}
            </span>
            <Button
              variant={onlineBack ? "primary" : "ghost"}
              size="sm"
              onClick={async () => {
                if (!navigator.onLine) {
                  setRetryMsg("ยังไม่มีอินเทอร์เน็ต — ลองอีกครั้งเมื่อเชื่อมต่อได้");
                  return;
                }
                setRetryMsg("กำลังตรวจสอบการเชื่อมต่อ…");
                const ok = await serverResponds();
                if (ok) window.location.reload();
                else setRetryMsg("โหลดไม่สำเร็จ — ลองอีกครั้ง");
              }}
              className="shrink-0"
            >
              โหลดข้อมูลใหม่
            </Button>
          </div>
          {retryMsg && (
            <div className="mt-1 opacity-85 text-xs">{retryMsg}</div>
          )}
        </div>
      )}

      {/* Offline queue status */}
      {offlineQueued > 0 && (
        <div className="cmms-offline-banner">
          <div className="flex items-center justify-between gap-2.5 flex-wrap">
            <span>มีงานแจ้งซ่อมที่ยังไม่ได้ส่ง <b>{offlineQueued}</b> รายการ</span>
            <Button
              variant="primary"
              size="sm"
              disabled={flushingQueue || !navigator.onLine}
              onClick={flushQueue}
              className="shrink-0"
            >
              {flushingQueue ? "กำลังส่ง..." : "ส่งงานค้างทั้งหมดตอนนี้"}
            </Button>
          </div>

          {queueItems.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {queueItems.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center gap-2 bg-white/70 border border-[#f0d9b8] rounded-lg px-2.5 py-1.5"
                >
                  <span className="flex-1 text-xs font-semibold overflow-hidden text-ellipsis whitespace-nowrap">
                    {it.label}
                  </span>
                  <button
                    type="button"
                    title="ลบงานนี้ออกจากคิว"
                    aria-label={`ลบ ${it.label}`}
                    onClick={() => removeQueuedItem(it.id)}
                    className="bg-none border-none cursor-pointer text-[var(--cmms-danger,#DC2626)] text-sm font-extrabold px-1.5 py-0.5 rounded-md shrink-0 leading-none hover:bg-[var(--cmms-danger-light)]"
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-1 opacity-80 text-xs">
            จะส่งให้อัตโนมัติเมื่อกลับมาออนไลน์ — หรือกดปุ่มนี้เพื่อส่งทันที
          </div>
        </div>
      )}

      {/* ผูกบัญชี LINE */}
      {lineBound === false && (
        <div className="cmms-bind-banner" onClick={() => (window.location.href = "/register")}>
          <div>
            <b><Link className="w-4 h-4 inline align-middle" /> ผูกบัญชี LINE กับเลขพนักงาน</b>
            <div className="cmms-bind-sub">ครั้งแรก? ลงทะเบียน 1 ครั้ง — ระบบจำชื่อคุณ และแจ้งเตือนช่างได้ตรงคน</div>
          </div>
          <span className="cmms-bind-arrow">›</span>
        </div>
      )}

      {/* ============ STEP 1 : เครื่องจักร ============ */}
      {step === 0 && (
        <Card className="cmms-card-flat p-5">
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-sm font-bold mb-0.5">1. เลือกเครื่องจักร / อุปกรณ์ <span className="cmms-req">*</span></p>
              <p className="text-xs text-[var(--cmms-text-secondary)]">ทะเบียนเครื่องจักรโรงงาน (22 เครื่อง)</p>
            </div>

            {MACHINE_GROUPS.map((g) => {
              const groupMachines = assets.filter((a) => a.code.startsWith(g.prefix));
              if (groupMachines.length === 0) return null;
              return (
                <div key={g.prefix} className="flex flex-col gap-2">
                  <p className="text-xs font-bold text-[var(--cmms-text-secondary)]">
                    <Icon name={g.iconName} size={14} className="inline" /> {g.label} ({groupMachines.length})
                  </p>
                  <div className="cmms-chip-grid">
                    {groupMachines.map((m) => (
                      <button key={m.id} type="button"
                        className={`cmms-chip ${form.machineCode === m.code ? "selected" : ""}`}
                        onClick={() => update("machineCode", m.code)}>
                        {m.code}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {selectedAsset && (
              <div className="cmms-machine-summary">
                <div className="flex items-center gap-3">
                  <div className="cmms-machine-icon"><Building2 size={22} strokeWidth={1.75} /></div>
                  <div className="flex flex-col flex-1">
                    <p className="text-sm font-bold m-0">{selectedAsset.code}</p>
                    <p className="text-xs text-[var(--cmms-text-secondary)] m-0">{selectedAsset.name}</p>
                  </div>
                  <Badge variant={selectedAsset.criticality === "A" ? "danger" : "neutral"}>
                    {selectedAsset.criticality || "-"}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--cmms-text-secondary)] mt-2">
                  แผนก: {selectedAsset.department || "—"}
                </p>
              </div>
            )}

            <div>
              <p className="text-sm font-bold mb-2.5">2. สถานะเครื่องจักร (Machine Status) <span className="cmms-req">*</span></p>
              <div className="flex flex-col gap-2">
                {machineStatusOptions.map((s) => (
                  <button key={s.value} type="button"
                    className={`cmms-option-row ${form.machineStatus === s.value ? "selected" : ""}`}
                    style={{ ["--opt-color" as any]: s.color }}
                    onClick={() => update("machineStatus", s.value)}>
                    <span className="cmms-option-emoji"><Icon name={s.iconName} size={16} /></span>
                    <div className="flex flex-col flex-1">
                      <p className="text-sm font-bold m-0">{s.label}</p>
                      <p className="text-xs text-[var(--cmms-text-secondary)] m-0">{s.th}</p>
                    </div>
                    <span className="cmms-radio-dot" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ============ STEP 2 : งาน ============ */}
      {step === 1 && (
        <Card className="cmms-card-flat p-5">
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-sm font-bold mb-2.5">Ⓐ ประเภทงาน (Job Type) <span className="cmms-req">*</span></p>
              <div className="cmms-job-grid">
                {jobTypeOptions.map((j) => (
                  <button key={j.value} type="button"
                    className={`cmms-job-card ${form.jobType === j.value ? "selected" : ""}`}
                    onClick={() => update("jobType", j.value)}>
                    <span className="cmms-job-emoji"><Icon name={j.iconName} size={18} /></span>
                    <p className="text-sm font-bold m-0">{j.label}</p>
                    <p className="text-2xs text-[var(--cmms-text-secondary)] m-0">{j.en}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-bold mb-2.5">Ⓑ ลักษณะงาน (Job Description) <span className="cmms-req">*</span></p>
              <div className="cmms-job-grid">
                {jobDescriptionOptions.map((j) => (
                  <button key={j.value} type="button"
                    className={`cmms-job-card ${form.jobDescription === j.value ? "selected" : ""}`}
                    onClick={() => update("jobDescription", j.value)}>
                    <span className="cmms-job-emoji"><Icon name={j.iconName} size={18} /></span>
                    <p className="text-sm font-bold m-0">{j.label}</p>
                    <p className="text-2xs text-[var(--cmms-text-secondary)] m-0">{j.en}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-bold mb-2">※ รายละเอียดของปัญหา (Problem Description) <span className="cmms-req">*</span></p>
              <Textarea
                label="รายละเอียดปัญหา"
                isLabelHidden
                placeholder="อธิบายปัญหาที่พบให้ละเอียด เช่น อาการที่พบ ข้อความแจ้งเตือน เวลาเกิดปัญหา..."
                value={form.symptoms}
                onChange={(e) => update("symptoms", e.target.value)}
                rows={4}
              />
              <p className="text-2xs text-[var(--cmms-text-secondary)] mt-1">
                {form.symptoms.length} ตัวอักษร (ขั้นต่ำ 5)
              </p>
            </div>

            <div>
              <p className="text-sm font-bold mb-2">Lot No. ที่กำลังผลิต (ถ้ามี)</p>
              <Input
                label="Lot No."
                isLabelHidden
                placeholder="ระบุ Lot No. สินค้าที่กำลังผลิต"
                value={form.lotNo}
                onChange={(e) => update("lotNo", e.target.value)}
              />
            </div>

            <div>
              <p className="text-sm font-bold mb-2">ตรวจสอบการปนเปื้อนหลังงานเสร็จ (Contaminate Checking)</p>
              <div className="space-y-1.5">
                <Label className="sr-only">ตรวจสอบการปนเปื้อน</Label>
                <Select
                  value={form.contaminateChecking}
                  onValueChange={(v) => update("contaminateChecking", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {contaminateCheckOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        <Icon name={o.iconName} size={14} className="mr-2" /> {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <p className="text-sm font-bold mb-2">ผู้รับเหมาภายนอก (ถ้าจ้างภายนอกทำ)</p>
              <Input
                label="ผู้รับเหมาภายนอก"
                isLabelHidden
                placeholder="ระบุชื่อบริษัท/ผู้รับเหมาภายนอก (ถ้ามี)"
                value={form.outsourceBy}
                onChange={(e) => update("outsourceBy", e.target.value)}
              />
            </div>

            <div>
              <p className="text-sm font-bold mb-2">หมายเหตุ (Note)</p>
              <Textarea
                label="หมายเหตุ"
                isLabelHidden
                placeholder="บันทึกข้อมูลเพิ่มเติม (ถ้ามี)"
                value={form.note}
                onChange={(e) => update("note", e.target.value)}
                rows={2}
              />
            </div>
          </div>
        </Card>
      )}

      {/* ============ STEP 3 : ผู้แจ้ง & รูป ============ */}
      {step === 2 && (
        <Card className="cmms-card-flat p-5">
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-sm font-bold mb-0.5">ข้อมูลผู้แจ้ง</p>
              <p className="text-xs text-[var(--cmms-text-secondary)]">
                {lineProfile ? "ดึงข้อมูลจากบัญชี LINE แล้ว — แก้ไขได้ถ้าต้องการ" : "ดึงชื่อจากระบบให้อัตโนมัติ"}
              </p>
            </div>

            <FieldRow label="ชื่อ-นามสกุล (Requestor)" required>
              <Input
                label="ชื่อ-นามสกุล"
                isLabelHidden
                placeholder="เช่น สมชาย ใจดี"
                value={form.reporterName}
                onChange={(e) => update("reporterName", e.target.value)}
              />
            </FieldRow>

            <FieldRow label="แผนก (Department)" required>
              <div className="space-y-1.5">
                <Label className="sr-only">แผนก</Label>
                <Select
                  value={form.departmentCode || "__none__"}
                  onValueChange={(v) => update("departmentCode", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="เลือกแผนก..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" disabled>เลือกแผนก...</SelectItem>
                    {depts.map((d) => (
                      <SelectItem key={d.id} value={d.code}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </FieldRow>

            <FieldRow label="สำนักงาน (Office)" required>
              <div className="space-y-1.5">
                <Label className="sr-only">สำนักงาน</Label>
                <Select
                  value={form.office}
                  onValueChange={(v) => update("office", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OFFICES.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </FieldRow>

            <FieldRow label="เบอร์ติดต่อ (Phone)" required>
              <Input
                label="เบอร์ติดต่อ"
                isLabelHidden
                placeholder="เช่น 083-0000000"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </FieldRow>

            <FieldRow label="อีเมล (ถ้ามี)">
              <Input
                label="อีเมล"
                isLabelHidden
                placeholder="เช่น example@company.com"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </FieldRow>

            {/* Contamination Risk */}
            <div className={`cmms-contam-box ${form.contaminationRisk ? "risk" : "safe"}`}>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} strokeWidth={1.75} />
                  <p className="text-sm font-bold m-0">ความเสี่ยงปนเปื้อนจากการซ่อม (GMP)</p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    label="Contamination"
                    isLabelHidden
                    checked={form.contaminationRisk}
                    onChange={(c) => update("contaminationRisk", c)}
                  />
                  <p className="text-sm m-0" style={{ color: form.contaminationRisk ? "var(--cmms-danger)" : "var(--cmms-success)" }}>
                    {form.contaminationRisk ? "มีความเสี่ยงปนเปื้อน" : "ไม่มีความเสี่ยงปนเปื้อน"}
                  </p>
                </div>
              </div>
            </div>

            {/* Safety Related */}
            <div className="flex items-center gap-3 py-3 border-b border-[var(--cmms-border)]">
                  <Switch
                    label="Safety Related"
                    isLabelHidden
                    checked={form.safetyRelated}
                    onChange={(c) => update("safetyRelated", c)}
                  />
              <div className="flex flex-col">
                <p className="text-sm font-bold m-0">เกี่ยวข้องกับความปลอดภัย</p>
                <p className="text-2xs text-[var(--cmms-text-secondary)] m-0">
                  {form.safetyRelated ? "ใช่ — ต้องทำ LOTO / Work Permit" : "ไม่เกี่ยวข้อง"}
                </p>
              </div>
            </div>

            {/* Urgent Repair Toggle */}
            <div className={`cmms-contam-box ${form.isUrgent ? "risk" : "safe"}`}>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} strokeWidth={1.75} />
                  <p className="text-sm font-bold m-0">แจ้งซ่อมด่วน (Urgent Repair)</p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    label="Urgent Repair"
                    isLabelHidden
                    checked={form.isUrgent}
                    onChange={(c) => update("isUrgent", c)}
                  />
                  <p className="text-sm m-0" style={{ color: form.isUrgent ? "var(--cmms-danger)" : "var(--cmms-success)" }}>
                    {form.isUrgent ? "แจ้งด่วน — ส่ง LINE + Telegram ทันที" : "ปกติ"}
                  </p>
                </div>
              </div>
            </div>

            {/* Photos */}
            <div>
              <p className="text-sm font-bold mb-2">
                <Paperclip size={14} strokeWidth={1.75} className="inline align-[-2px]" /> แนบรูปถ่ายจุดชำรุด (สูงสุด 5 รูป)
              </p>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                className="hidden"
                onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }}
              />
              <div className="cmms-photo-grid">
                {form.photos.map((p, i) => (
                  <div key={i} className="cmms-photo-thumb">
                    <img src={p} alt={`รูป ${i + 1}`} />
                    <button type="button" className="cmms-photo-remove"
                      onClick={() => update("photos", form.photos.filter((_, x) => x !== i))}>
                      <X size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
                {form.photos.length < 5 && (
                  <button type="button" className="cmms-photo-add" onClick={() => photoInputRef.current?.click()}>
                    <Camera size={24} strokeWidth={1.75} />
                    <p className="text-2xs font-bold m-0">ถ่าย / เลือกรูป</p>
                  </button>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ============ STEP 4 : ยืนยัน ============ */}
      {step === 3 && (
        <Card className="cmms-card-flat p-5">
          <div className="flex flex-col gap-4">
            <h4 className="text-base font-bold">ตรวจสอบก่อนส่ง</h4>

            <div className="cmms-summary-box">
              <SummaryRow label="เครื่องจักร" value={selectedAsset ? `${selectedAsset.code} — ${selectedAsset.name}` : form.machineCode} />
              <SummaryRow label="สถานะเครื่อง" value={machineStatusOptions.find((s) => s.value === form.machineStatus)?.label || "—"} />
              <SummaryRow label="ประเภทงาน" value={`${jobTypeOptions.find((j) => j.value === form.jobType)?.label || "—"} / ${jobDescriptionOptions.find((j) => j.value === form.jobDescription)?.label || "—"}`} />
              <SummaryRow label="ผู้แจ้ง" value={`${form.reporterName} (${depts.find((d) => d.code === form.departmentCode)?.name || "—"})`} icon={<User size={14} strokeWidth={1.75} />} />
              <SummaryRow label="ติดต่อ" value={[form.phone, form.email].filter(Boolean).join(" · ") || "—"} icon={<Phone size={14} strokeWidth={1.75} />} />
              <SummaryRow label="สำนักงาน" value={form.office} />
              <SummaryRow label="Lot No." value={form.lotNo || "—"} />
              <SummaryRow label="วันที่แจ้ง" value={new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })} icon={<Clock size={14} strokeWidth={1.75} />} />
            </div>

            <div>
              <p className="text-xs font-bold text-[var(--cmms-text-secondary)]">รายละเอียดปัญหา</p>
              <div className="cmms-summary-text">{form.symptoms}</div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={form.contaminationRisk ? "danger" : "success"}>
                {form.contaminationRisk ? "มีความเสี่ยงปนเปื้อน" : "ไม่ปนเปื้อน"}
              </Badge>
              {form.safetyRelated && <Badge variant="danger">Safety</Badge>}
              <Badge variant="info">{form.photos.length} รูป</Badge>
            </div>

            {submitError && (
              <div className="cmms-submit-error">
                <AlertTriangle size={16} strokeWidth={1.75} />
                {submitError}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Sticky bottom bar */}
      <div className="cmms-mobile-bottom-bar">
        <div className="flex items-center gap-3">
          {step > 0 ? (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} strokeWidth={1.75} /> ย้อนกลับ
            </Button>
          ) : <div />}
          <div className="flex-1">
            {step < 3 ? (
              <Button
                className="w-full"
                disabled={!canNext()}
                onClick={() => setStep(step + 1)}
              >
                {["ถัดไป · รายละเอียดงาน", "ถัดไป · ผู้แจ้ง & รูป", "ถัดไป · ยืนยัน"][step]} <ArrowRight size={16} strokeWidth={1.75} />
              </Button>
            ) : (
              <Button
                className="w-full"
                disabled={submitting}
                loading={submitting}
                loadingText="กำลังส่ง…"
                onClick={handleSubmit}
              >
                <CheckCircle size={16} strokeWidth={1.75} /> ยืนยัน & ส่งแจ้งซ่อม
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-bold mb-2">
        {label} {required && <span className="cmms-req">*</span>}
      </p>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-[var(--cmms-text-secondary)]">{label}</p>
      <p className="text-sm font-bold flex items-center gap-1 flex-wrap justify-end text-right">
        {icon}{value}
      </p>
    </div>
  );
}
