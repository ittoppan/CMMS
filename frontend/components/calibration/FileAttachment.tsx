"use client";

import { FileText, Undo2 } from "lucide-react";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment";

function fileName(url: string): string {
  const clean = url.split("?")[0];
  return clean.split("/").pop() || url;
}

export default function FileAttachment({
  url,
  state = "done",
  label,
  onRemove,
}: {
  url: string;
  state?: "idle" | "uploading" | "processing" | "error" | "done";
  label: string;
  onRemove?: () => void;
}) {
  const name = fileName(url);
  return (
    <Attachment state={state} size="sm" className="w-full max-w-[360px]">
      <AttachmentMedia>
        <FileText strokeWidth={1.75} aria-hidden="true" />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{state === "uploading" ? "กำลังอัปโหลด..." : name}</AttachmentTitle>
        <AttachmentDescription>{label}</AttachmentDescription>
      </AttachmentContent>
      {onRemove && url && (
        <AttachmentActions>
          <AttachmentAction aria-label={`ลบ ${name}`} onClick={onRemove}>
            <Undo2 aria-hidden="true" />
          </AttachmentAction>
        </AttachmentActions>
      )}
      {url && (
        <AttachmentTrigger
          render={
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label={`เปิด ${name}`}
            />
          }
        />
      )}
    </Attachment>
  );
}