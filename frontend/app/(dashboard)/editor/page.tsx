"use client";

// editor — v3 design system (shadcn-style)
// logic ครบเดิม: โหลด/บันทึก page_editor.php, live preview iframe, DnD layout

import { useState, useEffect, useRef } from "react";
import { PageShell } from "@/components/PageShell";
import { Grid } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Eye,
  Monitor,
  Tablet,
  Smartphone,
  Paintbrush,
} from "lucide-react";
import LayoutDndEditor from "../../../components/LayoutDndEditor";
import {
  ALL_PAGES,
  sectionsFor,
  isWired,
} from "../../../lib/pageLayout";
import type { PageLayoutItem } from "../../../lib/pageLayout";

const COLOR_SWATCHES = [
  { name: "TOPPAN Blue", hex: "#0068B5", bg: "#EDF3F8", text: "#00508C" },
  { name: "Emerald Maintenance Green", hex: "#059669", bg: "#ECFDF5", text: "#065F46" },
  { name: "Royal Purple Executive", hex: "#7C3AED", bg: "#F5F3FF", text: "#5B21B6" },
  { name: "Safety Amber Orange", hex: "#D97706", bg: "#FFFBEB", text: "#92400E" },
  { name: "Crimson Red Emergency", hex: "#DC2626", bg: "#FEF2F2", text: "#991B1B" },
  { name: "Midnight Dark Mode", hex: "#0F172A", bg: "#1E293B", text: "#F8FAFC" },
];

const BG_STYLES = [
  { id: "light", label: "สว่าง Minimal Slate (ค่าเริ่มต้น)", color: "#F8FAFC" },
  { id: "soft_blue", label: "ฟ้าซอฟท์ Soft Sky", color: "#F0F9FF" },
  { id: "warm_cream", label: "ครีม Warm Clean", color: "#FAFAF9" },
  { id: "dark_mode", label: "ดำ Sleek Dark Mode", color: "#0F172A" },
];

const BORDER_RADIUS_OPTIONS = [
  { id: "0px", label: "เหลี่ยมคม (0px Sharp)" },
  { id: "8px", label: "◽ มนมาตรฐาน (8px Rounded)" },
  { id: "16px", label: "⏹ มนโค้งสวยงาม (16px Smooth)" },
  { id: "24px", label: "โค้งมนเต็มขั้น (24px Pill)" },
];

const FONT_OPTIONS = [
  { id: "sarabun", label: "Sarabun (ทางการ Official ISO)" },
  { id: "kanit", label: "Kanit (พรีเมียม Modern Thai)" },
  { id: "inter", label: "Inter (สากล Clean Tech)" },
  { id: "prompt", label: "Prompt (สวยงามทันสมัย)" },
];

type ViewportSize = "desktop" | "tablet" | "phone";
type SidebarTab = "colors" | "formatting" | "text" | "banner" | "layout";

// ── local matchMedia hook ──
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export default function InteractiveStylePageEditor() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [selectedRoute, setSelectedRoute] = useState<string>("/dashboard");
  const [viewport, setViewport] = useState<ViewportSize>("desktop");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("colors");

  // Live Style & Color Customization States
  const [primaryColor, setPrimaryColor] = useState("#0068B5");
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

  const [layoutItems, setLayoutItems] = useState<PageLayoutItem[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Initialize Route from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetPage = params.get("page");
    if (targetPage && ALL_PAGES.some(p => p.value === targetPage)) {
      setSelectedRoute(targetPage);
    }
  }, []);

  // Fetch Page Config & Colors from MySQL
  useEffect(() => {
    const matched = ALL_PAGES.find(p => p.value === selectedRoute);
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
          if (Array.isArray(json.blocks.layout)) setLayoutItems(json.blocks.layout);
        } else {
          // ยังไม่เคยบันทึก — ใช้โมเดล section มาตรฐานของหน้า
          setLayoutItems(sectionsFor(selectedRoute).map(s => ({ id: s.id, enabled: true })));
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
            layout: layoutItems,
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
    <PageShell
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ระบบ & ตั้งค่า" }, { label: "สตูดิโอปรับแต่งสไตล์" }]}
      title="สตูดิโอปรับแต่งสไตล์ & โทนสีหน้าเว็บ"
      description="เลือกหน้า เปลี่ยนสีหลัก พื้นหลัง มุมมน และฟอนต์ แล้วบันทึกลงฐานข้อมูล — ดูตัวอย่างแบบเรียลไทม์ก่อนเผยแพร่"
      actions={
        <Badge variant="info">
          <Paintbrush size={14} strokeWidth={1.75} aria-hidden="true" /> Live Preview
        </Badge>
      }
    >
      <div className="flex flex-col gap-4 pb-24 lg:pb-8">
        {/* Header Notification Banner */}
        {saveSuccess && (
          <Alert variant="success" title="สำเร็จ" description={`บันทึกโทนสีและสไตล์รูปแบบของหน้า '${selectedRoute}' เข้าฐานข้อมูลเรียบร้อยแล้ว!`} />
        )}

        {/* Main Split Layout: Interactive Color/Format Panel + Real Live Preview */}
        <div className="flex min-h-[650px] flex-col gap-4 lg:h-[calc(100vh-260px)] lg:flex-row">
          {/* Left panel */}
          <aside
            className="w-full shrink-0 overflow-y-auto rounded-xl border border-border bg-card lg:w-[350px]"
            style={{ maxHeight: "100%" }}
          >
            <div className="flex h-full flex-col gap-4 p-4">
              {/* Target Page Selector */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">เลือกหน้าที่จะปรับเปลี่ยนสี & รูปแบบ</p>
                <Select
                  value={selectedRoute}
                  onValueChange={(v) => setSelectedRoute(String(v))}
                >
                  <SelectTrigger aria-label="เลือกหน้า">
                    <SelectValue placeholder="เลือกหน้า" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_PAGES.map(p => (
                      <SelectItem key={p.value} value={p.value}>
                        {`${p.category} · ${p.label}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Sidebar Tabs */}
              <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as SidebarTab)}>
                <TabsList className="w-full">
                  <TabsTrigger value="colors" className="flex-1">สี &amp; จานสี</TabsTrigger>
                  <TabsTrigger value="formatting" className="flex-1">รูปแบบ &amp; สไตล์</TabsTrigger>
                  <TabsTrigger value="text" className="flex-1">ข้อความ</TabsTrigger>
                  <TabsTrigger value="layout" className="flex-1">จัดวาง Layout</TabsTrigger>
                </TabsList>
              </Tabs>

              {/* TAB 1: CLICKABLE COLOR PALETTES */}
              {sidebarTab === "colors" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">1. เลือกสีหลักของปุ่มและจุดเน้น:</p>
                    <Grid columns={2} gap={2}>
                      {COLOR_SWATCHES.map((swatch, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setPrimaryColor(swatch.hex)}
                          className={`flex items-center gap-2 rounded-lg p-2 text-left transition-shadow ${
                            primaryColor === swatch.hex
                              ? "border-2 border-transparent ring-2 ring-ring"
                              : "border border-zinc-300 dark:border-zinc-600"
                          }`}
                          style={{ background: swatch.bg }}
                        >
                          <span aria-hidden="true" className="h-[22px] w-[22px] shrink-0 rounded-full" style={{ background: swatch.hex }} />
                          <span className="text-xs font-semibold leading-tight" style={{ color: swatch.text }}>
                            {swatch.name}
                          </span>
                        </button>
                      ))}
                    </Grid>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">2. เลือกสีพื้นหลังหน้า:</p>
                    <div className="space-y-2">
                      {BG_STYLES.map((bgStyle) => (
                        <button
                          key={bgStyle.id}
                          type="button"
                          onClick={() => setBgColor(bgStyle.color)}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 transition-shadow ${
                            bgColor === bgStyle.color
                              ? "border-2 border-transparent ring-2 ring-ring"
                              : "border border-zinc-300 dark:border-zinc-600"
                          }`}
                          style={{
                            background: bgStyle.color,
                            color: bgStyle.color === "#0F172A" ? "#FFF" : "#0F172A",
                          }}
                        >
                          <span className="text-sm font-semibold">{bgStyle.label}</span>
                          {bgColor === bgStyle.color && <Badge variant="primary">เลือกอยู่</Badge>}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: FORMATTING & STYLES */}
              {sidebarTab === "formatting" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">1. มุมมนของการ์ด:</p>
                    <Grid columns={2} gap={2}>
                      {BORDER_RADIUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setBorderRadius(opt.id)}
                          className={`bg-card p-2.5 text-center transition-shadow ${
                            borderRadius === opt.id
                              ? "border-2 border-transparent ring-2 ring-ring"
                              : "border border-zinc-300 dark:border-zinc-600"
                          }`}
                          style={{ borderRadius: opt.id }}
                        >
                          <span className="text-sm font-semibold">{opt.label}</span>
                        </button>
                      ))}
                    </Grid>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">2. รูปแบบฟอนต์:</p>
                    <div className="space-y-2">
                      {FONT_OPTIONS.map((font) => (
                        <button
                          key={font.id}
                          type="button"
                          onClick={() => setFontFamily(font.id)}
                          className={`flex w-full items-center justify-between bg-card px-3 py-2.5 transition-shadow ${
                            fontFamily === font.id
                              ? "border-2 border-transparent ring-2 ring-ring"
                              : "border border-zinc-300 dark:border-zinc-600"
                          } rounded-lg`}
                        >
                          <span className="text-sm font-semibold">{font.label}</span>
                          {fontFamily === font.id && <Badge variant="primary">เลือกอยู่</Badge>}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: TEXT OVERRIDES */}
              {sidebarTab === "text" && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">ชื่อหัวข้อหน้า:</p>
                    <Input
                      label="ชื่อหัวข้อหน้า"
                      isLabelHidden
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">คำอธิบายย่อย:</p>
                    <Textarea
                      label="คำอธิบายย่อย"
                      isLabelHidden
                      rows={3}
                      value={customSubtitle}
                      onChange={(e) => setCustomSubtitle(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* TAB 4: LAYOUT (Drag & Drop) */}
              {sidebarTab === "layout" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        จัดเรียง Layout หน้า (ลาก-วาง)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ลาก section ขึ้น/ลง หรือกดปุ่มตาเพื่อซ่อน
                      </p>
                    </div>
                    {isWired(selectedRoute) ? (
                      <Badge variant="info">มีผลกับหน้าแล้ว</Badge>
                    ) : (
                      <Badge variant="neutral">พร้อมใช้ (เชื่อมหน้านี้ในรอบถัดไป)</Badge>
                    )}
                  </div>
                  <LayoutDndEditor
                    sections={sectionsFor(selectedRoute)}
                    value={layoutItems}
                    onChange={setLayoutItems}
                  />
                </div>
              )}

              <Separator className="mt-auto" />

              {/* Publish Action Button */}
              <div className="space-y-2">
                <Button
                  disabled={publishing}
                  onClick={handlePublish}
                  className="w-full"
                >
                  <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
                  {publishing ? "กำลังบันทึก..." : "บันทึกสไตล์ & โทนสี"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => (window.location.href = selectedRoute)}
                  className="w-full"
                >
                  <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
                  เปิดดูหน้าจริงแบบเต็มจอ
                </Button>
              </div>
            </div>
          </aside>

          {/* Right content: live preview */}
          <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3">
            {/* Top Viewport Controls Bar */}
            <Card className="flex flex-wrap items-center justify-between gap-4 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="primary">กำลังจำลองสไตล์หน้า: {selectedRoute}</Badge>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">สีหลัก:</span>
                  <span aria-hidden="true" className="h-4 w-4 rounded-full" style={{ background: primaryColor }} />
                  <span className="text-xs text-muted-foreground">มุมมน: {borderRadius}</span>
                </div>
              </div>

              {/* Device Viewport Buttons */}
              <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary p-1">
                <button
                  type="button"
                  onClick={() => setViewport("desktop")}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors"
                  style={{
                    background: viewport === "desktop" ? primaryColor : "transparent",
                    color: viewport === "desktop" ? "#fff" : undefined,
                  }}
                >
                  <Monitor size={16} strokeWidth={1.75} aria-hidden="true" /> Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setViewport("tablet")}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors"
                  style={{
                    background: viewport === "tablet" ? primaryColor : "transparent",
                    color: viewport === "tablet" ? "#fff" : undefined,
                  }}
                >
                  <Tablet size={16} strokeWidth={1.75} aria-hidden="true" /> Tablet
                </button>
                <button
                  type="button"
                  onClick={() => setViewport("phone")}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors"
                  style={{
                    background: viewport === "phone" ? primaryColor : "transparent",
                    color: viewport === "phone" ? "#fff" : undefined,
                  }}
                >
                  <Smartphone size={16} strokeWidth={1.75} aria-hidden="true" /> Mobile
                </button>
              </div>
            </Card>

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
          </div>
        </div>
      </div>
    </PageShell>
  );
}
