"use client";

import { useState } from "react";
import { VStack, HStack } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  GripVertical,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react";
import type { PageLayoutItem, PageLayoutSection } from "../lib/pageLayout";

interface Props {
  sections: PageLayoutSection[];
  value: PageLayoutItem[];
  onChange: (next: PageLayoutItem[]) => void;
}

/**
 * LayoutDndEditor — รายการ section ของหน้าแบบลาก-วาง (HTML5 DnD)
 * + ปุ่มเลื่อนขึ้น/ลง (สำหรับมือถือ/คีย์บอร์ด) + สลับแสดง/ซ่อน
 */
export default function LayoutDndEditor({ sections, value, onChange }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const items = value.filter((v) => sections.some((s) => s.id === v.id));
  // section ที่ยังไม่ได้อยู่ใน config (เช่น เพิ่มโมเดลใหม่ทีหลัง) → ต่อท้ายเสมอ
  const missing = sections.filter((s) => !items.some((v) => v.id === s.id));
  const full = [
    ...items,
    ...missing.map((s) => ({ id: s.id, enabled: true })),
  ];

  const move = (from: number, to: number) => {
    if (to < 0 || to >= full.length) return;
    const next = [...full];
    const [removed] = next.splice(from, 1);
    next.splice(to, 0, removed);
    onChange(next);
  };

  const toggle = (id: string) => {
    onChange(full.map((v) => (v.id === id ? { ...v, enabled: !v.enabled } : v)));
  };

  const label = (id: string) => sections.find((s) => s.id === id);

  return (
    <VStack gap={2}>
      <HStack hAlign="between" vAlign="center">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          DRAG &amp; DROP · เรียงลำดับ section ของหน้า
        </p>
        <Badge variant="info">{`${full.filter((v) => v.enabled).length}/${full.length} แสดง`}</Badge>
      </HStack>

      <VStack gap={2}>
        {full.map((item, i) => {
          const meta = label(item.id);
          const pinned = Boolean(meta?.pinned);
          const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
          return (
            <div
              key={item.id}
              draggable={!pinned}
              onDragStart={(e) => {
                setDragIndex(i);
                e.dataTransfer.effectAllowed = "move";
                try {
                  e.dataTransfer.setData("text/plain", item.id);
                } catch {
                  /* ignore */
                }
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOverIndex(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== i) move(dragIndex, i);
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors ${
                isOver
                  ? "border-2 border-[var(--cmms-primary)] bg-[var(--cmms-primary-light)]"
                  : "border border-border bg-card"
              }`}
              style={{
                opacity: item.enabled ? 1 : 0.55,
                cursor: pinned ? "default" : "grab",
              }}
            >
              {/* Drag handle */}
              <span aria-hidden="true" className="shrink-0 text-muted-foreground">
                <GripVertical size={16} strokeWidth={1.75} />
              </span>

              {/* หมายเลขลำดับ */}
              <span
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-xs tabular-nums"
                style={{
                  background: "var(--cmms-bg-wash)",
                  color: "var(--cmms-text-secondary)",
                }}
              >
                {i + 1}
              </span>

              {/* Label */}
              <div className="min-w-0 flex-1">
                <p className="block truncate text-sm font-semibold leading-snug">
                  {meta?.label ?? item.id}
                </p>
                {meta?.desc && (
                  <p className="block truncate text-[11px] leading-snug text-muted-foreground">
                    {meta.desc}
                  </p>
                )}
                {pinned && (
                  <span className="mt-1 inline-block">
                    <Badge variant="neutral">ส่วนหัวคงที่</Badge>
                  </span>
                )}
              </div>

              {/* Toggle แสดง/ซ่อน */}
              <Button
                aria-label={item.enabled ? "ซ่อน section" : "แสดง section"}
                title={item.enabled ? "ซ่อน section" : "แสดง section"}
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => toggle(item.id)}
              >
                {item.enabled ? (
                  <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <EyeOff size={16} strokeWidth={1.75} aria-hidden="true" />
                )}
              </Button>

              {/* เลื่อนขึ้น/ลง */}
              <HStack gap={1}>
                <Button
                  aria-label="เลื่อนขึ้น"
                  title="เลื่อนขึ้น"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  disabled={pinned || i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  <ChevronUp size={16} strokeWidth={1.75} aria-hidden="true" />
                </Button>
                <Button
                  aria-label="เลื่อนลง"
                  title="เลื่อนลง"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  disabled={pinned || i === full.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
                </Button>
              </HStack>
            </div>
          );
        })}
      </VStack>

      <Separator />

      <p className="text-xs text-muted-foreground">
        ลากแถวเพื่อจัดลำดับ หรือใช้ปุ่มลูกศร — สลับตาเพื่อซ่อน section นั้นจากหน้า
        (การซ่อน/เรียงลำดับมีผลกับหน้าที่เชื่อมต่อแล้ว — ดูป้าย &quot;มีผลกับหน้าแล้ว&quot; ·
        ส่วนหัวคงที่ = ย้ายไม่ได้แต่ซ่อนได้)
      </p>
    </VStack>
  );
}
