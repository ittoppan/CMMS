"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

type AttachmentState = "idle" | "uploading" | "processing" | "error" | "done";
type AttachmentSize = "default" | "sm" | "xs";

const MEDIA_BOX: Record<AttachmentSize, string> = {
  default: "h-10 w-10",
  sm: "h-9 w-9",
  xs: "h-8 w-8",
};

const ROOT_PAD: Record<AttachmentSize, string> = {
  default: "p-3",
  sm: "p-2.5",
  xs: "p-2",
};

const AttachmentCtx = React.createContext<{
  state: AttachmentState;
  size: AttachmentSize;
}>({ state: "done", size: "default" });

function useAttachment() {
  return React.useContext(AttachmentCtx);
}

function Attachment({
  state = "done",
  size = "default",
  orientation = "horizontal",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  state?: AttachmentState;
  size?: AttachmentSize;
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <AttachmentCtx.Provider value={{ state, size }}>
      <div
        data-slot="attachment"
        className={cn(
          "relative overflow-hidden rounded-[var(--cmms-radius)] border bg-card text-foreground transition-colors",
          ROOT_PAD[size],
          orientation === "horizontal" ? "flex items-center gap-3" : "flex flex-col gap-2.5",
          state === "error" && "border-[var(--cmms-danger)]",
          className
        )}
        {...props}
      />
    </AttachmentCtx.Provider>
  );
}

function AttachmentMedia({
  variant = "icon",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "icon" | "image";
}) {
  const { size } = useAttachment();
  if (variant === "image") {
    return (
      <div
        data-slot="attachment-media"
        className={cn(
          "shrink-0 overflow-hidden rounded-md border border-border",
          MEDIA_BOX[size],
          className
        )}
        {...props}
      />
    );
  }
  return (
    <div
      data-slot="attachment-media"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-1/2 [&_svg]:shrink-0",
        MEDIA_BOX[size],
        className
      )}
      {...props}
    />
  );
}

function AttachmentContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="attachment-content"
      className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)}
      {...props}
    />
  );
}

function AttachmentTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  const { state } = useAttachment();
  const busy = state === "uploading" || state === "processing";
  return (
    <span
      data-slot="attachment-title"
      className={cn(
        "truncate text-sm font-medium",
        busy && "animate-pulse",
        className
      )}
      {...props}
    />
  );
}

function AttachmentDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const { state } = useAttachment();
  return (
    <p
      data-slot="attachment-description"
      className={cn(
        "truncate text-xs text-muted-foreground",
        state === "error" && "text-[var(--cmms-danger-dark)]",
        className
      )}
      {...props}
    />
  );
}

function AttachmentActions({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="attachment-actions"
      className={cn("relative z-10 flex shrink-0 items-center gap-1", className)}
      {...props}
    />
  );
}

function AttachmentAction({
  className,
  size = "icon-xs",
  ...props
}: React.ComponentProps<typeof Button>) {
  return <Button variant="ghost" size={size} className={cn("", className)} {...props} />;
}

function AttachmentTrigger({
  render,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  render?:
    | React.ReactElement
    | ((triggerProps: Record<string, unknown>) => React.ReactElement);
}) {
  const base = cn("absolute inset-0 z-0 rounded-md", className);
  if (render) {
    const element =
      typeof render === "function" ? render({ ...props }) : render;
    return React.cloneElement(element, {
      ...props,
      className: cn(
        (element.props as React.HTMLAttributes<HTMLElement>).className,
        base
      ),
    } as React.HTMLAttributes<HTMLElement>);
  }
  return (
    <button type="button" className={base} {...props}>
      {children}
    </button>
  );
}

function AttachmentGroup({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="group"
      className={cn(
        "flex gap-3 overflow-x-auto pb-2 [scroll-snap-type:x_mandatory] [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]",
        className
      )}
      {...props}
    />
  );
}

export {
  Attachment,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
  AttachmentAction,
  AttachmentTrigger,
};