#!/usr/bin/env node
/**
 * build-line-repair-prints.mjs — ไฟล์พร้อมพิมพ์สำหรับ "แจ้งซ่อมผ่าน LINE OA"
 *   - โปสเตอร์ A5: ชวนเพิ่มเพื่อน LINE OA + 3 ขั้นตอนแจ้งซ่อม/ติดตามงาน
 *   - สติกเกอร์ 99.1×57 mm (2×7 ดวง/แผ่น A4): QR ประจำเครื่อง → LIFF หน้าแจ้งซ่อม
 *
 *   node scripts/print/build-line-repair-prints.mjs
 *   node scripts/print/build-line-repair-prints.mjs --asset-code M-0123 --asset-name "เครื่องฉีดพลาสติก 3"
 *   node scripts/print/build-line-repair-prints.mjs --liff-id 2007374280-xxxxxxxx
 *   node scripts/print/build-line-repair-prints.mjs --no-render        # HTML อย่างเดียว
 *
 * หลักการ: ไม่ hardcode โดเมน/LIFF ID — อ่านตามลำดับ
 *   LIFF ID : --liff-id → env LINE_LIFF_ID → settings.line_liff_id (ผ่าน php CLI)
 *   OA QR   : scripts/print/assets/line-oa-qr.png (หรือ --oa-qr <ไฟล์>)
 *
 * หมายเหตุสำคัญ: QR บนสติกเกอร์เป็น "URL" (liff.line.me/...) ไม่ใช่ token CMMS-A-…
 * เพราะกล้องมือถือทั่วไปต้องเห็นเป็นลิงก์จึงจะเปิดแอปได้ — หน้า /repair/request
 * อ่าน ?asset_code= แล้วเลือกเครื่องให้อัตโนมัติอยู่แล้ว (RepairRequestForm)
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  dataUrl,
  envValue,
  fontFaces,
  logoSrc,
  qrcodeFor,
  renderPiece,
} from "./print-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const FRONTEND = join(ROOT, "frontend");
const OUT = join(HERE, "out");

const C = {
  navyDark: "#0B1F4B",
  navy: "#193264",
  blue: "#0068B5",
  line: "#06C755",
  lineDark: "#04A94A",
  tint: "#EEF4F9",
  lineTint: "#F1FBF4",
  ink: "#1C2536",
  body: "#475569",
  faint: "#64748B",
};

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name, fallback = "") => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0) return argv[i + 1] ?? fallback;
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : fallback;
};
const render = !argv.includes("--no-render");
const assetCode = arg("asset-code", "M-0000").trim().toUpperCase();
const assetName = arg("asset-name", "ชื่อเครื่องจักร (ตัวอย่าง)").trim();
const oaQrPath = arg("oa-qr", join(HERE, "assets", "line-oa-qr.png"));

// ── LIFF ID: --liff-id → env/.env → settings (php CLI) ──────────────────────
function liffIdFromSettings() {
  const code =
    'require "src/config/db.php"; $p=getDb(); ' +
    '$s=$p->prepare("SELECT setting_value FROM settings WHERE setting_key=?"); ' +
    '$s->execute(["line_liff_id"]); echo trim((string)$s->fetchColumn());';
  const r = spawnSync("php", ["-r", code], { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? (r.stdout || "").trim() : "";
}

const liffId =
  arg("liff-id") ||
  process.env.LINE_LIFF_ID ||
  envValue(ROOT, "LINE_LIFF_ID") ||
  liffIdFromSettings();

if (!liffId) {
  console.error(
    "ERROR: ไม่พบ LIFF ID ของหน้าแจ้งซ่อม\n" +
      "  ใส่ใน Settings → LIFF App ID, หรือ .env LINE_LIFF_ID=...,\n" +
      "  หรือสั่ง: --liff-id <LIFF_ID>"
  );
  process.exit(1);
}

const liffUrl = `https://liff.line.me/${liffId}`;
const assetUrl = `${liffUrl}?asset_code=${encodeURIComponent(assetCode)}`;

// ── assets ──────────────────────────────────────────────────────────────────
const QRCode = qrcodeFor(FRONTEND);
const logo = logoSrc(FRONTEND);
const oaQr = existsSync(oaQrPath) ? dataUrl(oaQrPath, "image/png") : "";
if (!oaQr) {
  console.error(`ERROR: ไม่พบรูป QR ของ LINE OA: ${oaQrPath} (ดาวน์โหลดจาก LINE OA Manager แล้ววางไว้)`);
  process.exit(1);
}

const machineQr = await QRCode.toDataURL(assetUrl, {
  errorCorrectionLevel: "M",
  margin: 0,
  width: 900,
  color: { dark: C.navyDark, light: "#FFFFFF" },
});

const baseCss = `
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
html,body{background:#fff;color:${C.ink};font-family:'Sarabun','Leelawadee UI',Tahoma,sans-serif;-webkit-font-smoothing:antialiased;}
.sheet{position:relative;overflow:hidden;background:#fff;}
.num{display:flex;align-items:center;justify-content:center;border-radius:50%;background:${C.line};color:#fff;font-weight:800;line-height:1;}
`;

// ── โปสเตอร์ A5: ชวนเพิ่มเพื่อน + แจ้งซ่อมผ่าน LINE ─────────────────────────
const posterSteps = [
  ["สแกน QR เพิ่มเพื่อน CMMS-TOPPAN", "ทำครั้งเดียว — จากนั้นเปิดแชทนี้ได้ตลอด"],
  ["แตะเมนู “แจ้งซ่อม” ในการ์ดเมนู", "เลือกเครื่องจักร กรอกอาการ เสียบรูปได้ทันที"],
  ["ติดตามสถานะในแชท", "ระบบแจ้งเตือนเมื่อช่างรับงาน และเมื่อปิดงาน"],
]
  .map(
    ([title, desc], i) => `
      <div class="step">
        <span class="num">${i + 1}</span>
        <div><h3>${title}</h3><p>${desc}</p></div>
      </div>`
  )
  .join("");

const posterHtml = `<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<title>แจ้งซ่อมผ่าน LINE — โปสเตอร์ A5</title>
<style>
${fontFaces(FRONTEND)}
@page{size:148mm 210mm;margin:0;}
${baseCss}
.sheet{width:148mm;height:210mm;}
.band{position:absolute;top:0;left:0;right:0;height:56mm;
  background:linear-gradient(148deg,${C.navyDark} 0%,${C.navy} 55%,${C.blue} 100%);}
.band::after{content:'';position:absolute;right:-18mm;top:-24mm;width:62mm;height:62mm;border-radius:50%;
  background:rgba(255,255,255,.06);}
.inner{position:absolute;top:0;left:0;right:0;padding:9mm 11mm 0;}
.toprow{display:flex;align-items:center;justify-content:space-between;}
.logo-chip{background:#fff;border-radius:2mm;padding:2.2mm 3mm;display:inline-flex;align-items:center;}
.logo-chip img{height:7mm;width:auto;display:block;}
.tag{color:#A9C4DE;font-size:7.6pt;}
h1{margin-top:4mm;color:#fff;font-size:22pt;font-weight:800;line-height:1.15;letter-spacing:-.01em;white-space:nowrap;}
.sub{margin-top:1.6mm;color:#C6D9EE;font-size:9.6pt;}
.qr-card{position:absolute;top:46mm;left:50%;transform:translateX(-50%);
  width:88mm;height:84mm;background:#fff;border-radius:4.5mm;
  box-shadow:0 4mm 11mm rgba(11,31,75,.20);display:flex;flex-direction:column;
  align-items:center;justify-content:center;}
.qr-card .plus{position:absolute;top:-4.5mm;left:50%;transform:translateX(-50%);
  background:${C.line};color:#fff;font-size:8pt;font-weight:700;white-space:nowrap;
  padding:2mm 4mm;border-radius:99mm;box-shadow:0 1mm 3mm rgba(6,199,85,.35);}
.qr-card img.qr{width:64mm;height:64mm;display:block;margin-top:1mm;}
.qr-card .hint{margin-top:3mm;font-size:7pt;color:${C.faint};letter-spacing:.02em;}
.steps{position:absolute;top:136.5mm;left:12mm;right:12mm;}
.step{display:grid;grid-template-columns:7.4mm 1fr;gap:3.6mm;align-items:start;
  padding:4.6mm 0;border-top:.25mm solid #E6EAEF;}
.step:first-child{border-top:0;padding-top:0;}
.step .num{width:7.4mm;height:7.4mm;font-size:10pt;}
.step h3{font-size:10.8pt;font-weight:700;color:${C.navyDark};}
.step p{margin-top:.7mm;font-size:8.4pt;color:${C.body};line-height:1.38;}
.footer{position:absolute;bottom:0;left:0;right:0;height:13mm;background:${C.lineTint};
  border-top:.25mm solid #CBEBD6;display:flex;align-items:center;justify-content:space-between;
  padding:0 11mm;font-size:7.2pt;color:${C.body};}
.footer b{color:${C.lineDark};}
</style></head>
<body><div class="sheet">
  <div class="band"></div>
  <div class="inner">
    <div class="toprow">
      <span class="logo-chip">${logo ? `<img src="${logo}" alt="TOPPAN">` : `<strong style="color:${C.blue};font-size:9pt">TOPPAN</strong>`}</span>
      <span class="tag">ไม่ต้องติดตั้งแอป · ใช้ LINE ที่มีอยู่แล้ว</span>
    </div>
    <h1>แจ้งซ่อมผ่าน LINE</h1>
    <p class="sub">แจ้งเครื่องเสีย ติดตามงานซ่อม และรับแจ้งเตือนในแชทเดียว</p>
  </div>
  <div class="qr-card">
    <span class="plus">+ เพิ่มเพื่อน CMMS-TOPPAN</span>
    <img class="qr" src="${oaQr}" alt="QR เพิ่มเพื่อน LINE OA">
    <span class="hint">เปิดกล้อง LINE แล้วสแกน</span>
  </div>
  <div class="steps">${posterSteps}</div>
  <div class="footer">
    <span><b>ครั้งแรก:</b> ผูก LINE กับเลขพนักงาน (ถ้ายังไม่มีในระบบ แจ้งแอดมินเพิ่มผู้ใช้ก่อน)</span>
    <span>ที่เครื่องจักร: สแกน QR ประจำเครื่อง</span>
  </div>
</div></body></html>`;

// ── สติกเกอร์ประจำเครื่อง: QR → LIFF หน้าแจ้งซ่อม (เลือกเครื่องอัตโนมัติ) ─────
const stickerSteps = [
  "สแกน QR ด้วยกล้องมือถือ",
  "เปิดใน LINE — ระบบเลือกเครื่องนี้ให้",
  "กรอกอาการ / แนบรูป แล้วส่ง",
]
  .map((t, i) => `<div class="s-step"><span class="num">${i + 1}</span><span>${t}</span></div>`)
  .join("");

const stickerHtml = `<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<title>แจ้งซ่อมเครื่องนี้ — สติกเกอร์ 99.1 × 57 mm</title>
<style>
${fontFaces(FRONTEND)}
@page{size:99.1mm 57mm;margin:0;}
${baseCss}
.sheet{width:99.1mm;height:57mm;display:flex;}
.panel{width:37mm;height:57mm;background:linear-gradient(160deg,${C.navyDark},${C.navy});
  display:flex;align-items:center;justify-content:center;}
.panel .pad{background:#fff;border-radius:2mm;padding:2.2mm;display:flex;}
.panel img{width:28mm;height:28mm;display:block;}
.body{flex:1;padding:3.4mm 3.6mm 2.6mm;display:flex;flex-direction:column;border-left:.9mm solid ${C.line};}
.brand{display:block;font-size:5.2pt;line-height:1.35;letter-spacing:.14em;color:#94A3B8;text-transform:uppercase;}
h1{margin-top:1.4mm;font-size:9.8pt;font-weight:800;color:${C.navyDark};line-height:1.15;}
.machine{margin-top:1mm;font-size:6.8pt;font-weight:700;color:${C.body};line-height:1.2;
  display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;}
.code{margin-top:.8mm;font-family:Consolas,ui-monospace,monospace;font-size:6.2pt;color:${C.blue};letter-spacing:.06em;}
.s-steps{margin-top:1mm;flex:1;display:flex;flex-direction:column;justify-content:center;}
.s-step{display:grid;grid-template-columns:4.4mm 1fr;gap:1.6mm;align-items:center;padding:.9mm 0;}
.s-step .num{width:4.4mm;height:4.4mm;font-size:5.6pt;}
.s-step span:last-child{font-size:6.4pt;color:${C.body};line-height:1.25;}
.line-pill{position:absolute;right:3.6mm;bottom:2.4mm;background:${C.line};color:#fff;
  font-size:5.2pt;font-weight:700;padding:.9mm 2mm;border-radius:99mm;letter-spacing:.02em;}
</style></head>
<body><div class="sheet">
  <div class="panel"><span class="pad"><img src="${machineQr}" alt="QR แจ้งซ่อมเครื่องนี้"></span></div>
  <div class="body">
    <span class="brand">CMMS-TOPPAN · แจ้งซ่อม</span>
    <h1>แจ้งซ่อมเครื่องนี้</h1>
    <span class="machine">${assetName}</span>
    <span class="code">${assetCode}</span>
    <div class="s-steps">${stickerSteps}</div>
  </div>
  <span class="line-pill">ผ่าน LINE OA</span>
</div></body></html>`;

// ── build ───────────────────────────────────────────────────────────────────
const pieces = [
  { name: "line-repair-poster-a5", html: posterHtml, size: { w: 148, h: 210 } },
  { name: `line-repair-sticker-${assetCode.replace(/[^A-Z0-9-]/g, "")}`, html: stickerHtml, size: { w: 99.1, h: 57 } },
];

for (const piece of pieces) {
  if (!render) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `${piece.name}.html`), piece.html, "utf8");
    console.log(`✓ ${join(OUT, `${piece.name}.html`)}`);
    continue;
  }
  renderPiece(piece, OUT);
}

console.log(`
LIFF หน้าแจ้งซ่อม: ${liffUrl}
QR ประจำเครื่อง (${assetCode}): ${assetUrl}
`);
