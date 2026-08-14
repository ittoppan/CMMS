"use client";

import { useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import {
  Bars3Icon,
  ChevronUpIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
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
        <Text type="body" size="sm" className="cmms-eyebrow">
          DRAG & DROP · เรียงลำดับ section ของหน้า
        </Text>
        <Badge label={`${full.filter((v) => v.enabled).length}/${full.length} แสดง`} variant="info" />
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
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: "var(--cmms-radius)",
                border: isOver
                  ? "2px solid var(--cmms-primary)"
                  : "1px solid var(--cmms-border)",
                background: isOver
                  ? "var(--cmms-primary-light)"
                  : "var(--cmms-bg-card)",
                opacity: item.enabled ? 1 : 0.55,
                cursor: "grab",
                transition: "border 0.15s ease, background 0.15s ease",
              }}
            >
              {/* Drag handle */}
              <span style={{ color: "var(--cmms-text-muted)", cursor: "grab" }}>
                <Icon icon={Bars3Icon} size="sm" />
              </span>

              {/* หมายเลขลำดับ */}
              <span
                className="cmms-num"
                style={{
                  minWidth: 22,
                  height: 22,
                  borderRadius: 6,
                  background: "var(--cmms-bg-wash)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  color: "var(--cmms-text-secondary)",
                }}
              >
                {i + 1}
              </span>

              {/* Label */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text
                  type="body"
                  weight="semibold"
                  size="sm"
                  display="block"
                  style={{ fontSize: 13 }}
                >
                  {meta?.label ?? item.id}
                </Text>
                {meta?.desc && (
                  <Text
                    type="body"
                    size="sm"
                    color="secondary"
                    display="block"
                    style={{ fontSize: 11 }}
                  >
                    {meta.desc}
                  </Text>
                )}
                {pinned && (
                  <Badge label="ส่วนหัวคงที่" variant="neutral" />
                )}
              </div>

              {/* Toggle แสดง/ซ่อน */}
              <Button
                label={item.enabled ? "ซ่อน section" : "แสดง section"}
                icon={
                  <Icon icon={item.enabled ? EyeIcon : EyeSlashIcon} size="sm" />
                }
                variant="ghost"
                size="sm"
                isIconOnly
                onClick={() => toggle(item.id)}
              />

              {/* เลื่อนขึ้น/ลง */}
              <HStack gap={1}>
                <Button
                  label="เลื่อนขึ้น"
                  icon={<Icon icon={ChevronUpIcon} size="sm" />}
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  isDisabled={pinned || i === 0}
                  onClick={() => move(i, i - 1)}
                />
                <Button
                  label="เลื่อนลง"
                  icon={<Icon icon={ChevronDownIcon} size="sm" />}
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  isDisabled={pinned || i === full.length - 1}
                  onClick={() => move(i, i + 1)}
                />
              </HStack>
            </div>
          );
        })}
      </VStack>

      <Divider />

      <Text type="body" size="sm" color="secondary">
        ลากแถวเพื่อจัดลำดับ หรือใช้ปุ่มลูกศร — สลับตาเพื่อซ่อน section นั้นจากหน้า
        (การซ่อน/เรียงลำดับมีผลกับหน้าที่เชื่อมต่อแล้ว — ดูป้าย "มีผลกับหน้าแล้ว" ·
        ส่วนหัวคงที่ = ย้ายไม่ได้แต่ซ่อนได้)
      </Text>
    </VStack>
  );
}
