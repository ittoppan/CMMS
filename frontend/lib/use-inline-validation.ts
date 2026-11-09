"use client";

import { useCallback, useState } from "react";

/**
 * useInlineValidation — inline validation มาตรฐานของฟอร์มที่ validate ด้วยมือ
 * (ไม่ใช่ react-hook-form)
 *
 * เจตนา: field ที่ error ต้องประกาศทันทีเมื่อ user ข้ามออก (blur) หรือหลังกด submit
 * ครั้งแรก — ไม่รอให้คลิกเดียวติดกันแล้วเห็นแค่ banner ข้างบน
 *
 * วิธีใช้:
 *   const iv = useInlineValidation();
 *   const codeError = iv.errorFor("code", !form.code.trim() ? t("msg...") : "");
 *   <Input onBlur={() => iv.touch("code")} error={codeError} />
 *   ...handleSubmit: if (!valid) { iv.submit(); return; }
 */
export function useInlineValidation() {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const touch = useCallback((key: string) => {
    setTouched(prev => ({ ...prev, [key]: true }));
  }, []);

  const submit = useCallback(() => setSubmitAttempted(true), []);

  const reset = useCallback(() => {
    setTouched({});
    setSubmitAttempted(false);
  }, []);

  const errorFor = useCallback(
    (key: string, message: string): string =>
      (touched[key] || submitAttempted) && message ? message : "",
    [touched, submitAttempted]
  );

  return { touch, submit, reset, errorFor, submitAttempted };
}
