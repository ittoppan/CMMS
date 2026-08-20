"use client";

import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { cn } from "@/lib/cn";

/**
 * FormField — wrapper มาตรฐานสำหรับ react-hook-form
 * - label + hint + error (จาก formState.errors)
 * - inject id / aria-invalid / aria-describedby ให้ child input อัตโนมัติ
 *
 * ตัวอย่าง:
 *   <FormField form={form} name="title" label="หัวข้อ">
 *     <Input placeholder="..." />
 *   </FormField>
 */
interface FormFieldProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  name: Path<T>;
  label?: string;
  hint?: string;
  isLabelHidden?: boolean;
  className?: string;
  children: ReactElement;
}

export function FormField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  isLabelHidden,
  className,
  children,
}: FormFieldProps<T>) {
  const autoId = useId();
  const fieldId = `${name}-${autoId}`;
  const error = form.formState.errors[name];
  const errorMessage = error?.message as string | undefined;
  const errorId = errorMessage ? `${fieldId}-error` : undefined;
  const hintId = hint ? `${fieldId}-hint` : undefined;

  const child = isValidElement(children)
    ? cloneElement(
        children as ReactElement<Record<string, unknown>>,
        {
          id: fieldId,
          "aria-invalid": errorMessage ? true : undefined,
          "aria-describedby":
            [errorId, hintId].filter(Boolean).join(" ") || undefined,
        } as Record<string, unknown>
      )
    : children;

  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)}>
      {label && (
        <label
          htmlFor={fieldId}
          className={cn(
            "text-sm font-medium text-[var(--cmms-text-primary)]",
            isLabelHidden && "sr-only"
          )}
        >
          {label}
        </label>
      )}
      {child}
      {errorMessage && (
        <p id={errorId} role="alert" className="text-xs font-medium text-[var(--cmms-danger)]">
          {errorMessage}
        </p>
      )}
      {hint && !errorMessage && (
        <p id={hintId} className="text-xs text-[var(--cmms-text-muted)]">
          {hint}
        </p>
      )}
    </div>
  );
}

export type { FormFieldProps };