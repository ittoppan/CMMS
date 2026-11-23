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
  Video,
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
import SupportContactStrip from "./SupportContactStrip";
import { tliff, useLiffLang } from "@/lib/i18n-liff";
import { runQueueMigrationOnce, exposeQueueMigration } from "@/lib/queue-migration";
import { freshLiffIdToken, idTokenExpiresAt, isLiffClientBrowser, liffAuthHeaders, useLiffSession } from "@/lib/liff-session";
import { clearRepairDraft, hasDraftContent, loadRepairDraft, saveRepairDraft } from "@/lib/repair-draft";
import { canAdvanceFrom, firstIncompleteStep, REPAIR_STEP_COUNT } from "@/lib/repair-form-steps";
import { serverResponds } from "@/lib/server-check";
import { UNBOUND_BODY, UNBOUND_STEPS, UNBOUND_TITLE, VERIFY_FAILED_BODY, VERIFY_FAILED_TITLE, bindErrorMessage } from "@/lib/liff-bind-copy";
import { useSupportContact } from "@/lib/use-support-contact";
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
   - ฟิลด์งานของช่าง (อะไหล่/ผู้รับเหมา/ผลตรวจปนเปื้อน/หมายเหตุ)
     ไม่แสดงในฟอร์มนี้ — ให้ช่างบันทึกตอนซ่อมทีหลัง
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

// เครื่องจักรที่ไม่ได้ลงทะเบียนใน asset_registry — ผู้แจ้งพิมพ์ชื่อเอง
export const OTHER_MACHINE_CODE = "__other__";

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

/** LINE user id ที่เคยเก็บไว้จาก LIFF (ใช้แสดงผลเท่านั้น — ตัวตนจริงต้องมี ID token) */
function storedLineUid(): string {
  try {
    return localStorage.getItem("cmms_line_user_id") || "";
  } catch {
    return "";
  }
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
  const [reporterDeptId, setReporterDeptId] = useState<number | null>(null);
  // ชื่อแผนกจากโปรไฟล์ที่ผูกไว้ — ใช้แสดงผลแม้ยังโหลดรายการแผนกไม่ได้ (เช่นใน LINE ที่ไม่มี session เว็บ)
  const [reporterDeptName, setReporterDeptName] = useState<string>("");
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
  const [rootCauseOptions, setRootCauseOptions] = useState<{ value: string; label: string; emoji?: string }[]>([]);

  const [lineBound, setLineBound] = useState<boolean | null>(null);
  const [bindGate, setBindGate] = useState<"checking" | "bound" | "unbound" | "verify_failed" | "anonymous" | "webchoice">("checking");
  // ผล init LIFF ที่ LiffBridge ประกาศ (event-driven — ไม่ต้องอ่าน localStorage ซ้ำ ๆ หรือเดาเวลา)
  const liff = useLiffSession();
  const [bindEmpCode, setBindEmpCode] = useState("");
  const [bindError, setBindError] = useState<string | null>(null);
  // ช่องทางติดต่อแอดมินสำหรับสถานะ unbound — hook กลาง (settings_support_contact()) แสดงผลด้วย SupportContactStrip
  const supportContact = useSupportContact();
  const [bindSubmitting, setBindSubmitting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const videoCameraRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoErr, setVideoErr] = useState<string | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachErr, setAttachErr] = useState<string | null>(null);
  const offlineRef = useRef(false);
  const flushingRef = useRef(false);

  const [form, setForm] = useState({
    machineCode: "",
    machineOther: "",
    machineStatus: "",
    jobType: "",
    jobDescription: "",
    symptoms: "",
    lotNo: "",
    reporterName: "",
    departmentCode: "",
    office: OFFICES[0],
    phone: "",
    email: "",
    safetyRelated: false,
    photos: [] as string[],
    video: "",
    attachment: "",
    isUrgent: false,
  });

  const update = (key: string, value: string | boolean | string[]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // แนบ LIFF ID token ไปกับ API เฉพาะ endpoint ที่ต้องใช้ (departments.php / line_register.php / repair.php)
  // endpoint อื่น (asset_registry, repair_options, line_notify, profile, csrf, upload) ไม่แนบ token เพื่อไม่ส่ง token ไปโดยไม่จำเป็น
  const LIFF_ENDPOINTS = new Set(["departments.php", "line_register.php", "repair.php"]);
  const apiFetch = (url: string, init?: RequestInit) => {
    const path = url.split("?")[0];
    const name = path.substring(path.lastIndexOf("/") + 1);
    const liffHeaders = LIFF_ENDPOINTS.has(name) ? liffAuthHeaders() : {};
    return fetch(url, {
      ...init,
      headers: { ...liffHeaders, ...((init?.headers as Record<string, string> | undefined) ?? {}) },
    });
  };

  /* เติมชื่อ-นามสกุลจากฐานข้อมูล ถ้าผู้ใช้ยังไม่ได้กรอก/แก้เอง */
  const seedReporter = (name?: string | null) => {
    const n = (name || "").trim();
    if (!n) return;
    setForm((prev) => (prev.reporterName.trim() ? prev : { ...prev, reporterName: n }));
  };

  /* เติมข้อมูลผู้แจ้งจากข้อมูลที่ลงทะเบียนไว้ในระบบ (ชื่อ/แผนก/โทร/อีเมล)
     — ไม่ทับค่าที่ผู้ใช้กรอกเองแล้ว */
  const seedReporterFromRegistered = (u: {
    full_name?: string | null;
    department_id?: number | null;
    department_code?: string | null;
    department_name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null | undefined) => {
    if (!u) return;
    // แผนกจากโปรไฟล์ผู้ใช้ — เติมให้เลยโดยไม่ต้องรอรายการแผนกโหลด (LINE ไม่มี session เว็บ)
    if (u.department_name) setReporterDeptName(u.department_name);
    setForm((prev) => {
      const next = { ...prev };
      // ใช้ชื่อ-นามสกุลจากระบบเป็นหลัก — ทับชื่อที่เติมมาจากโปรไฟล์ LINE ถ้าผู้ใช้ยังไม่ได้แก้เอง
      const lineName = (liff.displayName || "").trim();
      const current = prev.reporterName.trim();
      if (u.full_name && (!current || (lineName !== "" && current === lineName))) next.reporterName = u.full_name;
      if (!prev.phone.trim() && u.phone) next.phone = u.phone;
      if (!prev.email.trim() && u.email) next.email = u.email;
      if (!prev.departmentCode && u.department_code) next.departmentCode = u.department_code;
      return next;
    });
    if (u.department_id) setReporterDeptId(u.department_id);
  };

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
          } else {
            update("machineCode", OTHER_MACHINE_CODE);
            update("machineOther", qrPrefillRef.current);
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
        seedReporter(j?.me?.full_name);
        if (j?.me?.id) {
          sessionUserRef.current = true;
          setLineBound(true);
          setBindGate("bound");
          // เติมข้อมูลผู้แจ้งเพิ่มเติม (โทร/อีเมล/แผนก) จาก profile ที่ลงทะเบียนไว้
          apiFetch("/api/v1/profile.php")
            .then((r) => r.json())
            .then((pj) => {
              if (pj?.success && pj?.user) {
                seedReporterFromRegistered({
                  full_name: pj.user.full_name,
                  department_id: pj.user.department_id,
                  department_code: pj.user.department_code,
                  department_name: pj.user.department_name,
                  phone: pj.user.phone,
                  email: pj.user.email,
                });
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setSessionChecked(true));

    // แคชฝั่งเครื่อง: คนที่เคยผูกแล้วเห็นฟอร์มทันที — การยืนยันจริงอยู่ที่ effect ด้านล่าง
    try {
      if (localStorage.getItem("cmms_line_bound") === "1") {
        setLineBound(true);
        setBindGate("bound");
        const boundName = localStorage.getItem("cmms_line_full_name");
        if (boundName) setForm((prev) => ({ ...prev, reporterName: boundName || prev.reporterName }));
        const boundPhone = localStorage.getItem("cmms_line_phone");
        if (boundPhone) setForm((prev) => ({ ...prev, phone: prev.phone || boundPhone }));
        const boundEmail = localStorage.getItem("cmms_line_email");
        if (boundEmail) setForm((prev) => ({ ...prev, email: prev.email || boundEmail }));
        const boundDept = localStorage.getItem("cmms_line_dept_id");
        if (boundDept) setReporterDeptId(Number(boundDept));
        const boundDeptCode = localStorage.getItem("cmms_line_dept_code");
        if (boundDeptCode) setForm((prev) => ({ ...prev, departmentCode: prev.departmentCode || boundDeptCode }));
        const boundDeptName = localStorage.getItem("cmms_line_dept_name");
        if (boundDeptName) setReporterDeptName(boundDeptName);
      }
    } catch { /* ignore */ }
  }, []);

  /* ---------- เกตผูกบัญชี LINE ----------
     LiffBridge ประกาศผล init (status/idToken) ผ่าน lib/liff-session — effect นี้ตรวจต่อทันทีที่ token
     พร้อม จึงไม่ต้องเดาเวลาด้วย timer และไม่สรุป "ยังไม่ผูก" ก่อนได้ token (บั๊กเดิม: เปิดจาก LINE OA
     แล้วขึ้นว่ายังไม่ผูกทั้งที่ผูกแล้ว). ตัวตนยืนยันด้วย LIFF ID token เท่านั้น */
  const sessionUserRef = useRef(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const gateCheckedToken = useRef("");

  /* ตรวจกับเซิร์ฟเวอร์ว่า LINE ที่ token ยืนยันแล้วผูกบัญชีอยู่ไหม — แยกผลเป็น 3 ทาง
     ผูกแล้ว / token ตรวจไม่ผ่าน / ยืนยันแล้วแต่ยังไม่ผูก (เดิม token ไม่ผ่านถูกนับเป็น "ยังไม่ผูก") */
  const checkBinding = (token: string) => {
    gateCheckedToken.current = token;
    setVerifyError("");
    fetch("/api/v1/line_register.php", { headers: { "X-LIFF-Id-Token": token } })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (j?.bound && j?.user) {
          setLineBound(true);
          setBindGate("bound");
          seedReporterFromRegistered(j.user);
          try {
            localStorage.setItem("cmms_line_bound", "1");
            localStorage.setItem("cmms_line_full_name", j.user.full_name || "");
            if (j.user.phone) localStorage.setItem("cmms_line_phone", j.user.phone);
            if (j.user.email) localStorage.setItem("cmms_line_email", j.user.email);
            if (j.user.department_id) localStorage.setItem("cmms_line_dept_id", String(j.user.department_id));
            if (j.user.department_code) localStorage.setItem("cmms_line_dept_code", String(j.user.department_code));
            if (j.user.department_name) localStorage.setItem("cmms_line_dept_name", String(j.user.department_name));
          } catch { /* ignore */ }
          return;
        }
        if (!r.ok || j?.code) {
          // 401 + code = token หมดอายุ/ตรวจไม่ผ่าน/ติดต่อ LINE ไม่ได้ — ไม่ใช่ "ยังไม่ผูก"
          setLineBound(null);
          setBindGate("verify_failed");
          setVerifyError(j?.error || "ตรวจสอบสิทธิ์ LINE ไม่ผ่าน");
          return;
        }
        setLineBound(false);
        setBindGate("unbound");
      })
      .catch(() => {
        // ตรวจไม่ได้เพราะเน็ตหลุด — ไม่ใช่ "ยังไม่ผูก"; แสดงสถานะแยกพร้อมปุ่มลองใหม่ (ไม่ค้าง checking)
        setBindGate((gate) => (gate === "bound" ? gate : "verify_failed"));
        setVerifyError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสัญญาณแล้วลองอีกครั้ง");
      });
  };

  useEffect(() => {
    if (liff.status === "idle") return;            // LiffBridge ยังไม่ประกาศผล
    if (sessionUserRef.current) return;             // ล็อกอินหน้าเว็บอยู่แล้ว — ผ่านเกตด้วย session

    if (liff.status === "ready" && liff.lineUserId) {
      setLineProfile({ name: liff.displayName, pic: "", userId: liff.lineUserId });
      seedReporter(liff.displayName);
    }

    // มี ID token → ให้เซิร์ฟเวอร์ตรวจกับ LINE แล้วบอกว่าผูกอยู่ไหม (ได้ข้อมูลผู้แจ้งมาด้วยในคำขอเดียว)
    if (liff.idToken) {
      if (gateCheckedToken.current !== liff.idToken) checkBinding(liff.idToken);
      return;
    }

    if (!sessionChecked) return;

    // อยู่ใน LINE แต่ยังไม่ได้ ID token (init ล้ม/ยังไม่ทันได้) — ห้ามสรุปว่า "ยังไม่ผูก"
    if (isLiffClientBrowser()) {
      setBindGate((gate) => (gate === "bound" ? gate : "verify_failed"));
      setVerifyError(liff.status === "error" ? "โหลดข้อมูล LINE ไม่สำเร็จ" : "ยังไม่ได้รับ ID token จาก LINE");
      return;
    }

    // เปิดนอกแอป LINE — ตัดสินจาก LINE user id ที่เคยเก็บไว้
    const uid = storedLineUid();
    setBindGate((gate) => (gate === "bound" ? gate : uid ? "unbound" : "webchoice"));
  }, [liff.status, liff.idToken, liff.lineUserId, sessionChecked]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!uid) { setBindError(bindErrorMessage({ noLineId: true, contact: supportContact })); return; }
    const code = bindEmpCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(code)) { setBindError(bindErrorMessage({ format: true, contact: supportContact })); return; }
    setBindSubmitting(true);
    setBindError(null);
    try {
      const token = freshLiffIdToken(); // token อาจหมดอายุหลังเปิดหน้านาน — ขอใหม่ก่อนผูก
      const r = await apiFetch("/api/v1/line_register.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "X-LIFF-Id-Token": token } : {}) },
        // ไม่ส่ง line_user_id — เซิร์ฟเวอร์ใช้ LINE ที่ token ยืนยัน
        body: JSON.stringify({ employee_code: code }),
      });
      const j = await r.json().catch(() => ({}));
      if (j?.success && j?.user) {
        try {
          localStorage.setItem("cmms_line_bound", "1");
          localStorage.setItem("cmms_line_user_id", uid);
          localStorage.setItem("cmms_line_full_name", j.user.full_name || "");
          if (j.user.phone) localStorage.setItem("cmms_line_phone", j.user.phone);
          if (j.user.email) localStorage.setItem("cmms_line_email", j.user.email);
          if (j.user.department_id) localStorage.setItem("cmms_line_dept_id", String(j.user.department_id));
        } catch { /* ignore */ }
        setLineBound(true);
        setBindGate("bound");
        seedReporterFromRegistered(j.user);
        showToast("success", "ผูกบัญชี LINE สำเร็จ");
      } else {
        setBindError(
          bindErrorMessage({ status: r.status, raw: j?.error, contact: supportContact })
        );
      }
    } catch {
      setBindError(bindErrorMessage({ offline: true, contact: supportContact }));
    }
    setBindSubmitting(false);
  };

  const selectedAsset = assets.find((a) => a.code === form.machineCode) || null;
  const isOtherMachine = form.machineCode === OTHER_MACHINE_CODE;
  const machineDisplay = selectedAsset ? `${selectedAsset.code} — ${selectedAsset.name}` : (form.machineOther.trim() || "ไม่ระบุเครื่องจักร");

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

const flushQueue = async (notifyOnAuthFail = false) => {
    if (!navigator.onLine || flushingRef.current) return;
    // ขอ token สดก่อน replay — token ตอนกดคิวอาจหมดอายุแล้ว งานค้างจะกลายเป็นงานไม่มีเจ้าของ
    const token = freshLiffIdToken();
    if (!token && isLiffClientBrowser() && !sessionUserRef.current) {
      // อยู่ใน LINE แต่ยังยืนยันตัวตนไม่ได้ — เก็บคิวไว้ ส่งต่อเมื่อ token พร้อม (effect ด้านล่าง)
      if (notifyOnAuthFail) {
        showToast("error", "ตรวจสอบสิทธิ์ LINE ไม่ผ่าน — ปิดหน้านี้แล้วเปิดลิงก์แจ้งซ่อมจาก LINE อีกครั้ง");
      }
      return;
    }
    flushingRef.current = true;
    setFlushingQueue(true);
    try {
      const items = await queueAll();
      for (const item of items) {
        try {
          const res = await apiFetch("/api/v1/repair.php", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(token ? { "X-LIFF-Id-Token": token } : {}) },
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
    flushingRef.current = false;
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
    const onOnline = () => { flushQueue(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // replay ตอน mount อาจยังไม่มี token (LiffBridge กำลัง init) — เมื่อ token มาถึง ให้ส่งคิวอีกครั้ง
  const autoFlushToken = useRef("");
  useEffect(() => {
    if (!liff.idToken || autoFlushToken.current === liff.idToken) return;
    autoFlushToken.current = liff.idToken;
    if (offlineQueued > 0 && navigator.onLine) flushQueue();
  }, [liff.idToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedAsset?.department_id) {
      const d = depts.find((x) => x.id === selectedAsset.department_id);
      if (d && !form.departmentCode) update("departmentCode", d.code);
    }
  }, [selectedAsset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ดึงข้อมูลผู้แจ้งจากข้อมูลที่ลงทะเบียนไว้ในระบบ (department/phone/email)
  useEffect(() => {
    if (reporterDeptId == null || depts.length === 0) return;
    const d = depts.find((x) => x.id === reporterDeptId);
    if (d) setForm((prev) => (prev.departmentCode ? prev : { ...prev, departmentCode: d.code }));
  }, [reporterDeptId, depts]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- ร่างฟอร์มในเครื่อง (lib/repair-draft) ----------
     token LIFF อายุ ~1 ชม.: เปิดลิงก์จาก LINE ใหม่แล้วไม่ต้องกรอกเครื่องจักร/อาการ/รูปซ้ำ
     ร่างเก็บใน localStorage ของเครื่องนี้เท่านั้น (ไม่ขึ้นเซิร์ฟเวอร์) และผูกกับ LINE user id เจ้าของร่าง */
  const draftRestoredRef = useRef(false);
  // true เมื่ออ่านร่างเสร็จแล้ว — กัน effect บันทึกด้านล่างลบร่างทิ้งก่อนที่ค่าจะถูกกู้คืน
  const [draftHydrated, setDraftHydrated] = useState(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    const draft = loadRepairDraft();
    if (draft) {
      // ทับค่าที่ระบบเติมให้ (ชื่อ/เบอร์จากบัญชี) ด้วยค่าที่ผู้ใช้กรอกค้างไว้
      setForm((prev) => ({ ...prev, ...draft.form }));
      // เปิดกลับไปขั้นที่กรอกค้างไว้ แต่ไม่ข้ามขั้นที่ข้อมูลยังขาด
      setStep(Math.min(draft.step, firstIncompleteStep(draft.form, Boolean(draft.form.machineCode))));
      showToast("info", "กู้คืนร่างที่กรอกไว้แล้ว — กรอกต่อได้เลย");
    }
    setDraftHydrated(true);
  }, [showToast]);

  /* เก็บร่างตามที่ผู้ใช้กรอก (debounce กันเขียน localStorage ทุกตัวอักษร) */
  const draftWarnedRef = useRef(false);
  // อ่านค่าล่าสุดใน timer — กัน timer ที่ตั้งไว้ก่อนกดส่ง เขียนร่างกลับมาหลังส่งสำเร็จแล้วล้างทิ้ง
  const submittedRef = useRef(false);
  submittedRef.current = submitted;
  useEffect(() => {
    if (!draftHydrated || submitted) return;
    const timer = setTimeout(() => {
      if (submittedRef.current) return;
      if (!hasDraftContent(form)) {
        clearRepairDraft();
        return;
      }
      const result = saveRepairDraft({ step, form });
      if (result === "failed" && !draftWarnedRef.current) {
        draftWarnedRef.current = true;
        showToast("error", "บันทึกร่างในเครื่องไม่สำเร็จ — อย่าปิดหน้านี้ก่อนกดส่งงาน");
      } else if (result === "without_photos" && !draftWarnedRef.current) {
        draftWarnedRef.current = true;
        showToast("info", "พื้นที่เก็บร่างในเครื่องเต็ม — เก็บข้อความไว้แล้ว แต่ต้องแนบรูปใหม่");
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [form, step, submitted, draftHydrated, showToast]);

  // "อื่นๆ" นับว่าเลือกเครื่องแล้ว; เครื่องที่ลงทะเบียนต้องมีอยู่ในรายการจริง
  const machineChosen = isOtherMachine || !!selectedAsset;
  // ความครบของแต่ละขั้นมาจาก lib/repair-form-steps ที่เดียว (ใช้ร่วมกับการกู้คืนร่าง)
  const canNext = () => canAdvanceFrom(step, form, machineChosen);

  // D1: ลดจำนวนคลิก — ตั้งค่าเริ่มต้นที่ปลอดภัยจาก repair_options (job description แรกเมื่อเลือก job type)
  // และเลื่อนขั้นอัตโนมัติเมื่อขั้นปัจจุบันครบ เพื่อไม่ต้องกด "ถัดไป" เอง
  useEffect(() => {
    if (form.jobType && !form.jobDescription && jobDescriptionOptions.length > 0) {
      setForm((prev) => (prev.jobDescription ? prev : { ...prev, jobDescription: jobDescriptionOptions[0].value }));
    }
    const next = firstIncompleteStep(form, machineChosen);
    const target = Math.min(next, REPAIR_STEP_COUNT - 1);
    if (target > step) setStep(target);
  }, [form, machineChosen, jobDescriptionOptions, step]);

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

  /* ── วิดีโอจุดชำรุด (staging อัปโหลดทันทีเมื่อเลือก — ต้องออนไลน์) ── */
  const uploadVideo = async (file: File) => {
    setVideoErr(null);
    if (!navigator.onLine) {
      setVideoErr("ต้องออนไลน์เพื่อแนบวิดีโอ — รูปถ่ายยังแนบได้แม้ไม่มีเน็ต");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setVideoErr("วิดีโอใหญ่เกิน 25 MB — โปรดลดความยาว/คุณภาพแล้วลองอีกครั้ง");
      return;
    }
    if (!/^video\//.test(file.type)) {
      setVideoErr("ต้องเป็นไฟล์วิดีโอ (mp4/mov/webm)");
      return;
    }
    setVideoBusy(true);
    try {
      const csrf = await (await apiFetch("/api/v1/csrf.php")).json();
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch("/api/v1/repair_video.php", {
        method: "POST",
        headers: { "X-CSRF-Token": csrf.csrf_token },
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (j?.success && j?.path) {
        update("video", j.path);
        setVideoErr(null);
      } else {
        setVideoErr(j?.error || "อัปโหลดวิดีโอไม่สำเร็จ — ลองอีกครั้ง");
      }
    } catch {
      setVideoErr("อัปโหลดวิดีโอไม่สำเร็จ — ตรวจเน็ตแล้วลองอีกครั้ง");
    }
    setVideoBusy(false);
  };

  /* ── ไฟล์เอกสารแนบ (staging อัปโหลดทันทีเมื่อเลือก — ต้องออนไลน์) ── */
  const uploadAttachment = async (file: File) => {
    setAttachErr(null);
    if (!navigator.onLine) {
      setAttachErr("ต้องออนไลน์เพื่อแนบไฟล์เอกสาร");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAttachErr("ไฟล์เอกสารใหญ่เกิน 10 MB — โปรดลดขนาดไฟล์แล้วลองอีกครั้ง");
      return;
    }
    setAttachBusy(true);
    try {
      const csrf = await (await apiFetch("/api/v1/csrf.php")).json();
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch("/api/v1/repair_form_attachment.php", {
        method: "POST",
        headers: { "X-CSRF-Token": csrf.csrf_token },
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (j?.success && j?.path) {
        update("attachment", j.path);
        setAttachErr(null);
      } else {
        setAttachErr(j?.error || "อัปโหลดไฟล์เอกสารไม่สำเร็จ — ลองอีกครั้ง");
      }
    } catch {
      setAttachErr("อัปโหลดไฟล์เอกสารไม่สำเร็จ — ตรวจเน็ตแล้วลองอีกครั้ง");
    }
    setAttachBusy(false);
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
        title: `[${selectedAsset?.code || machineDisplay}] ${jt?.en || ""} / ${jd?.en || ""}`,
        description: form.symptoms,
        failure_report: `Machine: ${machineDisplay} | JobType: ${jt?.en || "-"} | JobDescription: ${jd?.en || "-"} | Lot: ${form.lotNo || "-"}`,
        asset_id: selectedAsset?.id || null,
        // แผนก: ที่เลือกในฟอร์ม → แผนกในโปรไฟล์ผู้แจ้ง → แผนกของเครื่องจักร
        department_id: dept?.id || reporterDeptId || selectedAsset?.department_id || null,
        source_type: sourceTypeMap[form.jobDescription] || "breakdown",
        machine_status: machineStatusOptions.find((s) => s.value === form.machineStatus)?.label,
        priority: priorityMap[form.machineStatus] || "medium",
        status: "pending",
        safety_related: form.safetyRelated ? 1 : 0,
        product_lot_no: form.lotNo,
        before_image_path: form.photos.length > 0 ? form.photos.join("|") : null,
        video_path: form.video || null,
        attachment_path: form.attachment || null,
        receiver_name: form.reporterName,
        reporter_phone: form.phone,
        is_urgent: form.isUrgent ? 1 : 0,
        reporter_email: form.email || null,
        office: form.office,
      };
      // เจ้าของงาน (created_by) ให้ server ตัดสินจาก LIFF ID token (header ด้านล่าง) หรือ session
      // — ไม่ส่ง line_user_id จาก client อีก เพราะใครก็ส่ง uid ของคนอื่นได้
      // token อายุ ~1 ชม.: ขอใหม่ก่อนส่งเสมอ ไม่งั้นงานจะถูกบันทึกเป็นงานไม่มีเจ้าของ
      const token = freshLiffIdToken();
      const needsLiff = isLiffClientBrowser() && !sessionUserRef.current;
      // ออฟไลน์: ยังเก็บงานลงคิวได้ (replay จะขอ token ใหม่ตอนออนไลน์) — บล็อกเฉพาะตอนกำลังจะยิงจริง
      if (needsLiff && navigator.onLine && !token) {
        showToast("error", "ตรวจสอบสิทธิ์ LINE ไม่ผ่าน — ปิดหน้านี้แล้วเปิดลิงก์แจ้งซ่อมจาก LINE อีกครั้ง");
        setSubmitting(false);
        return;
      }
      const expiresAt = token ? idTokenExpiresAt(token) : 0;
      if (needsLiff && navigator.onLine && expiresAt > 0 && expiresAt * 1000 <= Date.now()) {
        // ร่างฟอร์มถูกเก็บไว้ในเครื่องแล้ว (lib/repair-draft) — เปิดลิงก์ใหม่แล้วกรอกต่อได้
        showToast("error", "เซสชัน LINE หมดอายุแล้ว — ปิดหน้านี้แล้วเปิดลิงก์แจ้งซ่อมจาก LINE อีกครั้ง (ร่างที่กรอกไว้ยังอยู่ เปิดมาแล้วกรอกต่อได้เลย)");
        setSubmitting(false);
        return;
      }

      let res: Response;
      try {
        res = await apiFetch("/api/v1/repair.php", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { "X-LIFF-Id-Token": token } : {}) },
          body: JSON.stringify(payload),
        });
      } catch {
        try {
          await queueAdd(payload);
          clearRepairDraft(); // งานถูกเก็บในคิว offline แล้ว — ไม่ต้องเก็บร่างซ้ำ
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
        clearRepairDraft(); // ส่งสำเร็จแล้ว — ล้างร่างในเครื่อง
        setCreatedWoNo(json.work_order_no || `WO-${json.id}`);
        setSubmitted(true);
        showToast("success", "ส่งแจ้งซ่อมสำเร็จ");
      } else {
        showToast("error", json.error || "ส่งไม่สำเร็จ ลองอีกครั้ง");
      }
    } catch (e) {
      console.error("Submit failed", e);
      showToast("error", "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
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
            {selectedAsset?.code || machineDisplay} · {machineStatusOptions.find((s) => s.value === form.machineStatus)?.label}
            {"\n"}{offlineQueued > 0 ? "ไม่มีอินเทอร์เน็ต — งานถูกบันทึกไว้ในเครื่อง จะส่งให้อัตโนมัติเมื่อกลับมาออนไลน์" : "ช่างซ่อมได้รับแจ้งเตือนทาง LINE แล้ว"}
          </p>
          <div className="flex flex-col gap-2 w-full">
            <Button className="w-full" onClick={() => (window.location.href = "/repair/request?view=track")}>
              <ListChecks className="w-4 h-4" /> ดูรายการงานซ่อมของฉัน
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => {
              setSubmitted(false); setStep(0);
              clearRepairDraft();
              setForm({ machineCode: "", machineOther: "", machineStatus: "", jobType: "", jobDescription: "", symptoms: "", lotNo: "", reporterName: sessionName, departmentCode: "", office: OFFICES[0], phone: "", email: "", safetyRelated: false, photos: [], video: "", attachment: "", isUrgent: false });
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
<div className="cmms-liff-hero">
        <div className="flex items-center gap-3">
          <div className="cmms-liff-logo"><Wrench size={20} strokeWidth={1.75} /></div>
          <div className="flex-1 min-w-0">
            <p className="cmms-liff-eyebrow">MAINTENANCE JOB REQUEST · F-EN-03</p>
            <h1 className="cmms-liff-title">{tliff("liff.repair_header")}</h1>
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

          {bindGate === "verify_failed" && (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <div className="cmms-header-emoji mb-2"><ShieldAlert size={24} strokeWidth={1.75} /></div>
                <h4 className="text-base font-bold m-0 mb-1.5">{VERIFY_FAILED_TITLE}</h4>
                <p className="text-sm text-[var(--cmms-text-secondary)]">
                  {VERIFY_FAILED_BODY}
                </p>
                {verifyError && (
                  <p className="text-xs text-[var(--cmms-text-secondary)] mt-1.5">{verifyError}</p>
                )}
              </div>
              <Button
                className="w-full"
                disabled={!liff.idToken}
                onClick={() => checkBinding(liff.idToken)}
              >
                ลองตรวจสอบสิทธิ์อีกครั้ง
              </Button>
              {!liff.idToken && (
                <p className="text-sm text-[var(--cmms-text-secondary)] text-center mb-0">
                  ปิดหน้านี้แล้วเปิดลิงก์แจ้งซ่อมจาก LINE อีกครั้ง
                </p>
              )}
            </div>
          )}

          {bindGate === "unbound" && (
            <div className="flex flex-col gap-4">
              <div>
                <div className="cmms-header-emoji mb-2"><ShieldAlert size={24} strokeWidth={1.75} /></div>
                <h4 className="text-base font-bold m-0 mb-1.5">{UNBOUND_TITLE}</h4>
                <p className="text-sm text-[var(--cmms-text-secondary)] m-0">
                  {lineProfile?.name ? `สวัสดีคุณ ${lineProfile.name} — ` : ""}
                  {UNBOUND_BODY}
                </p>
              </div>

              <ol
                className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-sm"
                style={{ color: "var(--cmms-text-primary)" }}
              >
                {UNBOUND_STEPS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>

              <SupportContactStrip contact={supportContact} />

              <Input
                label="เลขพนักงาน (กรอกหลังแอดมินเพิ่มผู้ใช้แล้ว)"
                placeholder="เช่น E01117"
                value={bindEmpCode}
                onChange={(e) => setBindEmpCode(e.target.value.toUpperCase().slice(0, 6))}
              />
              {bindError && (
                <div className="bg-[var(--cmms-danger-light)] text-[var(--cmms-danger)] rounded-lg px-3 py-2 text-sm flex items-center gap-2">
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
  // ชื่อแผนกที่ใช้แสดงผล: ตัวเลือกในฟอร์ม → แผนกจากโปรไฟล์ที่ผูกไว้
  const deptLabel = depts.find((d) => d.code === form.departmentCode)?.name || reporterDeptName || "";

  return (
    <div className="cmms-mobile-page" id="repair-request-form">
      {/* Header */}
      <div className="cmms-liff-hero">
        <span className="cmms-liff-orbit" aria-hidden="true" />
        <div className="cmms-liff-hero-top">
          <div className="cmms-liff-logo"><Wrench size={20} strokeWidth={1.75} /></div>
          <div className="flex-1 min-w-0">
            <p className="cmms-liff-eyebrow">MAINTENANCE JOB REQUEST · F-EN-03</p>
            <h1 className="cmms-liff-title">{tliff("liff.repair_header")}</h1>
          </div>
          <LiffLangToggle />
          {lineProfile?.pic ? (
            <img src={lineProfile.pic} alt="LINE profile" className="cmms-avatar" />
          ) : (
            <div className="cmms-avatar cmms-avatar-fallback"><User size={18} strokeWidth={1.75} /></div>
          )}
        </div>

        {/* แถบตัวตนผู้แจ้ง + แผนก (เติมอัตโนมัติจากโปรไฟล์) */}
        <div className="cmms-liff-identity">
          <div className="cmms-liff-identity-avatar">{(displayName.trim().charAt(0) || "ผ").toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="cmms-liff-identity-name">{displayName}</p>
            <p className="cmms-liff-identity-meta">
              <Building2 size={12} strokeWidth={1.75} />
              <span className={deptLabel ? "" : "opacity-75"}>{deptLabel || "ยังไม่ระบุแผนก"}</span>
              <span className="cmms-liff-dot" aria-hidden="true">·</span>
              <span>{form.office}</span>
            </p>
          </div>
          <span className="cmms-liff-badge">
            <HardHat size={12} strokeWidth={1.75} /> {lineProfile ? "LINE" : "WEB"}
          </span>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="cmms-stepper">
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
              onClick={() => flushQueue(true)}
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
            <SectionHead
              index="01"
              title="เลือกเครื่องจักร / อุปกรณ์"
              hint="เลือกเครื่องที่ลงทะเบียนไว้ หรือกด “อื่นๆ” หากไม่มีในรายการ"
              required
            />

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

            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-[var(--cmms-text-secondary)]">เครื่องจักรอื่นๆ (ไม่ได้ลงทะเบียน)</p>
              <div className="cmms-chip-grid">
                <button type="button"
                  className={`cmms-chip ${form.machineCode === OTHER_MACHINE_CODE ? "selected" : ""}`}
                  onClick={() => update("machineCode", OTHER_MACHINE_CODE)}>
                  อื่นๆ — พิมพ์ชื่อเอง
                </button>
              </div>
              {isOtherMachine && (
                <Input
                  label="เครื่องจักรอื่นๆ"
                  isLabelHidden
                  placeholder="พิมพ์ชื่อ/รหัสเครื่องจักร เช่น เครื่องบรรจุ XYZ-01"
                  value={form.machineOther}
                  onChange={(e) => update("machineOther", e.target.value)}
                />
              )}
            </div>

            {isOtherMachine && (
              <div className="cmms-machine-summary">
                <div className="flex items-center gap-3">
                  <div className="cmms-machine-icon"><Building2 size={22} strokeWidth={1.75} /></div>
                  <div className="flex flex-col flex-1">
                    <p className="text-sm font-bold m-0">{form.machineOther.trim() || "ไม่ระบุเครื่องจักร"}</p>
                    <p className="text-xs text-[var(--cmms-text-secondary)] m-0">เครื่องจักรอื่น — พิมพ์เอง (ไม่ได้ลงทะเบียน) / ไม่มีเครื่องจักร</p>
                  </div>
                </div>
              </div>
            )}

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
              <SectionHead
                index="02"
                title="สถานะเครื่องจักร (Machine Status)"
                hint="แจ้งสถานะล่าสุดของเครื่อง เพื่อให้ช่างเตรียมการได้ถูก"
                required
              />
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
              <SectionHead index="01" title="ประเภทงาน (Job Type)" hint="งานซ่อมหรือปรับปรุงที่ต้องการแจ้ง" required />
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
              <SectionHead index="02" title="ลักษณะงาน (Job Description)" hint="ระบุว่าเป็นงานลักษณะใดเพื่อจัดช่างได้ตรงงาน" required />
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
              <SectionHead index="03" title="รายละเอียดของปัญหา (Problem Description)" hint="อธิบายอาการที่พบให้ชัดเจน ยิ่งละเอียดช่างยิ่งเข้าถึงปัญหาได้เร็ว" required />
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
              <SectionHead index="04" title="Lot No. ที่กำลังผลิต" hint="ถ้ามี — ช่วยให้วางแผนหยุดเครื่องได้ปลอดภัย" />
              <Input
                label="Lot No."
                isLabelHidden
                placeholder="ระบุ Lot No. สินค้าที่กำลังผลิต"
                value={form.lotNo}
                onChange={(e) => update("lotNo", e.target.value)}
              />
            </div>

          </div>
        </Card>
      )}

      {/* ============ STEP 3 : ผู้แจ้ง & รูป ============ */}
      {step === 2 && (
        <Card className="cmms-card-flat p-5">
          <div className="flex flex-col gap-5">
            <SectionHead
              index="01"
              title="ข้อมูลผู้แจ้ง"
              hint={lineProfile ? "ดึงข้อมูลจากบัญชี LINE แล้ว — แก้ไขได้ถ้าต้องการ" : "ดึงชื่อและแผนกจากระบบให้อัตโนมัติ"}
            />

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
                {reporterDeptName && (
                  <p className="cmms-field-hint">
                    <User size={12} strokeWidth={1.75} />
                    เติมจากโปรไฟล์ของคุณ: <b>{reporterDeptName}</b> — เปลี่ยนได้ถ้าแจ้งแทนแผนกอื่น
                  </p>
                )}
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

            {/* Photos + Video */}
            <div>
              <p className="text-sm font-bold mb-2">
                <Paperclip size={14} strokeWidth={1.75} className="inline align-[-2px]" /> แนบรูปถ่าย / วิดีโอ / ไฟล์เอกสาร
              </p>
              <p className="text-2xs text-[var(--cmms-text-secondary)] mb-2">
                รูป (สูงสุด 5 รูป) · วิดีโอ 1 คลิป ≤ 25 MB (mp4/mov/webm) · เอกสาร 1 ไฟล์ ≤ 10 MB (PDF/DOC/XLS/CSV/ZIP) — รูปวิดีโอและเอกสารต้องออนไลน์
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
              {/* กล้อง: capture="environment" เปิดโหมดถ่ายวิดีโอทันทีบนมือถือ (LINE/iOS/Android) */}
              <input
                ref={videoCameraRef}
                type="file"
                accept="video/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) uploadVideo(f);
                }}
              />
              {/* คลังวิดีโอในเครื่อง — ไม่ใส่ capture เพื่อให้เลือกไฟล์ที่มีอยู่ได้ */}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) uploadVideo(f);
                }}
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
                {form.video && (
                  <div className="cmms-photo-thumb">
                    <video src={form.video} controls preload="metadata" playsInline className="w-full h-full object-cover" />
                    <button type="button" className="cmms-photo-remove"
                      onClick={() => update("video", "")} aria-label="เอาวิดีโอออก">
                      <X size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                )}
                {!form.video && (
                  <>
                    <button
                      type="button"
                      className="cmms-photo-add"
                      onClick={() => videoCameraRef.current?.click()}
                      disabled={videoBusy}
                      aria-label="ถ่ายวิดีโอด้วยกล้อง"
                    >
                      {videoBusy ? (
                        <Loader2 size={24} strokeWidth={1.75} className="animate-spin" />
                      ) : (
                        <Video size={24} strokeWidth={1.75} />
                      )}
                      <p className="text-2xs font-bold m-0">{videoBusy ? "กำลังส่งวิดีโอ…" : "ถ่ายวิดีโอ"}</p>
                    </button>
                    <button
                      type="button"
                      className="cmms-photo-add"
                      onClick={() => videoInputRef.current?.click()}
                      disabled={videoBusy}
                      aria-label="เลือกวิดีโอจากเครื่อง"
                    >
                      <Paperclip size={24} strokeWidth={1.75} />
                      <p className="text-2xs font-bold m-0">เลือกจากเครื่อง</p>
                    </button>
                  </>
                )}
              </div>
              <input
                ref={attachInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) uploadAttachment(f);
                }}
              />
              {attachErr && (
                <div className="bg-[var(--cmms-danger-light)] text-[var(--cmms-danger)] rounded-lg px-3 py-2 text-sm flex items-center gap-2 mt-2">
                  <AlertCircle size={16} strokeWidth={1.75} /> {attachErr}
                </div>
              )}
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                {form.attachment && (
                  <div className="flex items-center gap-2 rounded-lg border border-[var(--cmms-border)] px-3 py-2 text-sm">
                    <FileText size={16} strokeWidth={1.75} />
                    <span>ไฟล์เอกสารแนบแล้ว</span>
                    <button type="button" aria-label="เอาไฟล์เอกสารออก" className="inline-flex items-center justify-center rounded-full bg-[var(--cmms-warning-light)] text-[var(--cmms-warning)] p-1"
                      onClick={() => update("attachment", "")}>
                      <X size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                )}
                {!form.attachment && (
                  <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-dashed border-[var(--cmms-border)] px-3 py-2 text-sm font-semibold"
                    onClick={() => attachInputRef.current?.click()}
                    disabled={attachBusy}
                    aria-label="แนบไฟล์เอกสาร">
                    {attachBusy ? <Loader2 size={16} strokeWidth={1.75} className="animate-spin" /> : <Paperclip size={16} strokeWidth={1.75} />}
                    {attachBusy ? "กำลังส่งไฟล์เอกสาร…" : "แนบไฟล์เอกสาร (PDF/DOC/XLS/CSV/ZIP)"}
                  </button>
                )}
              </div>
              {videoErr && (
                <div className="bg-[var(--cmms-danger-light)] text-[var(--cmms-danger)] rounded-lg px-3 py-2 text-sm flex items-center gap-2 mt-2">
                  <AlertCircle size={16} strokeWidth={1.75} /> {videoErr}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ============ STEP 4 : ยืนยัน ============ */}
      {step === 3 && (
        <Card className="cmms-card-flat p-5">
          <div className="flex flex-col gap-4">
            <SectionHead index="✓" title="ตรวจสอบก่อนส่ง" hint="ตรวจข้อมูลอีกครั้งก่อนส่งให้แผนกซ่อมบำรุง" />

            <div className="cmms-summary-box">
              <SummaryRow label="เครื่องจักร" value={machineDisplay} />
              <SummaryRow label="สถานะเครื่อง" value={machineStatusOptions.find((s) => s.value === form.machineStatus)?.label || "—"} />
              <SummaryRow label="ประเภทงาน" value={`${jobTypeOptions.find((j) => j.value === form.jobType)?.label || "—"} / ${jobDescriptionOptions.find((j) => j.value === form.jobDescription)?.label || "—"}`} />
              <SummaryRow label="ผู้แจ้ง" value={`${form.reporterName} (${deptLabel || "—"})`} icon={<User size={14} strokeWidth={1.75} />} />
              <SummaryRow label="ติดต่อ" value={[form.phone, form.email].filter(Boolean).join(" · ") || "—"} icon={<Phone size={14} strokeWidth={1.75} />} />
              <SummaryRow label="สำนักงาน" value={form.office} />
              <SummaryRow label="Lot No." value={form.lotNo || "—"} />
              <SummaryRow label="วันที่แจ้ง" value={new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })} icon={<Clock size={14} strokeWidth={1.75} />} />
              <SummaryRow label="วิดีโอ" value={form.video ? "แนบแล้ว" : "—"} icon={<Video size={14} strokeWidth={1.75} />} />
              <SummaryRow label="ไฟล์เอกสาร" value={form.attachment ? "แนบแล้ว" : "—"} icon={<FileText size={14} strokeWidth={1.75} />} />
            </div>

            <div>
              <p className="text-xs font-bold text-[var(--cmms-text-secondary)]">รายละเอียดปัญหา</p>
              <div className="cmms-summary-text">{form.symptoms}</div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {form.safetyRelated && <Badge variant="danger">Safety</Badge>}
              {form.photos.length > 0 && <Badge variant="info">{form.photos.length} รูป</Badge>}
              {form.video && <Badge variant="info">แนบวิดีโอ</Badge>}
              {form.attachment && <Badge variant="info">แนบไฟล์เอกสาร</Badge>}
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
        <div className="cmms-bottom-meta">
          <span>{step + 1}/4 · {tliff(`liff.step_${STEPS[step].key}`)}</span>
          <div className="cmms-bottom-progress" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={i <= step ? "on" : ""} />
            ))}
          </div>
        </div>
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
    <div className="cmms-field">
      <p className="cmms-field-label">
        {label} {required && <span className="cmms-req">*</span>}
      </p>
      {children}
    </div>
  );
}

/** หัวข้อของแต่ละส่วนในฟอร์ม — เลขลำดับ + ชื่อ + คำใบ้ (ไม่เปลี่ยนข้อความหลักที่ e2e ใช้ค้น) */
function SectionHead({ index, title, hint, required }: { index: string; title: string; hint?: string; required?: boolean }) {
  return (
    <div className="cmms-form-section-head">
      <span className="cmms-form-section-num" aria-hidden="true">{index}</span>
      <div className="min-w-0">
        <p className="cmms-form-section-title">
          {title} {required && <span className="cmms-req">*</span>}
        </p>
        {hint && <p className="cmms-form-section-hint">{hint}</p>}
      </div>
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
