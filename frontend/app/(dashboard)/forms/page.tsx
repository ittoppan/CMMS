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
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Field } from "@astryxdesign/core/Field";
import { FileInput } from "@astryxdesign/core/FileInput";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import {
  DocumentArrowDownIcon,
  MagnifyingGlassIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
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

  // อัปโหลดแบบฟอร์มใหม่
  const [uploadOpen, setUploadOpen] = useState(false);
  const [upCode, setUpCode] = useState("");
  const [upRev, setUpRev] = useState("");
  const [upTitle, setUpTitle] = useState("");
  const [upFile, setUpFile] = useState<File | null>(null);
  const [upLoading, setUpLoading] = useState(false);
  const [upMsg, setUpMsg] = useState<{ text: string; isError: boolean } | null>(null);

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

  // ชื่อไฟล์ที่จะถูกสร้างเมื่อระบุ code (ตัวอย่างให้เห็นก่อนกดอัปโหลด)
  const computedName = useMemo(() => {
    if (!upCode.trim()) return upFile ? upFile.name : "";
    const code = upCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const rev = upRev.trim()
      ? (/^REV\.\d{2}$/i.test(upRev.trim()) ? upRev.trim().toUpperCase() : `REV.${String(parseInt(upRev, 10) || 0).padStart(2, "0")}`)
      : "REV.00";
    const ext = upFile?.name.split(".").pop() || "xlsx";
    return upTitle.trim() ? `${code} ${rev} ${upTitle.trim()}.${ext}` : `${code} ${rev} .${ext}`;
  }, [upCode, upRev, upTitle, upFile]);

  const handleUpload = async () => {
    if (!upFile) {
      setUpMsg({ text: "กรุณาเลือกไฟล์แบบฟอร์มก่อน", isError: true });
      return;
    }
    setUpLoading(true);
    setUpMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", upFile);
      if (upCode.trim()) {
        fd.append("code", upCode.trim());
        fd.append("rev", upRev.trim() || "REV.00");
        fd.append("title", upTitle.trim());
      }
      const res = await fetch("/api/v1/forms.php", { method: "POST", body: fd });
      const json = await res.json();
      if (json.status === "success") {
        setUpMsg({ text: `✅ อัปโหลดสำเร็จ: ${json.file?.filename || upFile.name}`, isError: false });
        setUpCode(""); setUpRev(""); setUpTitle(""); setUpFile(null);
        fetchForms();
      } else {
        setUpMsg({ text: `❌ ${json.message || "อัปโหลดไม่สำเร็จ"}`, isError: true });
      }
    } catch (e) {
      console.error("Upload form error", e);
      setUpMsg({ text: "❌ ไม่สามารถเชื่อมต่อระบบได้", isError: true });
    } finally {
      setUpLoading(false);
    }
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
        <HStack gap={2}>
          <Button
            label="อัปโหลดแบบฟอร์ม"
            variant="primary"
            size="sm"
            icon={<Icon icon={ArrowUpTrayIcon} size="sm" />}
            onClick={() => { setUpMsg(null); setUpFile(null); setUploadOpen(true); }}
          />
          <Button
            label="รีเฟรช"
            variant="secondary"
            size="sm"
            icon={<Icon icon={ArrowPathIcon} size="sm" />}
            onClick={fetchForms}
          />
        </HStack>
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

      {/* ═══ Dialog อัปโหลดแบบฟอร์มใหม่ ═══ */}
      {uploadOpen && (
        <Dialog isOpen onOpenChange={(open) => { if (!open) setUploadOpen(false); }}>
          <DialogHeader title="อัปโหลดแบบฟอร์มใหม่" />
          <VStack gap={4} style={{ padding: 24 }}>
            <Text type="body" color="secondary">
              เลือกไฟล์แบบฟอร์ม (xls/xlsx/xlsm/pdf/docx/ods/doc/csv/pptx สูงสุด 25 MB) — ไฟล์จะถูกบันทึกที่ docs/EN และโผล่ในรายการทันที
            </Text>

            {upMsg && (
              <div style={{
                padding: "10px 14px", borderRadius: 8,
                background: upMsg.isError ? "var(--cmms-danger-light, #fef2f2)" : "var(--cmms-success-light)",
                border: `1px solid ${upMsg.isError ? "var(--cmms-danger, #ef4444)" : "var(--cmms-success)"}`,
                color: upMsg.isError ? "var(--cmms-danger, #ef4444)" : "var(--cmms-success)",
                fontWeight: 600, fontSize: 13,
              }}>
                {upMsg.text}
              </div>
            )}

            <FormLayout>
              <Field label="รหัสแบบฟอร์ม (ไม่บังคับ)" inputID="upCode">
                <TextInput
                  label="รหัส"
                  isLabelHidden
                  placeholder="เช่น F-EN-64 (เว้นว่าง = ใช้ชื่อไฟล์เดิม)"
                  value={upCode}
                  onChange={setUpCode}
                />
              </Field>

              <Field label="REV (ไม่บังคับ)" inputID="upRev">
                <TextInput
                  label="REV"
                  isLabelHidden
                  placeholder="เช่น REV.00 หรือ 01"
                  value={upRev}
                  onChange={setUpRev}
                />
              </Field>

              <Field label="ชื่อแบบฟอร์ม (จำเป็นเมื่อระบุรหัส)" inputID="upTitle">
                <TextInput
                  label="ชื่อ"
                  isLabelHidden
                  placeholder="เช่น ใบตรวจเช็คเครื่องจักรประจำวัน"
                  value={upTitle}
                  onChange={setUpTitle}
                />
              </Field>

              <Field label="ไฟล์แบบฟอร์ม *" inputID="upFile">
                <FileInput
                  label="เลือกไฟล์"
                  isLabelHidden
                  accept=".xls,.xlsx,.xlsm,.pdf,.docx,.ods,.doc,.csv,.pptx"
                  value={upFile}
                  onChange={(f) => {
                    const file = Array.isArray(f) ? f[0] ?? null : f;
                    setUpFile(file);
                    if (file) setUpMsg(null);
                  }}
                />
              </Field>
            </FormLayout>

            {computedName && (
              <div style={{
                padding: "10px 14px", borderRadius: 8,
                background: "var(--cmms-bg-muted)",
                border: "1px dashed var(--cmms-border)",
                fontSize: 12.5, color: "var(--cmms-text-secondary)",
              }}>
                <strong>ชื่อไฟล์ที่จะบันทึก:</strong> {computedName}
              </div>
            )}

            <HStack hAlign="end" gap={2}>
              <Button label="ยกเลิก" variant="secondary" onClick={() => setUploadOpen(false)} />
              <Button
                label="อัปโหลด"
                variant="primary"
                isLoading={upLoading}
                icon={<Icon icon={ArrowUpTrayIcon} size="sm" />}
                onClick={handleUpload}
              />
            </HStack>
          </VStack>
        </Dialog>
      )}
    </VStack>
  );
}
