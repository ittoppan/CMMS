"use client";

import { useState, useEffect, useRef } from "react";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import {
  VStack,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutPanel,
} from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
import { Card } from "@astryxdesign/core/Card";
import { Text, Heading } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Icon } from "@astryxdesign/core/Icon";
import { Divider } from "@astryxdesign/core/Divider";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import {
  PencilSquareIcon,
  CheckCircleIcon,
  EyeIcon,
  ComputerDesktopIcon,
  DeviceTabletIcon,
  DevicePhoneMobileIcon,
  PaintBrushIcon,
  SparklesIcon,
  SwatchIcon,
  Square2StackIcon,
  AdjustmentsVerticalIcon,
} from "@heroicons/react/24/outline";

interface SystemPageOption {
  value: string;
  label: string;
  category: string;
}

const SYSTEM_PAGES: SystemPageOption[] = [
  { value: "/dashboard", label: "📊 แดชบอร์ดภาพรวมระบบ", category: "งานซ่อมบำรุง" },
  { value: "/repair", label: "🔧 รายการใบสั่งงานซ่อม", category: "งานซ่อมบำรุง" },
  { value: "/repair/request", label: "📝 ฟอร์มแจ้งซ่อมด่วน", category: "งานซ่อมบำรุง" },
  { value: "/repair/kanban", label: "📌 Kanban Board", category: "งานซ่อมบำรุง" },
  { value: "/repair/tracking", label: "🔍 ติดตามงานซ่อม", category: "งานซ่อมบำรุง" },
  { value: "/asset_registry", label: "🏭 ทะเบียนเครื่องจักร (F-EN-01)", category: "แผน PM & เครื่องจักร" },
  { value: "/asset_registry/bom_tree", label: "🔩 BOM Tree ชิ้นส่วน", category: "แผน PM & เครื่องจักร" },
  { value: "/spare_parts", label: "⚙️ คลังสต็อกอะไหล่ (Sage 300)", category: "คลังอะไหล่" },
  { value: "/spare_parts/sage_sync", label: "📦 ตั้งค่าซิงค์ Sage 300", category: "คลังอะไหล่" },
  { value: "/analytics/predictive", label: "🔮 AI Predictive Maintenance", category: "วิเคราะห์ & รายงาน" },
  { value: "/reports/export_excel", label: "📥 Export Excel & CSV Center", category: "วิเคราะห์ & รายงาน" },
  { value: "/safety/work_permit", label: "🛡️ ใบอนุญาตทำงานเสี่ยง LOTO", category: "ความปลอดภัย" },
  { value: "/users", label: "👥 การจัดการผู้ใช้งานระบบ", category: "บุคลากร" },
  { value: "/settings", label: "⚙️ ตั้งค่าระบบทั้งหมด", category: "ตั้งค่า" },
];

const COLOR_SWATCHES = [
  { name: "TOPPAN Indigo", hex: "#4F46E5", bg: "#EEF0F8", text: "#3730A3" },
  { name: "Emerald Maintenance Green", hex: "#059669", bg: "#ECFDF5", text: "#065F46" },
  { name: "Royal Purple Executive", hex: "#7C3AED", bg: "#F5F3FF", text: "#5B21B6" },
  { name: "Safety Amber Orange", hex: "#D97706", bg: "#FFFBEB", text: "#92400E" },
  { name: "Crimson Red Emergency", hex: "#DC2626", bg: "#FEF2F2", text: "#991B1B" },
  { name: "Midnight Dark Mode", hex: "#0F172A", bg: "#1E293B", text: "#F8FAFC" },
];

const BG_STYLES = [
  { id: "light", label: "⚪ สว่าง Minimal Slate (ค่าเริ่มต้น)", color: "#F8FAFC" },
  { id: "soft_blue", label: "🔵 ฟ้าซอฟท์ Soft Sky", color: "#F0F9FF" },
  { id: "warm_cream", label: "📜 ครีม Warm Clean", color: "#FAFAF9" },
  { id: "dark_mode", label: "🌙 ดำ Sleek Dark Mode", color: "#0F172A" },
];

const BORDER_RADIUS_OPTIONS = [
  { id: "0px", label: "📐 เหลี่ยมคม (0px Sharp)" },
  { id: "8px", label: "◽ มนมาตรฐาน (8px Rounded)" },
  { id: "16px", label: "⏹️ มนโค้งสวยงาม (16px Smooth)" },
  { id: "24px", label: "💊 โค้งมนเต็มขั้น (24px Pill)" },
];

const FONT_OPTIONS = [
  { id: "sarabun", label: "Sarabun (ทางการ Official ISO)" },
  { id: "kanit", label: "Kanit (พรีเมียม Modern Thai)" },
  { id: "inter", label: "Inter (สากล Clean Tech)" },
  { id: "prompt", label: "Prompt (สวยงามทันสมัย)" },
];

type ViewportSize = "desktop" | "tablet" | "phone";
type SidebarTab = "colors" | "formatting" | "text" | "banner";

export default function InteractiveStylePageEditor() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [selectedRoute, setSelectedRoute] = useState<string>("/dashboard");
  const [viewport, setViewport] = useState<ViewportSize>("desktop");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("colors");

  // 🎨 Live Style & Color Customization States
  const [primaryColor, setPrimaryColor] = useState("#4F46E5");
  const [bgColor, setBgColor] = useState("#F8FAFC");
  const [borderRadius, setBorderRadius] = useState("12px");
  const [fontFamily, setFontFamily] = useState("kanit");
  const [cardShadow, setCardShadow] = useState("soft");

  // Text & Content Overrides
  const [customTitle, setCustomTitle] = useState("");
  const [customSubtitle, setCustomSubtitle] = useState("");
  const [badgeTag, setBadgeTag] = useState("");
  const [bannerNotice, setBannerNotice] = useState("");
  const [bannerColor, setBannerColor] = useState("info");

  const [publishing, setPublishing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Initialize Route from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetPage = params.get("page");
    if (targetPage && SYSTEM_PAGES.some(p => p.value === targetPage)) {
      setSelectedRoute(targetPage);
    }
  }, []);

  // Fetch Page Config & Colors from MySQL
  useEffect(() => {
    const matched = SYSTEM_PAGES.find(p => p.value === selectedRoute);
    if (matched) {
      setCustomTitle(matched.label);
      setCustomSubtitle(`ปรับแต่งรูปแบบสไตล์และสีหน้า ${matched.label}`);
    }

    fetch(`/api/v1/page_editor.php?route=${encodeURIComponent(selectedRoute)}`)
      .then(res => res.json())
      .then(json => {
        if (json.status === "success" && json.blocks) {
          if (json.title) setCustomTitle(json.title);
          if (json.blocks.primaryColor) setPrimaryColor(json.blocks.primaryColor);
          if (json.blocks.bgColor) setBgColor(json.blocks.bgColor);
          if (json.blocks.borderRadius) setBorderRadius(json.blocks.borderRadius);
          if (json.blocks.fontFamily) setFontFamily(json.blocks.fontFamily);
          if (json.blocks.customSubtitle) setCustomSubtitle(json.blocks.customSubtitle);
          if (json.blocks.badgeTag) setBadgeTag(json.blocks.badgeTag);
          if (json.blocks.bannerNotice) setBannerNotice(json.blocks.bannerNotice);
        }
      })
      .catch(e => console.error("Fetch page config error", e));
  }, [selectedRoute]);

  const handlePublish = async () => {
    setPublishing(true);
    setSaveSuccess(false);
    try {
      const res = await fetch("/api/v1/page_editor.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route: selectedRoute,
          title: customTitle,
          blocks: {
            primaryColor,
            bgColor,
            borderRadius,
            fontFamily,
            cardShadow,
            customSubtitle,
            badgeTag,
            bannerNotice,
            bannerColor,
            updatedAt: new Date().toISOString()
          }
        })
      });
      const json = await res.json();
      if (json.status === "success") {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      }
    } catch (e) {
      console.error("Save config error", e);
    } finally {
      setPublishing(false);
    }
  };

  const getViewportWidth = () => {
    if (viewport === "phone") return 380;
    if (viewport === "tablet") return 768;
    return "100%";
  };

  return (
    <VStack gap={4} style={{ height: "calc(100vh - 120px)", minHeight: 650 }}>
      {/* Header Notification Banner */}
      {saveSuccess && (
        <Card padding={3} style={{ background: "var(--cmms-success-bg)", border: "1px solid var(--cmms-success)" }}>
          <HStack gap={3} vAlign="center">
            <Icon icon={CheckCircleIcon} size="md" color="success" />
            <Text type="body" weight="bold" style={{ color: "var(--cmms-success)" }}>
              ✓ บันทึกโทนสีและสไตล์รูปแบบของหน้า '{selectedRoute}' เข้าฐานข้อมูลเรียบร้อยแล้ว!
            </Text>
          </HStack>
        </Card>
      )}

      {/* Main Split Layout: Interactive Color/Format Panel + Real Live Preview */}
      <Layout
        height="fill"
        start={
          <LayoutPanel width={350} padding={0} style={{ borderRight: "1px solid var(--cmms-border)", background: "#FAFAFA" }}>
            <VStack gap={4} style={{ padding: 16, height: "100%", overflowY: "auto" }}>
              {/* Target Page Selector */}
              <VStack gap={2}>
                <Text type="body" weight="bold">📍 เลือกหน้าที่จะปรับเปลี่ยนสี & รูปแบบ</Text>
                <Selector
                  label="เลือกหน้า"
                  isLabelHidden
                  value={selectedRoute}
                  onChange={(v) => setSelectedRoute(String(v))}
                  options={SYSTEM_PAGES.map(p => ({
                    value: p.value,
                    label: `${p.label} (${p.value})`
                  }))}
                />
              </VStack>

              <Divider />

              {/* Sidebar Tabs */}
              <TabList
                layout="fill"
                value={sidebarTab}
                onChange={(v) => setSidebarTab(v as SidebarTab)}
              >
                <Tab value="colors" label="🎨 สี & จานสี" />
                <Tab value="formatting" label="📐 รูปแบบ & สไตล์" />
                <Tab value="text" label="✏️ ข้อความ" />
              </TabList>

              {/* TAB 1: CLICKABLE COLOR PALETTES */}
              {sidebarTab === "colors" && (
                <VStack gap={4}>
                  <VStack gap={2}>
                    <Text type="body" size="sm" weight="semibold">1. เลือกสีหลักของปุ่มและจุดเน้น:</Text>
                    <Grid columns={2} gap={2}>
                      {COLOR_SWATCHES.map((swatch, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setPrimaryColor(swatch.hex)}
                          style={{
                            padding: 8,
                            borderRadius: 8,
                            border: primaryColor === swatch.hex ? "3px solid #000" : "1px solid #CBD5E1",
                            background: swatch.bg,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            textAlign: "left"
                          }}
                        >
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: swatch.hex, flexShrink: 0 }} />
                          <Text type="body" size="sm" weight="semibold" style={{ fontSize: "0.75rem", color: swatch.text }}>
                            {swatch.name}
                          </Text>
                        </button>
                      ))}
                    </Grid>
                  </VStack>

                  <Divider />

                  <VStack gap={2}>
                    <Text type="body" size="sm" weight="bold">2. เลือกสีพื้นหลังหน้า:</Text>
                    <VStack gap={2}>
                      {BG_STYLES.map((bgStyle) => (
                        <button
                          key={bgStyle.id}
                          type="button"
                          onClick={() => setBgColor(bgStyle.color)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: bgColor === bgStyle.color ? "3px solid #4F46E5" : "1px solid #CBD5E1",
                            background: bgStyle.color,
                            color: bgStyle.color === "#0F172A" ? "#FFF" : "#0F172A",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between"
                          }}
                        >
                          <Text type="body" size="sm" weight="bold">{bgStyle.label}</Text>
                          {bgColor === bgStyle.color && <Badge label="เลือกอยู่" variant="info" />}
                        </button>
                      ))}
                    </VStack>
                  </VStack>
                </VStack>
              )}

              {/* TAB 2: FORMATTING & STYLES */}
              {sidebarTab === "formatting" && (
                <VStack gap={4}>
                  <VStack gap={2}>
                    <Text type="body" size="sm" weight="bold">1. มุมมนของการ์ด:</Text>
                    <Grid columns={2} gap={2}>
                      {BORDER_RADIUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setBorderRadius(opt.id)}
                          style={{
                            padding: 10,
                            borderRadius: opt.id,
                            border: borderRadius === opt.id ? "3px solid #4F46E5" : "1px solid #CBD5E1",
                            background: "#FFFFFF",
                            cursor: "pointer",
                            textAlign: "center"
                          }}
                        >
                          <Text type="body" size="sm" weight="bold">{opt.label}</Text>
                        </button>
                      ))}
                    </Grid>
                  </VStack>

                  <Divider />

                  <VStack gap={2}>
                    <Text type="body" size="sm" weight="bold">2. รูปแบบฟอนต์:</Text>
                    <VStack gap={2}>
                      {FONT_OPTIONS.map((font) => (
                        <button
                          key={font.id}
                          type="button"
                          onClick={() => setFontFamily(font.id)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: fontFamily === font.id ? "3px solid #4F46E5" : "1px solid #CBD5E1",
                            background: "#FFFFFF",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between"
                          }}
                        >
                          <Text type="body" size="sm" weight="bold">{font.label}</Text>
                          {fontFamily === font.id && <Badge label="เลือกอยู่" variant="success" />}
                        </button>
                      ))}
                    </VStack>
                  </VStack>
                </VStack>
              )}

              {/* TAB 3: TEXT OVERRIDES */}
              {sidebarTab === "text" && (
                <VStack gap={4}>
                  <VStack gap={1}>
                    <Text type="body" size="sm" weight="semibold">ชื่อหัวข้อหน้า:</Text>
                    <TextInput
                      label="ชื่อหัวข้อหน้า"
                      isLabelHidden
                      value={customTitle}
                      onChange={setCustomTitle}
                    />
                  </VStack>

                  <VStack gap={1}>
                    <Text type="body" size="sm" weight="semibold">คำอธิบายย่อย:</Text>
                    <TextArea
                      label="คำอธิบายย่อย"
                      isLabelHidden
                      rows={3}
                      value={customSubtitle}
                      onChange={setCustomSubtitle}
                    />
                  </VStack>
                </VStack>
              )}

              <Divider style={{ marginTop: "auto" }} />

              {/* Publish Action Button */}
              <VStack gap={2}>
                <Button
                  label="💾 บันทึกสไตล์ & โทนสี"
                  variant="primary"
                  isLoading={publishing}
                  icon={<Icon icon={CheckCircleIcon} size="sm" />}
                  onClick={handlePublish}
                />
                <Button
                  label="🔗 เปิดดูหน้าจริงแบบเต็มจอ"
                  variant="secondary"
                  icon={<Icon icon={EyeIcon} size="sm" />}
                  onClick={() => (window.location.href = selectedRoute)}
                />
              </VStack>
            </VStack>
          </LayoutPanel>
        }
        content={
          <LayoutContent padding={4} style={{ background: "#F1F5F9", display: "flex", flexDirection: "column" }}>
            <VStack gap={3} style={{ height: "100%" }}>
              {/* Top Viewport Controls Bar */}
              <HStack hAlign="between" vAlign="center" wrap="wrap" gap={4} style={{ background: "#FFFFFF", padding: 12, borderRadius: 12, border: "1px solid #CBD5E1" }}>
                <HStack gap={2} vAlign="center">
                  <Badge label={`กำลังจำลองสไตล์หน้า: ${selectedRoute}`} variant="info" />
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: "0.8rem", color: "#64748B" }}>สีหลัก:</span>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: primaryColor }} />
                    <span style={{ fontSize: "0.8rem", color: "#64748B" }}>มุมมน: {borderRadius}</span>
                  </div>
                </HStack>

                {/* Device Viewport Buttons */}
                <HStack gap={1} style={{ background: "#F8FAFC", padding: 4, borderRadius: 8, border: "1px solid #E2E8F0" }}>
                  <button
                    type="button"
                    onClick={() => setViewport("desktop")}
                    style={{
                      padding: "6px 12px", borderRadius: 6, cursor: "pointer", border: "none",
                      background: viewport === "desktop" ? primaryColor : "transparent",
                      color: viewport === "desktop" ? "#fff" : "#64748B",
                      fontWeight: 700, fontSize: "0.8rem", display: "flex", alignItems: "center", gap: 4
                    }}
                  >
                    <Icon icon={ComputerDesktopIcon} size="xsm" /> Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewport("tablet")}
                    style={{
                      padding: "6px 12px", borderRadius: 6, cursor: "pointer", border: "none",
                      background: viewport === "tablet" ? primaryColor : "transparent",
                      color: viewport === "tablet" ? "#fff" : "#64748B",
                      fontWeight: 700, fontSize: "0.8rem", display: "flex", alignItems: "center", gap: 4
                    }}
                  >
                    <Icon icon={DeviceTabletIcon} size="xsm" /> Tablet
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewport("phone")}
                    style={{
                      padding: "6px 12px", borderRadius: 6, cursor: "pointer", border: "none",
                      background: viewport === "phone" ? primaryColor : "transparent",
                      color: viewport === "phone" ? "#fff" : "#64748B",
                      fontWeight: 700, fontSize: "0.8rem", display: "flex", alignItems: "center", gap: 4
                    }}
                  >
                    <Icon icon={DevicePhoneMobileIcon} size="xsm" /> Mobile
                  </button>
                </HStack>
              </HStack>

              {/* REAL-TIME DYNAMIC CSS CUSTOMIZATION PREVIEW CONTAINER */}
              <div style={{
                flex: 1,
                width: getViewportWidth(),
                margin: "0 auto",
                background: bgColor,
                borderRadius: borderRadius,
                boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
                overflow: "hidden",
                border: `3px solid ${primaryColor}`,
                transition: "all 0.3s ease-in-out"
              }}>
                <iframe
                  ref={iframeRef}
                  src={selectedRoute}
                  title="ตัวอย่างการปรับแต่งสไตล์"
                  style={{
                    width: "100%",
                    height: "100%",
                    border: "none"
                  }}
                />
              </div>
            </VStack>
          </LayoutContent>
        }
      />
    </VStack>
  );
}
