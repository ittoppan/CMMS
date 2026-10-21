"use client";

/**
 * SweetAlert2 ตาม design system (Astryx/CMMS tokens)
 * - ใช้ใน event handlers เท่านั้น (client) — import แบบ dynamic กัน SSR
 * ตัวอย่าง:
 *   const ok = await swalConfirm({ title: "ลบแบบฟอร์มนี้?", destructive: true });
 *   if (!ok) return;
 *   await swalSuccess("ลบแล้ว");
 */
type SwalType = typeof import("sweetalert2").default;

const getSwal = async (): Promise<SwalType> => {
  const { default: Swal } = await import("sweetalert2");
  return Swal.mixin({
    buttonsStyling: false,
    reverseButtons: true,
    focusCancel: true,
    customClass: {
      popup: "cmms-swal-popup",
      title: "cmms-swal-title",
      htmlContainer: "cmms-swal-text",
      icon: "cmms-swal-icon",
      confirmButton: "cmms-swal-btn cmms-swal-btn-confirm",
      denyButton: "cmms-swal-btn cmms-swal-btn-danger",
      cancelButton: "cmms-swal-btn cmms-swal-btn-cancel",
      input: "cmms-swal-input",
    },
  });
};

export async function swalConfirm(opts: {
  title: string;
  text?: string;
  icon?: "warning" | "question" | "info";
  confirmText?: string;
  cancelText?: string;
  /** ปุ่มลงมือเป็นแดง (ลบ/ยกเลิก/ปิดงบ ฯลฯ) */
  destructive?: boolean;
}): Promise<boolean> {
  const SweetAlert = await getSwal();
  const res = await SweetAlert.fire({
    title: opts.title,
    text: opts.text,
    icon: opts.icon ?? (opts.destructive ? "warning" : "question"),
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? "ยืนยัน",
    cancelButtonText: opts.cancelText ?? "ยกเลิก",
    customClass: opts.destructive
      ? { confirmButton: "cmms-swal-btn cmms-swal-btn-danger" }
      : undefined,
  });
  return res.isConfirmed;
}

export async function swalSuccess(message: string, title = "สำเร็จ"): Promise<void> {
  const SweetAlert = await getSwal();
  await SweetAlert.fire({ title, text: message, icon: "success", timer: 2200, showConfirmButton: false });
}

export async function swalError(message: string, title = "เกิดข้อผิดพลาด"): Promise<void> {
  const SweetAlert = await getSwal();
  await SweetAlert.fire({ title, text: message, icon: "error" });
}

export async function swalInfo(message: string, title = "ข้อมูล"): Promise<void> {
  const SweetAlert = await getSwal();
  await SweetAlert.fire({ title, text: message, icon: "info" });
}
