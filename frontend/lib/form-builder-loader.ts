"use client";

/**
 * form-builder-loader.ts — โหลด formBuilder (jQuery plugin) แบบ client-only
 *
 * formBuilder เป็น UMD ที่ต้องมี global jQuery ก่อน import → ตั้ง window.jQuery
 * แล้ว import side-effect (plugin ลงทะเบียน $.fn.formBuilder เอง)
 */

declare global {
  interface JQuery<TElement = HTMLElement> {
    /**
     * เปิดตัวออกแบบฟอร์ม (formBuilder) บน element ปลายทาง
     */
    formBuilder(options?: Record<string, unknown>): any;
    /**
     * render ฟอร์มจาก schema JSON (formRender) — ใช้ในกรณีต้องการ render ฝั่ง jQuery
     */
    formRender(options?: Record<string, unknown>): any;
  }
}

let loadPromise: Promise<unknown> | null = null;

export function loadFormBuilder(): Promise<unknown> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!loadPromise) {
    loadPromise = (async () => {
      const jq = await import("jquery");
      (window as any).jQuery = jq.default;
      (window as any).$ = jq.default;
      // formBuilder ต้องมี $.fn.sortable (jQuery UI) — โหลดก่อน formBuilder เสมอ
      await import("jquery-ui-sortable");
      await import("formBuilder");
      return jq.default;
    })();
  }
  return loadPromise;
}
