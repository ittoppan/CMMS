"use client";

import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import {
  CheckCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  BuildingOffice2Icon,
  UserIcon,
  ClockIcon,
  CameraIcon,
  PhoneIcon,
  EnvelopeIcon,
  XMarkIcon,
  PaperClipIcon,
} from "@heroicons/react/24/outline";
import LiffLangToggle from "./LiffLangToggle";
import { tliff, useLiffLang } from "@/lib/i18n-liff";
import { runQueueMigrationOnce, exposeQueueMigration } from "@/lib/queue-migration";

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

const MACHINE_GROUPS = [
  { label: "เครื่องพิมพ์", emoji: "🖨️", prefix: "A-PT" },
  { label: "ลามิเนต", emoji: "🧴", prefix: "A-DL" },
  { label: "รีไวเดอร์", emoji: "🌀", prefix: "A-RW" },
  { label: "สลิตเตอร์", emoji: "✂️", prefix: "A-ST" },
  { label: "เครื่องทำถุง", emoji: "🛍️", prefix: "A-BM" },
];

const MACHINE_STATUS_OPTIONS = [
  { value: "breakdown", label: "Break Down", th: "เครื่องหยุดทำงาน", emoji: "🔴", color: "var(--cmms-danger)" },
  { value: "wait", label: "Wait for Maintenance", th: "ยังทำงานได้ รอการซ่อม", emoji: "🟡", color: "var(--cmms-warning)" },
  { value: "running", label: "Still working", th: "รอโอกาสหยุดเครื่อง (เร็วๆ นี้)", emoji: "🟢", color: "var(--cmms-success)" },
];

const JOB_TYPES = [
  { value: "Machinery", label: "เครื่องจักร", en: "Machinery", emoji: "⚙️", desc: "งานเครื่องจักรผลิต" },
  { value: "Equipment Support", label: "อุปกรณ์สนับสนุน", en: "Equipment Support", emoji: "🛠️", desc: "อุปกรณ์ประกอบการผลิต" },
  { value: "Facilities", label: "โครงสร้างพื้นฐาน", en: "Facilities", emoji: "🏭", desc: "อาคาร / สาธารณูปโภค" },
  { value: "Other", label: "อื่นๆ", en: "Other", emoji: "📦", desc: "งานอื่นที่ไม่อยู่หมวดข้างต้น" },
];

const JOB_DESCRIPTIONS = [
  { value: "Maintenance", label: "ซ่อมบำรุง", en: "Maintenance", emoji: "🔧" },
  { value: "PM", label: "บำรุงเชิงป้องกัน", en: "PM / Preventive", emoji: "📋" },
  { value: "Modify", label: "ปรับปรุง / ดัดแปลง", en: "Modify", emoji: "🔄" },
  { value: "Build", label: "สร้าง / จัดทำใหม่", en: "Build", emoji: "🏗️" },
];

const OFFICES = ["โรงงานอมตะซิตี้ (ระยอง)"];

const STEPS = [
  { key: "machine", label: "เครื่องจักร", icon: "⚙️" },
  { key: "details", label: "รายละเอียดงาน", icon: "📝" },
  { key: "reporter", label: "ผู้แจ้ง & รูป", icon: "🧑‍🔧" },
  { key: "confirm", label: "ยืนยัน", icon: "✅" },
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
    // เปิดเวอร์ชันล่าสุด (ไม่ระบุ version) — กัน VersionError ถ้า store อื่น (เช่น offline-store.ts) ขยับเวอร์ชันขึ้น
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
  useLiffLang(); // re-render ตามภาษาที่สลับ
  const [step, setStep] = useState(0);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [lineProfile, setLineProfile] = useState<LineProfile>(null);
  const [sessionName, setSessionName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [offlineNow, setOfflineNow] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [createdWoNo, setCreatedWoNo] = useState<string | null>(null);
  const [offlineQueued, setOfflineQueued] = useState(0);
  const [flushingQueue, setFlushingQueue] = useState(false);
  // รายการในคิว offline (สำหรับแสดง + ลบทีละรายการ)
  const [queueItems, setQueueItems] = useState<{ id: number; label: string }[]>([]);
  const [lineBound, setLineBound] = useState<boolean | null>(null); // null=ยังไม่รู้, true/false=สถานะผูก
  // เกตบังคับผูกบัญชี: checking=ตรวจอยู่, bound=ผูกแล้ว (เห็นฟอร์ม), unbound=มี LINE ID แต่ยังไม่ผูก, anonymous=ไม่มี LINE ID เลย
  const [bindGate, setBindGate] = useState<"checking" | "bound" | "unbound" | "anonymous" | "webchoice">("checking");
  const [bindEmpCode, setBindEmpCode] = useState("");
  const [bindError, setBindError] = useState<string | null>(null);
  const [bindSubmitting, setBindSubmitting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

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
  });

  const update = (key: string, value: string | boolean | string[]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /* ---- fetch wrapper: ส่ง ngrok-skip-browser-warning เพื่อข้าม interstitial
     เมื่อเปิดผ่าน ngrok (LIFF) — ไม่มีผลเมื่อเรียกผ่าน localhost ---- */
  const apiFetch = (url: string, init?: RequestInit) =>
    fetch(url, { ...init, headers: { "ngrok-skip-browser-warning": "1", ...(init?.headers || {}) } });

  /* ---- QR scan prefill: ?asset_code=A-PT-01 เปิดฟอร์มพร้อมเลือกเครื่อง ---- */
  const qrPrefillRef = useRef<string | null>(null);
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("asset_code");
      if (p) qrPrefillRef.current = p.trim().toUpperCase();
    } catch { /* ignore */ }
  }, []);

  // ติดตามสถานะ offline — แสดง banner บอกว่ากรอกได้ แต่จะส่งเมื่อกลับมาออนไลน์
  useEffect(() => {
    const update = () => setOfflineNow(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  /* ---- โหลดเครื่องจักรจริง + แผนก + ผู้ใช้ session + LINE profile ---- */
  useEffect(() => {
    apiFetch("/api/v1/asset_registry.php")
      .then((r) => r.json())
      .then((rows: Asset[]) => {
        const machines = (Array.isArray(rows) ? rows : [])
          .filter((a) => a.category === "Machine" || /^A-[A-Z]{2}-\d{2}$/.test(a.code))
          .sort((a, b) => a.code.localeCompare(b.code));
        setAssets(machines);
        // ถ้ามาจาก QR scan → เลือกเครื่องนั้นอัตโนมัติ
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

    apiFetch("/api/v1/line_notify.php")
      .then((r) => r.json())
      .then((j) => {
        setSessionName(j?.me?.full_name || "");
        // ล็อกอิน User/Password ผ่านเว็บแล้ว (มี session) → ผ่านเกตเลย
        if (j?.me?.id) setBindGate("bound");
      })
      .catch(() => {});

    // ---- เกตบังคับผูกบัญชี LINE: ตัดสินสถานะ (bound/unbound/anonymous) ----
    const applyGate = (uid: string | null, bound: boolean) => {
      setBindGate(bound ? "bound" : uid ? "unbound" : "anonymous");
    };
    const checkBound = async (uid: string): Promise<boolean> => {
      try {
        const r = await fetch(`/api/v1/line_register.php?line_user_id=${encodeURIComponent(uid)}`, {
          headers: { "ngrok-skip-browser-warning": "1" },
        });
        const j = await r.json().catch(() => ({}));
        return !!(j?.bound && j?.user);
      } catch {
        return false;
      }
    };

    // สถานะผูก LINE กับเลขพนักงาน (LiffBridge เก็บไว้ตอน init)
    try {
      if (localStorage.getItem("cmms_line_bound") === "1") {
        setLineBound(true);
        setBindGate("bound");
        const boundName = localStorage.getItem("cmms_line_full_name");
        if (boundName) setForm((prev) => ({ ...prev, reporterName: boundName || prev.reporterName }));
      } else {
        const storedUid = localStorage.getItem("cmms_line_user_id");
        if (storedUid) {
          setLineBound(false); // มี LINE userId แต่ยังไม่ผูก → เกต unbound
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
          // ยังไม่รู้ LINE ID — LiffBridge อาจ init ยังไม่เสร็จ → ตรวจซ้ำอีกที
          window.setTimeout(() => {
            const uid = localStorage.getItem("cmms_line_user_id");
            if (uid) {
              checkBound(uid).then((b) => {
                setLineBound(b);
                applyGate(uid, b);
              });
              return;
            }
            // ยังไม่มี LINE ID เลย: เช็ค session (User/Password) ก่อน
            apiFetch("/api/v1/line_notify.php")
              .then((r) => r.json())
              .then((j) => {
                if (j?.me?.id) {
                  setSessionName(j.me.full_name || "");
                  setBindGate("bound"); // เข้าเว็บด้วย User/Password → ผ่าน
                } else if ((window as any).liff?.isInClient?.()) {
                  setBindGate("unbound"); // อยู่ใน LINE (LIFF) → บังคับ LINE login / ผูก
                } else {
                  setBindGate("webchoice"); // เว็บภายนอก → เลือก LINE หรือ User/Password
                }
              })
              .catch(() => setBindGate("webchoice"));
          }, 2500);
        }
      }
    } catch { /* ignore */ }

    // ?uid= — จำลอง LINE userId เมื่อเปิดนอก LINE (ทดสอบ / เปิดจากลิงก์ตรง)
    const simUid = new URLSearchParams(window.location.search).get("uid");
    if (simUid) {
      try { localStorage.setItem("cmms_line_user_id", simUid); } catch { /* ignore */ }
      fetch(`/api/v1/line_register.php?line_user_id=${encodeURIComponent(simUid)}`, {
        headers: { "ngrok-skip-browser-warning": "1" },
      })
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

    // LINE profile ถ้าเปิดอยู่ใน LINE
    const tryLiff = () => {
      try {
        if ((window as any).liff?.isLoggedIn?.()) {
          (window as any).liff.getProfile().then((p: any) => {
            setLineProfile({ name: p.displayName || "", pic: p.pictureUrl || "", userId: p.userId || "" });
            setForm((prev) => ({ ...prev, reporterName: p.displayName || prev.reporterName }));
            // อัปเดตสถานะผูกแบบ real-time
            if (p.userId) {
              fetch(`/api/v1/line_register.php?line_user_id=${encodeURIComponent(p.userId)}`, {
                headers: { "ngrok-skip-browser-warning": "1" },
              })
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
      } catch { /* liff ยังไม่พร้อม — ใช้ session name แทน */ }
    };
    const timer = window.setTimeout(tryLiff, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  // ---- เกต: ผูกบัญชี LINE (บังคับก่อนแจ้งซ่อม) ----
  const effectiveUid = (() => {
    try {
      return (
        lineProfile?.userId ||
        localStorage.getItem("cmms_line_user_id") ||
        new URLSearchParams(window.location.search).get("uid") ||
        ""
      );
    } catch {
      return lineProfile?.userId || ""; // SSR / ไม่มี window
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
      } else {
        setBindError(j?.error || "ผูกไม่สำเร็จ — ตรวจรหัสพนักงานแล้วลองอีกครั้ง");
      }
    } catch {
      setBindError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ ลองอีกครั้ง");
    }
    setBindSubmitting(false);
  };

  const selectedAsset = assets.find((a) => a.code === form.machineCode) || null;

  /* ---- รายการคิว offline — อ่านจาก IndexedDB (แสดงชื่อ + ลบทีละรายการ) ---- */
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

  // ลบงานที่ค้างส่งทีละรายการ (กันส่งงานที่กรอกผิด)
  const removeQueuedItem = async (id: number) => {
    try {
      await queueRemove(id);
      setOfflineQueued((n) => Math.max(0, n - 1));
      setQueueItems((prev) => prev.filter((x) => x.id !== id));
      // badge bottom nav อัปเดต
      try { window.dispatchEvent(new Event("cmms:offline-queued")); } catch { /* ignore */ }
    } catch { /* ลบไม่สำเร็จ — ข้าม */ }
  };

  /* ---- Flush offline queue: ส่งงานที่ค้างทั้งหมด (อัตโนมัติเมื่อออนไลน์กลับมา + ปุ่ม "ส่งตอนนี้") ---- */
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
            // badge bottom nav อัปเดต
            try { window.dispatchEvent(new Event("cmms:offline-queued")); } catch { /* ignore */ }
          }
        } catch { /* รายการนี้ยังส่งไม่ได้ — ข้ามไปลองรายการถัดไป */ }
      }
    } catch { /* ยังออฟไลน์อยู่ — ลองครั้งหน้า */ }
    refreshQueueItems();
    setFlushingQueue(false);
  };

  useEffect(() => {
    // เปิดให้สั่งย้ายมือจาก DevTools: window.__cmmsMigrateQueues()
    exposeQueueMigration();
    // ย้ายงานที่ค้างจาก IndexedDB รุ่นเก่า (VersionError) เข้าคิวปัจจุบัน ก่อนอ่านคิว
    runQueueMigrationOnce()
      .then(() => queueAll())
      .then((items) => {
        if (items.length > 0) setOfflineQueued(items.length);
        refreshQueueItems();
        if (navigator.onLine) flushQueue();
      })
      .catch(() => { /* ยังออฟไลน์อยู่ — ลองครั้งหน้า */ });
    window.addEventListener("online", flushQueue);
    return () => window.removeEventListener("online", flushQueue);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // เมื่อเลือกเครื่อง → auto เติมแผนก (ถ้ายังไม่ได้เลือกเอง)
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
      const sourceTypeMap: Record<string, string> = { Maintenance: "breakdown", PM: "pm", Modify: "modify", Build: "build" };
      const jt = JOB_TYPES.find((j) => j.value === form.jobType);
      const jd = JOB_DESCRIPTIONS.find((j) => j.value === form.jobDescription);
      const dept = depts.find((d) => d.code === form.departmentCode);

      const payload = {
        title: `[${selectedAsset?.code || form.machineCode}] ${jt?.en || ""} / ${jd?.en || ""}`,
        description: form.symptoms,
        failure_report: `JobType: ${jt?.en || "-"} | JobDescription: ${jd?.en || "-"} | Lot: ${form.lotNo || "-"}`,
        asset_id: selectedAsset?.id || null,
        department_id: dept?.id || selectedAsset?.department_id || null,
        source_type: sourceTypeMap[form.jobDescription] || "breakdown",
        machine_status: MACHINE_STATUS_OPTIONS.find((s) => s.value === form.machineStatus)?.label,
        contaminate_checking: form.contaminateChecking || "not_checked",
        outsource_by: form.outsourceBy?.trim() || null,
        priority: priorityMap[form.machineStatus] || "medium",
        status: "pending",
        safety_related: form.safetyRelated ? 1 : 0,
        product_lot_no: form.lotNo,
        before_image_path: form.photos.length > 0 ? form.photos.join("|") : null,
        receiver_name: form.reporterName,
        reporter_phone: form.phone,
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
        // ไม่มีเน็ต → เก็บเข้า offline queue แล้วบอกผู้ใช้
        try {
          await queueAdd(payload);
          setOfflineQueued((n) => n + 1);
          // badge bottom nav อัปเดต
          try { window.dispatchEvent(new Event("cmms:offline-queued")); } catch { /* ignore */ }
          setSubmitted(true);
          setCreatedWoNo("SAVED-OFFLINE");
        } catch {
          setSubmitError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ และบันทึก offline ก็ไม่สำเร็จ");
        }
        setSubmitting(false);
        return;
      }
      const json = await res.json();
      if (json.success || json.id) {
        setCreatedWoNo(json.work_order_no || `WO-${json.id}`);
        setSubmitted(true);
      } else {
        setSubmitError(json.error || "ส่งไม่สำเร็จ ลองอีกครั้ง");
      }
    } catch (e) {
      console.error("Submit failed", e);
      setSubmitError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    }
    setSubmitting(false);
  };

  /* ---------- หน้า Success ---------- */
  if (submitted) {
    return (
      <div className="cmms-success-overlay" onClick={() => (window.location.href = "/repair")}>
        <div className="cmms-success-card" onClick={(e) => e.stopPropagation()}>
          <div className="cmms-success-icon">
            <CheckCircleIcon style={{ width: 36, height: 36 }} />
          </div>
          <Heading level={3} style={{ marginBottom: 8 }}>{tliff("liff.repair_success")}</Heading>
          <Text type="body" color="secondary" style={{ marginBottom: 4 }}>
            ใบแจ้งซ่อม (F-EN-03) เลขที่
          </Text>
          <div className="cmms-success-wo">{createdWoNo}</div>
          <Text type="body" size="sm" color="secondary" style={{ textAlign: "center", marginBottom: 20 }}>
            {selectedAsset?.code} · {MACHINE_STATUS_OPTIONS.find((s) => s.value === form.machineStatus)?.label}
            {"\n"}{offlineQueued > 0 ? "📴 ไม่มีอินเทอร์เน็ต — งานถูกบันทึกไว้ในเครื่อง จะส่งให้อัตโนมัติเมื่อกลับมาออนไลน์" : "ช่างซ่อมได้รับแจ้งเตือนทาง LINE แล้ว 📲"}
          </Text>
          <VStack gap={2} style={{ width: "100%" }}>
            <Button label="📋 ดูรายการงานซ่อม" variant="primary" width="100%" onClick={() => (window.location.href = "/repair")} />
            <Button label="แจ้งซ่อมอีก" variant="secondary" width="100%" onClick={() => {
              setSubmitted(false); setStep(0);
              setForm({ machineCode: "", machineStatus: "", jobType: "", jobDescription: "", symptoms: "", lotNo: "", contaminateChecking: "not_checked", outsourceBy: "", reporterName: sessionName, departmentCode: "", office: OFFICES[0], phone: "", email: "", contaminationRisk: false, safetyRelated: false, photos: [] });
            }} />
          </VStack>
        </div>
      </div>
    );
  }

  /* ---------- เกต: บังคับผูกบัญชี LINE ก่อนแจ้งซ่อม ---------- */
  if (bindGate !== "bound") {
    return (
      <div className="cmms-mobile-page">
        <div className="cmms-page-header">
          <HStack gap={3} vAlign="center">
            <LiffLangToggle />
            <div className="cmms-header-emoji">🚨</div>
            <VStack gap={0} style={{ flex: 1 }}>
              <Heading level={3} style={{ margin: 0 }}>{tliff("liff.repair_header")}</Heading>
              <Text type="body" size="sm" color="secondary">MAINTENANCE JOB REQUEST · F-EN-03</Text>
            </VStack>
          </HStack>
        </div>

        <Card padding={5} className="cmms-card-flat" style={{ margin: 16 }}>
          {bindGate === "checking" && (
            <VStack gap={4} style={{ padding: "8px 0", alignItems: "center", textAlign: "center" }}>
              <div className="cmms-header-emoji" style={{ marginBottom: 4 }}>⏳</div>
              <Heading level={4} style={{ margin: 0 }}>{tliff("liff.repair_checking")}</Heading>
              <Text type="body" size="sm" color="secondary">{tliff("liff.repair_wait")}</Text>
            </VStack>
          )}

          {bindGate === "anonymous" && (
            <VStack gap={4} style={{ alignItems: "stretch" }}>
              <div style={{ textAlign: "center" }}>
                <div className="cmms-header-emoji" style={{ marginBottom: 8 }}>🔗</div>
                <Heading level={4} style={{ margin: 0, marginBottom: 6 }}>{tliff("liff.repair_need_login")}</Heading>
                <Text type="body" size="sm" color="secondary">
                  {tliff("liff.repair_need_login_desc")}
                </Text>
              </div>
              <Button
                label={`🔗 ${tliff("liff.repair_line_login_btn")}`}
                variant="primary"
                width="100%"
                onClick={() => (window.location.href = "/line_login.php")}
              />
              <Text type="body" size="sm" color="secondary" style={{ textAlign: "center" }}>
                {tliff("liff.repair_after_login")}
              </Text>
            </VStack>
          )}

          {bindGate === "webchoice" && (
            <VStack gap={4} style={{ alignItems: "stretch" }}>
              <div style={{ textAlign: "center" }}>
                <div className="cmms-header-emoji" style={{ marginBottom: 8 }}>🔐</div>
                <Heading level={4} style={{ margin: 0, marginBottom: 6 }}>{tliff("liff.repair_confirm_identity")}</Heading>
                <Text type="body" size="sm" color="secondary">
                  {tliff("liff.repair_confirm_desc")}
                </Text>
              </div>
              <Button
                label={`👤 ${tliff("liff.repair_userpass_btn")}`}
                variant="primary"
                width="100%"
                onClick={() => (window.location.href = "/login?next=/repair/request")}
              />
              <Button
                label="🔗 เข้าด้วย LINE"
                variant="secondary"
                width="100%"
                style={{ backgroundColor: "#06C755", color: "#fff", border: "none" }}
                onClick={() => (window.location.href = "/line_login.php")}
              />
            </VStack>
          )}

          {bindGate === "unbound" && (
            <VStack gap={4} style={{ alignItems: "stretch" }}>
              <div style={{ textAlign: "center" }}>
                <div className="cmms-header-emoji" style={{ marginBottom: 8 }}>🔗</div>
                <Heading level={4} style={{ margin: 0, marginBottom: 6 }}>ผูกบัญชี LINE กับเลขพนักงาน</Heading>
                <Text type="body" size="sm" color="secondary">
                  {lineProfile?.name ? `สวัสดีคุณ ${lineProfile.name} 👋` : "สวัสดี 👋"}
                  {"\n"}กรอกรหัสพนักงานเพื่อเริ่มแจ้งซ่อม (ครั้งเดียวจบ)
                </Text>
              </div>
              <div>
                <TextInput
                  label="เลขพนักงาน"
                  isLabelHidden
                  placeholder="เช่น E01117"
                  value={bindEmpCode}
                  onChange={(v) => setBindEmpCode(v.toUpperCase().slice(0, 6))}
                />
              </div>
              {bindError && (
                <div style={{ background: "#FEE2E2", color: "#B91C1C", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
                  ❌ {bindError}
                </div>
              )}
              <Button
                label={bindSubmitting ? "กำลังผูก…" : "ผูกบัญชีและไปแจ้งซ่อม"}
                variant="primary"
                width="100%"
                isDisabled={bindSubmitting || !effectiveUid}
                onClick={handleInlineBind}
              />
              {!effectiveUid && (
                <Text type="body" size="sm" color="secondary" style={{ textAlign: "center" }}>
                  กำลังโหลดข้อมูล LINE…
                </Text>
              )}
            </VStack>
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
        <HStack gap={3} vAlign="center">
          <div className="cmms-header-emoji">🚨</div>
          <VStack gap={0} style={{ flex: 1 }}>
            <Heading level={3} style={{ margin: 0 }}>{tliff("liff.repair_header")}</Heading>
            <Text type="body" size="sm" color="secondary">MAINTENANCE JOB REQUEST · F-EN-03</Text>
          </VStack>
          <LiffLangToggle />
          {lineProfile?.pic ? (
            <img src={lineProfile.pic} alt="LINE profile" className="cmms-avatar" />
          ) : (
            <div className="cmms-avatar cmms-avatar-fallback"><UserIcon style={{ width: 18, height: 18 }} /></div>
          )}
        </HStack>
      </div>

      {/* Step Indicator */}
      <div className="cmms-steps">
        {STEPS.map((s, i) => (
          <div key={i} className={`cmms-step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
            onClick={() => { if (i < step) setStep(i); }}>
            <div className="cmms-step-number">{i < step ? "✓" : s.icon}</div>
            <span className="cmms-step-label">{tliff(`liff.step_${s.key}`)}</span>
          </div>
        ))}
      </div>

      {/* Offline status — ยังกรอกได้ จะเก็บ queue ส่งเมื่อกลับมาออนไลน์ */}
      {offlineNow && (
        <div className="cmms-offline-banner">
          📴 ไม่มีอินเทอร์เน็ต — ยังกรอกฟอร์มได้ ระบบจะส่งงานให้อัตโนมัติเมื่อกลับมาออนไลน์
        </div>
      )}

      {/* Offline queue status */}
      {offlineQueued > 0 && (
        <div className="cmms-offline-banner">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span>📴 มีงานแจ้งซ่อมที่ยังไม่ได้ส่ง <b>{offlineQueued}</b> รายการ</span>
            <Button
              label={flushingQueue ? "กำลังส่ง..." : "ส่งงานค้างทั้งหมดตอนนี้"}
              variant="primary"
              size="sm"
              isDisabled={flushingQueue || !navigator.onLine}
              onClick={flushQueue}
              style={{ flexShrink: 0 }}
            />
          </div>

          {/* รายการค้างส่ง — ลบทีละรายการได้ (กันส่งงานที่กรอกผิด) */}
          {queueItems.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {queueItems.map((it) => (
                <div
                  key={it.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "rgba(255,255,255,0.7)", border: "1px solid #f0d9b8",
                    borderRadius: 8, padding: "6px 10px",
                  }}
                >
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {it.label}
                  </span>
                  <button
                    type="button"
                    title="ลบงานนี้ออกจากคิว"
                    aria-label={`ลบ ${it.label}`}
                    onClick={() => removeQueuedItem(it.id)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--cmms-danger, #DC2626)", fontSize: 14, fontWeight: 800,
                      padding: "2px 6px", borderRadius: 6, flexShrink: 0, lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 4, opacity: 0.8, fontSize: 12 }}>
            จะส่งให้อัตโนมัติเมื่อกลับมาออนไลน์ — หรือกดปุ่มนี้เพื่อส่งทันที
          </div>
        </div>
      )}

      {/* ผูกบัญชี LINE กับเลขพนักงาน (ครั้งแรก) */}
      {lineBound === false && (
        <div className="cmms-bind-banner" onClick={() => (window.location.href = "/register")}>
          <div>
            <b>🔗 ผูกบัญชี LINE กับเลขพนักงาน</b>
            <div className="cmms-bind-sub">ครั้งแรก? ลงทะเบียน 1 ครั้ง — ระบบจำชื่อคุณ และแจ้งเตือนช่างได้ตรงคน</div>
          </div>
          <span className="cmms-bind-arrow">›</span>
        </div>
      )}

      {/* ============ STEP 1 : เครื่องจักร ============ */}
      {step === 0 && (
        <Card padding={5} className="cmms-card-flat">
          <VStack gap={5}>
            <div>
              <Text type="body" weight="bold" style={{ marginBottom: 2 }}>1. เลือกเครื่องจักร / อุปกรณ์ <span className="cmms-req">*</span></Text>
              <Text type="body" size="sm" color="secondary">ทะเบียนเครื่องจักรโรงงาน (22 เครื่อง)</Text>
            </div>

            {MACHINE_GROUPS.map((g) => {
              const groupMachines = assets.filter((a) => a.code.startsWith(g.prefix));
              if (groupMachines.length === 0) return null;
              return (
                <VStack key={g.prefix} gap={2}>
                  <Text type="body" size="sm" weight="bold" color="secondary">{g.emoji} {g.label} ({groupMachines.length})</Text>
                  <div className="cmms-chip-grid">
                    {groupMachines.map((m) => (
                      <button key={m.id} type="button"
                        className={`cmms-chip ${form.machineCode === m.code ? "selected" : ""}`}
                        onClick={() => update("machineCode", m.code)}>
                        {m.code}
                      </button>
                    ))}
                  </div>
                </VStack>
              );
            })}

            {selectedAsset && (
              <div className="cmms-machine-summary">
                <HStack gap={3} vAlign="center">
                  <div className="cmms-machine-icon"><BuildingOffice2Icon style={{ width: 22, height: 22 }} /></div>
                  <VStack gap={0} style={{ flex: 1 }}>
                    <Text type="body" weight="bold">{selectedAsset.code}</Text>
                    <Text type="body" size="sm" color="secondary">{selectedAsset.name}</Text>
                  </VStack>
                  <Badge label={`${selectedAsset.criticality || "-"}`} variant={selectedAsset.criticality === "A" ? "error" : "neutral"} />
                </HStack>
                <Text type="body" size="sm" color="secondary" style={{ marginTop: 8 }}>
                  แผนก: {selectedAsset.department || "—"}
                </Text>
              </div>
            )}

            <div>
              <Text type="body" weight="bold" style={{ marginBottom: 10 }}>2. สถานะเครื่องจักร (Machine Status) <span className="cmms-req">*</span></Text>
              <VStack gap={2}>
                {MACHINE_STATUS_OPTIONS.map((s) => (
                  <button key={s.value} type="button"
                    className={`cmms-option-row ${form.machineStatus === s.value ? "selected" : ""}`}
                    style={{ ["--opt-color" as any]: s.color }}
                    onClick={() => update("machineStatus", s.value)}>
                    <span className="cmms-option-emoji">{s.emoji}</span>
                    <VStack gap={0} style={{ flex: 1 }}>
                      <Text type="body" weight="bold">{s.label}</Text>
                      <Text type="body" size="sm" color="secondary">{s.th}</Text>
                    </VStack>
                    <span className="cmms-radio-dot" />
                  </button>
                ))}
              </VStack>
            </div>
          </VStack>
        </Card>
      )}

      {/* ============ STEP 2 : งาน ============ */}
      {step === 1 && (
        <Card padding={5} className="cmms-card-flat">
          <VStack gap={5}>
            <div>
              <Text type="body" weight="bold" style={{ marginBottom: 10 }}>Ⓐ ประเภทงาน (Job Type) <span className="cmms-req">*</span></Text>
              <div className="cmms-job-grid">
                {JOB_TYPES.map((j) => (
                  <button key={j.value} type="button"
                    className={`cmms-job-card ${form.jobType === j.value ? "selected" : ""}`}
                    onClick={() => update("jobType", j.value)}>
                    <span className="cmms-job-emoji">{j.emoji}</span>
                    <Text type="body" size="sm" weight="bold">{j.label}</Text>
                    <Text type="body" size="2xs" color="secondary">{j.en}</Text>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Text type="body" weight="bold" style={{ marginBottom: 10 }}>Ⓑ ลักษณะงาน (Job Description) <span className="cmms-req">*</span></Text>
              <div className="cmms-job-grid">
                {JOB_DESCRIPTIONS.map((j) => (
                  <button key={j.value} type="button"
                    className={`cmms-job-card ${form.jobDescription === j.value ? "selected" : ""}`}
                    onClick={() => update("jobDescription", j.value)}>
                    <span className="cmms-job-emoji">{j.emoji}</span>
                    <Text type="body" size="sm" weight="bold">{j.label}</Text>
                    <Text type="body" size="2xs" color="secondary">{j.en}</Text>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Text type="body" weight="bold" style={{ marginBottom: 8 }}>※ รายละเอียดของปัญหา (Problem Description) <span className="cmms-req">*</span></Text>
              <TextArea
                label="รายละเอียดปัญหา"
                isLabelHidden
                placeholder="อธิบายปัญหาที่พบให้ละเอียด เช่น อาการที่พบ ข้อความแจ้งเตือน เวลาเกิดปัญหา..."
                value={form.symptoms}
                onChange={(v: string) => update("symptoms", v)}
                rows={4}
              />
              <Text type="body" size="2xs" color="secondary" style={{ marginTop: 4 }}>
                {form.symptoms.length} ตัวอักษร (ขั้นต่ำ 5)
              </Text>
            </div>

            <div>
              <Text type="body" weight="bold" style={{ marginBottom: 8 }}>Lot No. ที่กำลังผลิต (ถ้ามี)</Text>
              <TextInput
                label="Lot No."
                isLabelHidden
                placeholder="ระบุ Lot No. สินค้าที่กำลังผลิต"
                value={form.lotNo}
                onChange={(v: string) => update("lotNo", v)}
              />
            </div>

            <div>
              <Text type="body" weight="bold" style={{ marginBottom: 8 }}>ตรวจสอบการปนเปื้อนหลังงานเสร็จ (Contaminate Checking)</Text>
              <Selector
                label="ตรวจสอบการปนเปื้อน"
                isLabelHidden
                value={form.contaminateChecking}
                onChange={(v: string) => update("contaminateChecking", v)}
                options={[
                  { value: "not_checked", label: "ยังไม่ตรวจ" },
                  { value: "clean", label: "ไม่พบการปนเปื้อน (ผ่าน)" },
                  { value: "contaminated", label: "พบการปนเปื้อน" },
                  { value: "not_applicable", label: "ไม่เกี่ยวข้องกับงานนี้" },
                ]}
              />
            </div>

            <div>
              <Text type="body" weight="bold" style={{ marginBottom: 8 }}>ผู้รับเหมาภายนอก (ถ้าจ้างภายนอกทำ)</Text>
              <TextInput
                label="ผู้รับเหมาภายนอก"
                isLabelHidden
                placeholder="ระบุชื่อบริษัท/ผู้รับเหมาภายนอก (ถ้ามี)"
                value={form.outsourceBy}
                onChange={(v: string) => update("outsourceBy", v)}
              />
            </div>
          </VStack>
        </Card>
      )}

      {/* ============ STEP 3 : ผู้แจ้ง & รูป ============ */}
      {step === 2 && (
        <Card padding={5} className="cmms-card-flat">
          <VStack gap={5}>
            <div>
              <Text type="body" weight="bold" style={{ marginBottom: 2 }}>ข้อมูลผู้แจ้ง</Text>
              <Text type="body" size="sm" color="secondary">
                {lineProfile ? "ดึงข้อมูลจากบัญชี LINE แล้ว — แก้ไขได้ถ้าต้องการ" : "ดึงชื่อจากระบบให้อัตโนมัติ"}
              </Text>
            </div>

            <FieldRow label="ชื่อ-นามสกุล (Requestor)" required>
              <TextInput
                label="ชื่อ-นามสกุล"
                isLabelHidden
                placeholder="เช่น สมชาย ใจดี"
                value={form.reporterName}
                onChange={(v: string) => update("reporterName", v)}
              />
            </FieldRow>

            <FieldRow label="แผนก (Department)" required>
              <Selector
                label="แผนก"
                isLabelHidden
                placeholder="เลือกแผนก..."
                value={form.departmentCode}
                onChange={(v: string) => update("departmentCode", v)}
                options={depts.map((d) => ({ value: d.code, label: d.name }))}
              />
            </FieldRow>

            <FieldRow label="สำนักงาน (Office)" required>
              <Selector
                label="สำนักงาน"
                isLabelHidden
                value={form.office}
                onChange={(v: string) => update("office", v)}
                options={OFFICES.map((o) => ({ value: o, label: o }))}
              />
            </FieldRow>

            <FieldRow label="เบอร์ติดต่อ (Phone)" required>
              <TextInput
                label="เบอร์ติดต่อ"
                isLabelHidden
                placeholder="เช่น 083-0000000"
                value={form.phone}
                onChange={(v: string) => update("phone", v)}
              />
            </FieldRow>

            <FieldRow label="อีเมล (ถ้ามี)">
              <TextInput
                label="อีเมล"
                isLabelHidden
                placeholder="เช่น example@company.com"
                value={form.email}
                onChange={(v: string) => update("email", v)}
              />
            </FieldRow>

            {/* Contamination Risk — ตาม F-EN-03 */}
            <div className={`cmms-contam-box ${form.contaminationRisk ? "risk" : "safe"}`}>
              <VStack gap={3}>
                <HStack gap={2} vAlign="center">
                  <ShieldCheckIcon style={{ width: 18, height: 18 }} />
                  <Text type="body" weight="bold">ความเสี่ยงปนเปื้อนจากการซ่อม (GMP)</Text>
                </HStack>
                <HStack gap={3} vAlign="center">
                  <Switch
                    label="Contamination"
                    isLabelHidden
                    value={form.contaminationRisk}
                    onChange={(v: boolean) => update("contaminationRisk", v)}
                  />
                  <Text type="body" size="sm" style={{ color: form.contaminationRisk ? "var(--cmms-danger)" : "var(--cmms-success)" }}>
                    {form.contaminationRisk ? "⚠️ มีความเสี่ยงปนเปื้อน" : "✅ ไม่มีความเสี่ยงปนเปื้อน"}
                  </Text>
                </HStack>
              </VStack>
            </div>

            {/* Safety Related */}
            <HStack gap={3} vAlign="center" style={{ padding: "12px 0", borderBottom: "1px solid var(--cmms-border)" }}>
              <Switch
                label="Safety Related"
                isLabelHidden
                value={form.safetyRelated}
                onChange={(v: boolean) => update("safetyRelated", v)}
              />
              <VStack gap={0}>
                <Text type="body" size="sm" weight="bold">เกี่ยวข้องกับความปลอดภัย</Text>
                <Text type="body" size="2xs" color="secondary">
                  {form.safetyRelated ? "ใช่ — ต้องทำ LOTO / Work Permit" : "ไม่เกี่ยวข้อง"}
                </Text>
              </VStack>
            </HStack>

            {/* Photos — หลายไฟล์ + กล้อง */}
            <div>
              <Text type="body" weight="bold" style={{ marginBottom: 8 }}>
                <PaperClipIcon style={{ width: 14, height: 14, verticalAlign: -2 }} /> แนบรูปถ่ายจุดชำรุด (สูงสุด 5 รูป)
              </Text>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }}
              />
              <div className="cmms-photo-grid">
                {form.photos.map((p, i) => (
                  <div key={i} className="cmms-photo-thumb">
                    <img src={p} alt={`รูป ${i + 1}`} />
                    <button type="button" className="cmms-photo-remove"
                      onClick={() => update("photos", form.photos.filter((_, x) => x !== i))}>
                      <XMarkIcon style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                ))}
                {form.photos.length < 5 && (
                  <button type="button" className="cmms-photo-add" onClick={() => photoInputRef.current?.click()}>
                    <CameraIcon style={{ width: 24, height: 24 }} />
                    <Text type="body" size="2xs" weight="bold">ถ่าย / เลือกรูป</Text>
                  </button>
                )}
              </div>
            </div>
          </VStack>
        </Card>
      )}

      {/* ============ STEP 4 : ยืนยัน ============ */}
      {step === 3 && (
        <Card padding={5} className="cmms-card-flat">
          <VStack gap={4}>
            <Heading level={4}>ตรวจสอบก่อนส่ง</Heading>

            <div className="cmms-summary-box">
              <SummaryRow label="เครื่องจักร" value={selectedAsset ? `${selectedAsset.code} — ${selectedAsset.name}` : form.machineCode} />
              <SummaryRow label="สถานะเครื่อง" value={MACHINE_STATUS_OPTIONS.find((s) => s.value === form.machineStatus)?.label || "—"} />
              <SummaryRow label="ประเภทงาน" value={`${JOB_TYPES.find((j) => j.value === form.jobType)?.label || "—"} / ${JOB_DESCRIPTIONS.find((j) => j.value === form.jobDescription)?.label || "—"}`} />
              <SummaryRow label="ผู้แจ้ง" value={`${form.reporterName} (${depts.find((d) => d.code === form.departmentCode)?.name || "—"})`} icon={<UserIcon style={{ width: 14, height: 14 }} />} />
              <SummaryRow label="ติดต่อ" value={[form.phone, form.email].filter(Boolean).join(" · ") || "—"} icon={<PhoneIcon style={{ width: 14, height: 14 }} />} />
              <SummaryRow label="สำนักงาน" value={form.office} />
              <SummaryRow label="Lot No." value={form.lotNo || "—"} />
              <SummaryRow label="วันที่แจ้ง" value={new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })} icon={<ClockIcon style={{ width: 14, height: 14 }} />} />
            </div>

            <div>
              <Text type="body" size="sm" weight="bold" color="secondary">รายละเอียดปัญหา</Text>
              <div className="cmms-summary-text">{form.symptoms}</div>
            </div>

            <HStack gap={2} style={{ flexWrap: "wrap" }}>
              <Badge label={form.contaminationRisk ? "⚠️ มีความเสี่ยงปนเปื้อน" : "✅ ไม่ปนเปื้อน"} variant={form.contaminationRisk ? "error" : "success"} />
              {form.safetyRelated && <Badge label="🛡️ Safety" variant="error" />}
              <Badge label={`📷 ${form.photos.length} รูป`} variant="info" />
            </HStack>

            {submitError && (
              <div className="cmms-submit-error">
                <ExclamationTriangleIcon style={{ width: 16, height: 16 }} />
                {submitError}
              </div>
            )}
          </VStack>
        </Card>
      )}

      {/* Sticky bottom bar */}
      <div className="cmms-mobile-bottom-bar">
        <HStack gap={3} vAlign="center">
          {step > 0 ? (
            <Button label="ย้อนกลับ" variant="secondary" onClick={() => setStep(step - 1)} icon={<ArrowLeftIcon style={{ width: 16, height: 16 }} />} />
          ) : <div />}
          <div style={{ flex: 1 }}>
            {step < 3 ? (
              <Button
                label={["ถัดไป · รายละเอียดงาน", "ถัดไป · ผู้แจ้ง & รูป", "ถัดไป · ยืนยัน"][step]}
                variant="primary"
                width="100%"
                isDisabled={!canNext()}
                onClick={() => setStep(step + 1)}
                icon={<ArrowRightIcon style={{ width: 16, height: 16 }} />}
              />
            ) : (
              <Button
                label="ยืนยัน & ส่งแจ้งซ่อม"
                variant="primary"
                width="100%"
                isLoading={submitting}
                isDisabled={submitting}
                onClick={handleSubmit}
                icon={<CheckCircleIcon style={{ width: 16, height: 16 }} />}
              />
            )}
          </div>
        </HStack>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <Text type="body" weight="bold" style={{ marginBottom: 8 }}>
        {label} {required && <span className="cmms-req">*</span>}
      </Text>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <HStack hAlign="between" gap={3}>
      <Text type="body" size="sm" color="secondary">{label}</Text>
      <Text type="body" size="sm" weight="bold" style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {icon}{value}
      </Text>
    </HStack>
  );
}
