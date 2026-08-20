"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Button — ปุ่มมาตรฐานของระบบ (tokens + cva)
 * variants: primary / secondary / outline / ghost / danger
 * sizes: sm (32px) / md (40px) / lg (48px) / icon (40px)
 * ใช้ Lucide icon เป็น children (strokeWidth 1.75 ตาม guideline)
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--cmms-radius)] font-semibold transition-[background-color,box-shadow,transform] duration-[var(--cmms-transition)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cmms-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cmms-bg-page)] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:shrink-0 [&_svg]:aria-hidden",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--cmms-primary)] text-white shadow-[var(--cmms-shadow-sm)] hover:bg-[var(--cmms-primary-hover)]",
        secondary:
          "border border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] text-[var(--cmms-text-primary)] hover:bg-[var(--cmms-bg-wash)]",
        outline:
          "border border-[var(--cmms-border-hover)] bg-transparent text-[var(--cmms-text-primary)] hover:bg-[var(--cmms-bg-muted)]",
        ghost:
          "bg-transparent text-[var(--cmms-text-secondary)] hover:bg-[var(--cmms-bg-muted)] hover:text-[var(--cmms-text-primary)]",
        danger:
          "bg-[var(--cmms-danger)] text-white shadow-[var(--cmms-shadow-sm)] hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };