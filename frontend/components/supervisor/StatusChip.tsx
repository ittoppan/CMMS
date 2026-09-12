"use client";

import { Badge } from "@/components/ui/badge";
import { normalizeRepairStatus, repairStatusAndon, repairStatusLabel } from "@/lib/repair-status";
import { type AndonStatus } from "@/components/AndonLamp";

function vd(s: string): "success" | "warning" | "danger" | "primary" | "neutral" {
  const v = String(s || "").toLowerCase();
  if (v === "critical") return "danger";
  if (v === "high") return "warning";
  if (v === "medium" || v === "normal") return "primary";
  return "neutral";
}

function vk(status: string, overdue: boolean): "success" | "warning" | "danger" | "primary" | "neutral" {
  const k = normalizeRepairStatus(status || "open");
  if (overdue) return "danger";
  if (k === "completed" || k === "closed" || k === "verified") return "success";
  if (k === "in_progress" || k === "waiting_parts" || k === "waiting_external" || k === "paused" || k === "accepted") return "warning";
  if (k === "pending_approval" || k === "approved" || k === "assigned" || k === "draft") return "primary";
  return "neutral";
}

export function andonOf(status: string | null | undefined, overdue = false): AndonStatus {
  return repairStatusAndon(status, overdue);
}

export function StatusChip({ status, overdue = false }: { status: string; overdue?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="cmms-andon-chip" aria-hidden="true">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: "currentColor" }}
        />
      </span>
      <Badge variant={vk(status, overdue)}>{repairStatusLabel(status)}</Badge>
    </span>
  );
}

export function PriorityChip({ priority }: { priority: string }) {
  const v = String(priority || "normal").toLowerCase();
  return <Badge variant={vd(v)}>{priority || "Normal"}</Badge>;
}

export const fmtDT = (v: string | null | undefined): string => {
  if (!v) return "—";
  const d = new Date(String(v).includes("T") ? String(v) : String(v).replace(" ", "T"));
  if (isNaN(d.getTime())) return String(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fmtDate = (v: string | null | undefined): string => {
  if (!v) return "—";
  const s = String(v).split(" ")[0];
  return s || "—";
};