#!/usr/bin/env node
/**
 * build-install-prints.mjs — ไฟล์พร้อมพิมพ์ "โปสเตอร์ A5" และ "สติกเกอร์ QR"
 * ที่พาไปหน้า /install (ติดตั้ง PWA) — ใช้หน้างาน/โรงงาน
 *
 *   node scripts/print/build-install-prints.mjs                 # อ่าน APP_URL จาก .env
 *   node scripts/print/build-install-prints.mjs --url https://cmms-tpt.shares.zrok.io
 *   node scripts/print/build-install-prints.mjs --no-render     # สร้างแค่ HTML
 *
 * ผลลัพธ์ (scripts/print/out/):
 *   install-poster-a5.html / .pdf / .png      148 × 210 mm  (A5 portrait)
 *   install-sticker-99x57.html / .pdf / .png   99.1 × 57 mm (สติกเกอร์ 2×7 ดวง/แผ่น A4)
 *
 * ห้าม hardcode URL — origin มาจาก --url > env APP_URL > .env APP_URL
 */

import { arg, envValue, logoSrc, PALETTE, projectDirs, qrcodeFor, renderPieces } from "./print-kit.mjs";

const { ROOT, FRONTEND, OUT } = projectDirs(import.meta.url);
const C = { ...PALETTE, blueInk: "#00508C", line: "#DCE5EE" };

// ── origin ──────────────────────────────────────────────────────────────────
const rawBase = (arg("url") || process.env.APP_URL || envValue(ROOT, "APP_URL")).trim();
if (!rawBase) {
  console.error(
    "ERROR: ไม่พบ APP_URL — ใส่ใน .env หรือสั่ง:\n" +
      "  node scripts/print/build-install-prints.mjs --url https://<โดเมนจริง>"
  );
  process.exit(1);
}

let base;
try {
  const u = new URL(rawBase.replace(/\/+$/, ""));
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("protocol");
  base = u.origin + u.pathname.replace(/\/+$/, "");
} catch {
  console.error(`ERROR: APP_URL ไม่ใช่ URL ที่ถูกต้อง: ${rawBase}`);
  process.exit(1);
}

const baseHost = base.replace(/^https?:\/\//, "");
if (base.startsWith("http://")) {
  console.warn("WARNING: APP_URL เป็น http — PWA ติดตั้งไม่ได้ และ QR จะพาไปหน้าที่ใช้ไม่ได้");
}
const installPath = `${base}/install`;

// ── assets ──────────────────────────────────────────────────────────────────
const qr = await qrcodeFor(FRONTEND).toDataURL(installPath, {
  errorCorrectionLevel: "M",
  margin: 0,
  width: 900,
  color: { dark: C.navyDark, light: "#FFFFFF" },
});
const logoUrl = logoSrc(FRONTEND);
const logoChip = logoUrl
  ? `<img src="${logoUrl}" alt="TOPPAN">`
  : `<strong style="color:${C.blueInk};font-size:9pt">TOPPAN</strong>`;

// ── โปสเตอร์ A5 (148 × 210 mm) ──────────────────────────────────────────────
const posterSteps = [
  ["สแกน QR ด้วยกล้องมือถือ", "หรือพิมพ์ที่อยู่ใต้ QR ในเบราว์เซอร์ของมือถือ"],
  ["แตะ “เปิดในเบราว์เซอร์”", "ถ้าเปิดจากใน LINE จะติดตั้งไม่ได้ — ต้องเปิดด้วย Chrome หรือ Safari"],
  ["เพิ่มไปหน้าจอโฮม", "Android: เมนู ⋮ → ติดตั้งแอป · iPhone: ปุ่มแชร์ → เพิ่มไปยังหน้าจอโฮม"],
]
  .map(
    ([title, desc], i) => `
      <div class="step">
        <span class="num">${i + 1}</span>
        <div><h3>${title}</h3><p>${desc}</p></div>
      </div>`
  )
  .join("");

const posterCss = `
.sheet{width:148mm;height:210mm;}
.band{position:absolute;top:0;left:0;right:0;height:56mm;
  background:linear-gradient(148deg,${C.navyDark} 0%,${C.navy} 52%,${C.blue} 100%);}
.band::after{content:'';position:absolute;right:-16mm;top:-22mm;width:64mm;height:64mm;border-radius:50%;
  background:rgba(255,255,255,.06);}
.inner{position:absolute;top:0;left:0;right:0;padding:9mm 11mm 0;}
.toprow{display:flex;align-items:center;justify-content:space-between;}
.logo-chip{background:#fff;border-radius:2mm;padding:2.2mm 3mm;display:inline-flex;align-items:center;}
.logo-chip img{height:7mm;width:auto;display:block;}
.tag{color:#A9C4DE;font-size:7.6pt;letter-spacing:.02em;}
h1{margin-top:6mm;color:#fff;font-size:21.5pt;font-weight:800;line-height:1.2;letter-spacing:-.01em;white-space:nowrap;}
.sub{margin-top:2.2mm;color:#C6D9EE;font-size:10.2pt;font-weight:400;}
.qr-card{position:absolute;top:44mm;left:50%;transform:translateX(-50%);
  width:84mm;height:84mm;background:#fff;border-radius:4.5mm;
  box-shadow:0 4mm 11mm rgba(11,31,75,.22);display:flex;align-items:center;justify-content:center;}
.qr-card img{width:72mm;height:72mm;display:block;}
.url{margin-top:0;position:absolute;top:131mm;left:0;right:0;text-align:center;
  font-family:Consolas,ui-monospace,monospace;font-size:8.2pt;color:${C.faint};}
.steps{position:absolute;top:139mm;left:12mm;right:12mm;}
.step{display:grid;grid-template-columns:7.4mm 1fr;gap:3.6mm;align-items:start;
  padding:4mm 0;border-top:.25mm solid #E6EAEF;}
.step:first-child{border-top:0;padding-top:0;}
.step .num{width:7.4mm;height:7.4mm;font-size:10pt;}
.step h3{font-size:11pt;font-weight:700;color:${C.navyDark};}
.step p{margin-top:.7mm;font-size:8.6pt;color:${C.body};line-height:1.4;}
.footer{position:absolute;bottom:0;left:0;right:0;height:14mm;background:${C.tint};
  border-top:.25mm solid ${C.line};display:flex;align-items:center;justify-content:space-between;
  padding:0 11mm;font-size:7.4pt;color:${C.body};}`;

const posterBody = `<div class="sheet">
  <div class="band"></div>
  <div class="inner">
    <div class="toprow">
      <span class="logo-chip">${logoChip}</span>
      <span class="tag">ติดตั้งครั้งเดียว · ใช้ได้ตลอด</span>
    </div>
    <h1>ติดตั้งแอป CMMS บนมือถือ</h1>
    <p class="sub">สแกน QR → เปิดในเบราว์เซอร์ → เพิ่มไปหน้าจอโฮม</p>
  </div>
  <div class="qr-card"><img src="${qr}" alt="QR เปิดหน้าแนะนำการติดตั้ง"></div>
  <p class="url">${baseHost}/install</p>
  <div class="steps">${posterSteps}</div>
  <div class="footer">
    <span>เปิดใช้งานครั้งแรกต้องเข้าสู่ระบบด้วยบัญชี CMMS</span>
    <span>สอบถาม: ฝ่าย IT</span>
  </div>
</div>`;

// ── สติกเกอร์ 99.1 × 57 mm (2 × 7 ดวง / แผ่น A4) ─────────────────────────────
const stickerSteps = ["สแกน QR ด้วยกล้องมือถือ", "แตะ “เปิดในเบราว์เซอร์”", "เพิ่มไปหน้าจอโฮม"]
  .map((t, i) => `<div class="s-step"><span class="num">${i + 1}</span><span>${t}</span></div>`)
  .join("");

const stickerCss = `
.sheet{width:99.1mm;height:57mm;display:flex;}
.panel{width:37mm;height:57mm;background:linear-gradient(160deg,${C.navyDark},${C.navy});
  display:flex;align-items:center;justify-content:center;}
.panel .pad{background:#fff;border-radius:2mm;padding:2.2mm;display:flex;}
.panel img{width:28mm;height:28mm;display:block;}
.body{flex:1;padding:3.4mm 3.6mm 2.6mm;display:flex;flex-direction:column;}
.brand{display:block;font-size:5.4pt;line-height:1.3;letter-spacing:.14em;color:#94A3B8;text-transform:uppercase;}
h1{margin-top:1mm;font-size:10.6pt;font-weight:800;color:${C.navyDark};line-height:1.15;}
.s-steps{margin-top:1mm;flex:1;display:flex;flex-direction:column;justify-content:center;}
.s-step{display:grid;grid-template-columns:4.6mm 1fr;gap:1.6mm;align-items:center;padding:1.1mm 0;}
.s-step .num{width:4.6mm;height:4.6mm;font-size:5.8pt;}
.s-step span:last-child{font-size:6.8pt;color:${C.body};line-height:1.25;}
.url{margin-top:auto;font-family:Consolas,ui-monospace,monospace;font-size:5pt;color:#94A3B8;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}`;

const stickerBody = `<div class="sheet">
  <div class="panel"><span class="pad"><img src="${qr}" alt="QR ติดตั้งแอป CMMS"></span></div>
  <div class="body">
    <span class="brand">CMMS-TOPPAN</span>
    <h1>ติดตั้งแอป CMMS</h1>
    <div class="s-steps">${stickerSteps}</div>
    <span class="url">${baseHost}/install</span>
  </div>
</div>`;

// ── build ───────────────────────────────────────────────────────────────────
renderPieces(
  [
    {
      name: "install-poster-a5",
      title: "ติดตั้งแอป CMMS — โปสเตอร์ A5",
      width: 148,
      height: 210,
      css: posterCss,
      body: posterBody,
    },
    {
      name: "install-sticker-99x57",
      title: "ติดตั้งแอป CMMS — สติกเกอร์ 99.1 × 57 mm",
      width: 99.1,
      height: 57,
      css: stickerCss,
      body: stickerBody,
    },
  ],
  { outDir: OUT, frontendDir: FRONTEND, htmlOnly: process.argv.includes("--no-render") }
);

console.log(`\nQR ทั้งสองแบบชี้ไป: ${installPath}\n`);
