"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * ToastProvider — ระบบแจ้งเตือนชั่วคราว (toast) แบบกลาง
 * ใช้แทนการ copy-paste state + setTimeout + div ในแต่ละหน้า
 *
 * วิธีใช้:
 *   const { showToast } = useToast();
 *   showToast("success", "บันทึกข้อมูลสำเร็จ");
 *   showToast("error", "ไม่สามารถลบข้อมูลได้", "เกิดข้อผิดพลาด");
 */

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  title?: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION = 3500;
const TOAST_ICONS: Record<ToastType, string> = {
  success: "✅",
  error: "❌",
  info: "ℹ️",
};
const TOAST_TITLES: Record<ToastType, string> = {
  success: "สำเร็จ",
  error: "เกิดข้อผิดพลาด",
  info: "แจ้งเตือน",
};

function ToastCard({
  toast,
  onClose,
}: {
  toast: ToastItem;
  onClose: (id: number) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onClose(toast.id), 220);
  }, [onClose, toast.id]);

  useEffect(() => {
    timerRef.current = setTimeout(dismiss, TOAST_DURATION);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dismiss]);

  return (
    <div
      className={`cmms-toast ${toast.type} ${leaving ? "leaving" : ""}`}
      role="status"
    >
      <span className="cmms-toast-icon">{TOAST_ICONS[toast.type]}</span>
      <div className="cmms-toast-body">
        <div className="cmms-toast-title">{toast.title || TOAST_TITLES[toast.type]}</div>
        {toast.message && <div className="cmms-toast-msg">{toast.message}</div>}
      </div>
      <button
        type="button"
        className="cmms-toast-close"
        aria-label="ปิด"
        onClick={dismiss}
      >
        ✕
      </button>
      <div className="cmms-toast-timer" style={{ animationDuration: `${TOAST_DURATION}ms` }} />
    </div>
  );
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, title?: string) => {
      setToasts((prev) => {
        const next = [...prev, { id: nextId.current++, type, message, title }];
        return next.length > 5 ? next.slice(next.length - 5) : next;
      });
    },
    []
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="cmms-toast-container" aria-live="polite">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast ต้องใช้ภายใต้ <ToastProvider>");
  }
  return ctx;
}
