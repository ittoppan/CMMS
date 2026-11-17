/**
 * print-kit.mjs — helper ที่ใช้ร่วมกันของสคริปต์สร้างไฟล์พร้อมพิมพ์ (scripts/print/*)
 * - ฝังฟอนต์ Sarabun (subset woff2 ของ frontend) + โลโก้ เป็น base64 ให้ไฟล์พกพาได้
 * - แปลง HTML → PDF/PNG ขนาดจริงผ่าน Chrome/Edge headless
 * ไม่มี dependency ภายนอก (ใช้เฉพาะไฟล์ในโปรเจกต์)
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const THAI_RANGE = "U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC";
const LATIN_RANGE =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

export function dataUrl(path, mime) {
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

/** @font-face ของ Sarabun 3 น้ำหนัก (400/700/800) ฝัง base64 */
export function fontFaces(frontendDir) {
  const dir = join(frontendDir, "public", "fonts");
  return [400, 700, 800]
    .flatMap((w) =>
      [
        ["thai", THAI_RANGE],
        ["latin", LATIN_RANGE],
      ]
        .map(([subset, range]) => {
          const file = join(dir, `sarabun-${w}-${subset}.woff2`);
          if (!existsSync(file)) return "";
          return `@font-face{font-family:'Sarabun';font-style:normal;font-display:block;font-weight:${w};src:url(${dataUrl(file, "font/woff2")}) format('woff2');unicode-range:${range};}`;
        })
        .filter(Boolean)
    )
    .join("\n");
}

/** โลโก้ TOPPAN เป็น data URL (หรือ "" ถ้าไม่มีไฟล์) */
export function logoSrc(frontendDir) {
  const file = join(frontendDir, "public", "logo.png");
  return existsSync(file) ? dataUrl(file, "image/png") : "";
}

/** qrcode ของ frontend (ไม่ต้องติดตั้งซ้ำ) */
export function qrcodeFor(frontendDir) {
  return createRequire(join(frontendDir, "package.json"))("qrcode");
}

export function chromePath() {
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
 * เขียน HTML แล้วแปลงเป็น PDF (ขนาดจริง) + PNG (2x) ด้วย Chrome
 * @param {{name:string, html:string, size:{w:number,h:number}}} piece  ขนาดหน่วย mm
 */
export function renderPiece({ name, html, size }, outDir) {
  mkdirSync(outDir, { recursive: true });
  const htmlPath = join(outDir, `${name}.html`);
  writeFileSync(htmlPath, html, "utf8");
  const done = { html: htmlPath, pdf: "", png: "" };
  console.log(`✓ ${htmlPath}`);

  const chrome = chromePath();
  if (!chrome) {
    console.warn("WARNING: ไม่พบ Chrome/Edge — ได้แค่ HTML (เปิดแล้วกด Ctrl+P)");
    return done;
  }

  const fileUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;
  const common = ["--headless=new", "--disable-gpu", "--no-first-run", "--virtual-time-budget=4000"];

  const pdf = join(outDir, `${name}.pdf`);
  const r1 = spawnSync(
    chrome,
    [...common, "--no-pdf-header-footer", "--print-to-pdf-no-header", `--print-to-pdf=${pdf}`, fileUrl],
    { encoding: "utf8" }
  );
  if (r1.status === 0 && existsSync(pdf)) {
    done.pdf = pdf;
    console.log(`✓ ${pdf} (${Math.round(statSync(pdf).size / 1024)}KB)`);
  } else {
    console.warn(`! PDF ไม่สำเร็จ (${name}): ${(r1.stderr || "").split("\n")[0]}`);
  }

  const pxPerMm = 96 / 25.4;
  const png = join(outDir, `${name}.png`);
  const r2 = spawnSync(
    chrome,
    [
      ...common,
      "--hide-scrollbars",
      "--force-device-scale-factor=2",
      `--window-size=${Math.ceil(size.w * pxPerMm) + 2},${Math.ceil(size.h * pxPerMm) + 2}`,
      `--screenshot=${png}`,
      fileUrl,
    ],
    { encoding: "utf8" }
  );
  if (r2.status === 0 && existsSync(png)) {
    done.png = png;
    console.log(`✓ ${png}`);
  } else {
    console.warn(`! PNG ไม่สำเร็จ (${name}): ${(r2.stderr || "").split("\n")[0]}`);
  }
  return done;
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
