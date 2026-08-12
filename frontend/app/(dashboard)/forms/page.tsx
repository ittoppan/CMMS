"use client";

import { useState, useEffect, useMemo } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Grid } from "@astryxdesign/core/Grid";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import {
  DocumentArrowDownIcon,
  MagnifyingGlassIcon,
  DocumentTextIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

interface FormItem {
  code: string;
  rev: string;
  title: string;
  filename: string;
  ext: string;
  size: number;
}

const extLabel: Record<string, string> = {
  xls: "Excel (.xls)",
  xlsx: "Excel (.xlsx)",
  xlsm: "Excel Macro",
  pdf: "PDF",
  docx: "Word",
  ods: "OpenOffice",
};

const extColor: Record<string, "success" | "info" | "warning" | "neutral" | "accent"> = {
  xls: "success",
  xlsx: "success",
  xlsm: "success",
  pdf: "error",
  docx: "info",
  ods: "neutral",
};

function formatSize(bytes: number): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FormsPage() {
  const [forms, setForms] = useState<FormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [extFilter, setExtFilter] = useState("all");

  const fetchForms = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/forms.php");
      const json = await res.json();
      if (json.status === "success") {
        setForms(json.data || []);
      } else {
        setError(json.message || "ไม่สามารถโหลดรายการแบบฟอร์มได้");
      }
    } catch (e) {
      console.error("Fetch forms error", e);
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForms();
  }, []);

  const extOptions = useMemo(() => {
    const set = new Set<string>(forms.map((f) => f.ext));
    return [
      { value: "all", label: "ทุกไฟล์" },
      ...[...set].sort().map((e) => ({ value: e, label: extLabel[e] || e.toUpperCase() })),
    ];
  }, [forms]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forms.filter((f) => {
      const matchExt = extFilter === "all" || f.ext === extFilter;
      const matchSearch =
        !q ||
        f.title.toLowerCase().includes(q) ||
        f.code.toLowerCase().includes(q) ||
        f.filename.toLowerCase().includes(q) ||
        (f.rev && f.rev.toLowerCase().includes(q));
      return matchExt && matchSearch;
    });
  }, [forms, search, extFilter]);

  const download = (f: FormItem) => {
    window.open(`/api/v1/forms.php?download=${encodeURIComponent(f.filename)}`, "_blank");
  };

  return (
    <VStack gap={6}>
      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>ศูนย์แบบฟอร์ม (Form Center)</Heading>
            <Badge label={`${forms.length} แบบฟอร์ม`} variant="info" />
          </HStack>
          <Text type="body" color="secondary">
            แบบฟอร์มมาตรฐานของฝ่ายวิศวกรรม (F-EN / F-SF) — ดาวน์โหลดเพื่อพิมพ์ใช้หน้างานได้ทันที
          </Text>
        </VStack>
        <Button
          label="รีเฟรช"
          variant="secondary"
          size="sm"
          icon={<Icon icon={ArrowPathIcon} size="sm" />}
          onClick={fetchForms}
        />
      </HStack>

      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      <Toolbar
        label="ค้นหาแบบฟอร์ม"
        startContent={
          <HStack gap={2} wrap="wrap">
            <TextInput
              label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหารหัสแบบฟอร์ม หรือชื่อ... เช่น F-EN-07, ตรวจเช็ค, ใบแจ้งซ่อม"
              startIcon={MagnifyingGlassIcon}
              value={search}
              onChange={setSearch}
              style={{ width: "100%", maxWidth: 420 }}
            />
            <Selector
              label="ประเภทไฟล์"
              isLabelHidden
              placeholder="ทุกไฟล์"
              value={extFilter}
              onChange={setExtFilter}
              options={extOptions}
            />
          </HStack>
        }
      />

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <Card padding={6}>
          <VStack gap={2} hAlign="center">
            <Icon icon={DocumentTextIcon} size="lg" color="disabled" />
            <Text type="body" color="secondary">ไม่พบแบบฟอร์มที่ค้นหา</Text>
          </VStack>
        </Card>
      ) : (
        <Grid columns={{ minWidth: 300, repeat: "fit" }} gap={4}>
          {filtered.map((f) => (
            <Card key={f.filename} padding={4} elevation="low" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <HStack hAlign="between" vAlign="start" gap={2}>
                <Badge label={f.code || "เอกสาร"} variant="accent" />
                {f.rev && <Badge label={f.rev} variant="neutral" />}
              </HStack>
              <Text type="body" weight="bold" style={{ lineHeight: 1.4, flex: 1 }}>
                {f.title}
              </Text>
              <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
                <HStack gap={2} vAlign="center">
                  <Badge label={extLabel[f.ext] || f.ext.toUpperCase()} variant={extColor[f.ext] || "neutral"} />
                  <Text type="body" size="sm" color="disabled">{formatSize(f.size)}</Text>
                </HStack>
                <Button
                  label="ดาวน์โหลด"
                  size="sm"
                  variant="secondary"
                  icon={<Icon icon={DocumentArrowDownIcon} size="xsm" />}
                  onClick={() => download(f)}
                />
              </HStack>
            </Card>
          ))}
        </Grid>
      )}
    </VStack>
  );
}
