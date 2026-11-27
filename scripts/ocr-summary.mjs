#!/usr/bin/env node
/**
 * สรุปผล Open Code Review เป็น Markdown สำหรับ GITHUB_STEP_SUMMARY
 *
 * ใช้เพราะ push event ไม่มี PR ให้ action คอมเมนต์ (workflow เรียกเฉพาะตอน push/
 * workflow_dispatch — บน pull_request action จะคอมเมนต์ที่ PR เองอยู่แล้ว)
 *
 * usage: node scripts/ocr-summary.mjs [ocr-report.json]
 */
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "ocr-report.json";

let report;
try {
  report = JSON.parse(readFileSync(file, "utf8"));
} catch (err) {
  console.log(
    `_ocr-summary: อ่าน ${file} ไม่ได้ (${err instanceof Error ? err.message : "unknown"}) — ดู log ของ step Open Code Review_`
  );
  process.exit(0);
}

const issues = Array.isArray(report.issues) ? report.issues : [];
const lines = [
  `### 🛡️ Open Code Review — ${report.sla} (${report.scanMode} mode, ${process.env.GITHUB_EVENT_NAME ?? "local"})`,
  "",
  `**Score: ${report.score}/100 (${report.grade})** — ${
    report.passed ? "✅ passed" : "❌ below threshold"
  } (threshold ${report.threshold})`,
  "",
  `- Files scanned: ${Array.isArray(report.files) ? report.files.length : 0}`,
  `- Issues: ${issues.length}`,
  `- Duration: ${report.duration}s`,
];

const top = issues.slice(0, 10);
if (top.length > 0) {
  lines.push("", "| Severity | File:line | Message |", "|---|---|---|");
  for (const i of top) {
    const message = String(i.message ?? "").replace(/\|/g, "\\|");
    lines.push(`| ${i.severity} | \`${i.file}:${i.line}\` | ${message} |`);
  }
  if (issues.length > top.length) {
    lines.push("", `_...และอีก ${issues.length - top.length} รายการ — ดู artifact ของ run นี้_`);
  }
}

process.stdout.write(`${lines.join("\n")}\n`);
