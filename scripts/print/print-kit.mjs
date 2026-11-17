/**
 * print-kit.mjs — ตัวช่วยกลางของสคริปต์สร้างไฟล์พร้อมพิมพ์ (scripts/print/*)
 *
 * - ฝังฟอนต์ Sarabun (subset ของ frontend) + โลโก้เป็น base64 → ไฟล์พกพาได้
 * - ประกอบ HTML หน้าเดียว (ขนาด mm) ให้สคริปต์เขียนแค่ body + css
 * - แปลง HTML → PDF (ขนาดจริง) และ PNG (2x) ผ่าน Chrome/Edge headless
 *
 * ไม่มี dependency ภายนอก: ฟอนต์/โลโก้/QR ใช้ของ frontend ที่ติดตั้งอยู่แล้ว
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

/** สีแบรนด์ที่ใช้ร่วมกัน (ตรงกับ design tokens ของแอป) */
export const PALETTE = {
  navyDark: "#0B1F4B",
  navy: "#193264",
  blue: "#0068B5",
  tint: "#EEF4F9",
  ink: "#1C2536",
  body: "#475569",
  faint: "#64748B",
};

/** ตำแหน่งโฟลเดอร์มาตรฐาน — ใช้จากสคริปต์ที่อยู่ใน scripts/print/ */
export function projectDirs(scriptUrl) {
  const here = dirname(fileURLToPath(scriptUrl));
  const root = resolve(here, "../..");
  return { HERE: here, ROOT: root, FRONTEND: join(root, "frontend"), OUT: join(here, "out") };
}

/** อ่านอาร์กิวเมนต์ CLI รูปแบบ --name value หรือ --name=value */
export function arg(name, fallback = "") {
  const argv = process.argv.slice(2);
  const pair = argv.indexOf(`--${name}`);
  if (pair >= 0) return argv[pair + 1] ?? fallback;
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : fallback;
}

export function dataUrl(path, mime) {
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

/** อ่านค่า KEY จาก .env (ไม่พึ่ง dotenv) */
export function envValue(rootDir, key) {
  const file = join(rootDir, ".env");
  if (!existsSync(file)) return "";
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(new RegExp(`^${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const WEIGHTS = [400, 700, 800];
const SUBSETS = [
  ["thai", "U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC"],
  [
    "latin",
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  ],
];

/** @font-face ของ Sarabun (400/700/800 × ไทย/ละติน) ฝัง base64 */
export function fontFaces(frontendDir) {
  const dir = join(frontendDir, "public", "fonts");
  const faces = [];
  for (const weight of WEIGHTS) {
    for (const [subset, range] of SUBSETS) {
      const file = join(dir, `sarabun-${weight}-${subset}.woff2`);
      if (!existsSync(file)) continue;
      faces.push(
        `@font-face{font-family:'Sarabun';font-style:normal;font-display:block;font-weight:${weight};src:url(${dataUrl(file, "font/woff2")}) format('woff2');unicode-range:${range};}`
      );
    }
  }
  return faces.join("\n");
}

/** โลโก้ TOPPAN เป็น data URL (หรือ "" ถ้าไม่มีไฟล์) */
export function logoSrc(frontendDir) {
  const file = join(frontendDir, "public", "logo.png");
  return existsSync(file) ? dataUrl(file, "image/png") : "";
}

/** แพ็กเกจ qrcode ของ frontend (ไม่ต้องติดตั้งซ้ำที่ root) */
export function qrcodeFor(frontendDir) {
  return createRequire(join(frontendDir, "package.json"))("qrcode");
}

const resetCss = (accent) => `*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
html,body{background:#fff;color:${PALETTE.ink};font-family:'Sarabun','Leelawadee UI',Tahoma,sans-serif;-webkit-font-smoothing:antialiased;}
.sheet{position:relative;overflow:hidden;background:#fff;}
.num{display:flex;align-items:center;justify-content:center;border-radius:50%;background:${accent};color:#fff;font-weight:800;line-height:1;}`;

/**
 * ประกอบ HTML หน้าเดียว: <html><head>fonts + @page + reset</head><body>…</body></html>
 * piece = { title, width, height, accent?, css?, body }
 */
export function buildPage({ frontendDir, title, width, height, accent = PALETTE.blue, css = "", body }) {
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<title>${title}</title>
<style>
${fontFaces(frontendDir)}
@page{size:${width}mm ${height}mm;margin:0;}
${resetCss(accent)}
${css}
</style></head>
<body>${body}</body></html>`;
}

function chromePath() {
  return [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ]
    .filter(Boolean)
    .find((p) => existsSync(p)) ?? "";
}

/**
 * เขียน HTML ของทุกชิ้น แล้วแปลงเป็น PDF/PNG ด้วย Chrome
 * @param {Array<{name:string,title:string,width:number,height:number,css?:string,body:string,accent?:string}>} pieces
 * @param {{outDir:string, frontendDir:string, htmlOnly?:boolean}} options
 */
export function renderPieces(pieces, { outDir, frontendDir, htmlOnly = false }) {
  mkdirSync(outDir, { recursive: true });
  const chrome = htmlOnly ? "" : chromePath();
  if (!htmlOnly && !chrome) {
    console.warn("WARNING: ไม่พบ Chrome/Edge — ได้แค่ HTML (เปิดแล้วกด Ctrl+P)");
  }

  for (const piece of pieces) {
    const htmlPath = join(outDir, `${piece.name}.html`);
    writeFileSync(htmlPath, buildPage({ ...piece, frontendDir }), "utf8");
    console.log(`✓ ${htmlPath}`);
    if (!chrome) continue;

    const fileUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;
    const common = ["--headless=new", "--disable-gpu", "--no-first-run", "--virtual-time-budget=4000"];

    const pdf = join(outDir, `${piece.name}.pdf`);
    const pdfArgs = [...common, "--no-pdf-header-footer", "--print-to-pdf-no-header", `--print-to-pdf=${pdf}`, fileUrl];
    if (spawnSync(chrome, pdfArgs, { encoding: "utf8" }).status === 0 && existsSync(pdf)) {
      console.log(`✓ ${pdf} (${Math.round(statSync(pdf).size / 1024)}KB)`);
    } else {
      console.warn(`! PDF ไม่สำเร็จ (${piece.name})`);
    }

    const pxPerMm = 96 / 25.4;
    const png = join(outDir, `${piece.name}.png`);
    const pngArgs = [
      ...common,
      "--hide-scrollbars",
      "--force-device-scale-factor=2",
      `--window-size=${Math.ceil(piece.width * pxPerMm) + 2},${Math.ceil(piece.height * pxPerMm) + 2}`,
      `--screenshot=${png}`,
      fileUrl,
    ];
    if (spawnSync(chrome, pngArgs, { encoding: "utf8" }).status === 0 && existsSync(png)) {
      console.log(`✓ ${png}`);
    } else {
      console.warn(`! PNG ไม่สำเร็จ (${piece.name})`);
    }
  }
}
