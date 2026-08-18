#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
# บังคับ UTF-8 สำหรับ stdout/stderr — กัน UnicodeEncodeError (cp1252) ตอนรันผ่าน hook/CI บน Windows
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass
"""
CMMS-TPT — Design Guideline Audit
=================================
ตรวจทุกหน้าใน `frontend/app/**/page.tsx` ว่าตรงกับ
`docs/EN/DESIGN-GUIDELINE.md` หรือไม่ (eyebrow / emoji / gradient / hex hardcode / Andon)

ระดับผลลัพธ์:
  FAIL  — ผิด guideline อย่างชัดเจน (exit code 1)
  WARN  — ควรแก้ (debt) ไม่ทำให้ CI พัง (ยกเว้น --strict)

Checks:
  1. Gradient  (FAIL)  — flat design: ห้าม gradient block/พื้นหลังในหน้า
                        (ยกเว้น: ลายตาราง `transparent 1px`, hero navy ของ login)
  2. Banned hex (FAIL) — #0057A8 / #1E88E5 / #42A5F5 / #6ee7b7 (hex สมัย Phase gradient)
  3. Emoji ตกแต่ง (WARN) — ยกเว้นตัวที่ใช้งานจริง (ผลการกระทำ ✅❌✓✕, อันดับ 🥇🥈🥉,
                        ไอคอนเทมเพลต LINE, title/altText LINE, comment)
  4. Eyebrow (WARN) — ทุกหน้าควรมี `.cmms-eyebrow` (ยกเว้นหน้า standalone/มือถือ)
  5. Hex hardcode (WARN) — สี hex 6 หลักในหน้า ควรใช้ token var(--cmms-*)
  6. Andon (WARN) — สถานะควรใช้ `.cmms-status`/`AndonLamp` แทน Badge error/warning/success
  7. KPI (WARN) — การ์ด `.cmms-kpi-card` ควรมี `.cmms-kpi-value` (Barlow)

Usage:
  python scripts/design-audit.py                 # เต็มระบบ, FAIL เท่านั้นที่ทำให้ exit 1
  python scripts/design-audit.py --strict        # WARN ทุกตัวกลายเป็น FAIL
  python scripts/design-audit.py --diff <ref>    # ตรวจเฉพาะไฟล์ที่เปลี่ยนเทียบ ref (CI gate)
  python scripts/design-audit.py --json          # output เป็น JSON
"""

import argparse
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# กฎ & ข้อยกเว้น
# ---------------------------------------------------------------------------

# หน้า standalone/มือถือ/เครื่องมือ ที่ไม่ต้องมี eyebrow (ตาม guideline §6.1)
EYEBROW_EXEMPT = {
    "frontend/app/login/page.tsx",
    "frontend/app/change-password/page.tsx",
    "frontend/app/register/page.tsx",
    "frontend/app/scan/page.tsx",
    "frontend/app/editor/page.tsx",
    "frontend/app/repair-request/page.tsx",
    "frontend/app/repair/request/page.tsx",
    "frontend/app/page.tsx",
    # route alias → approval/page.tsx (มี header จริง)
    "frontend/app/(dashboard)/approval/center/page.tsx",
    # LINE Flex editor — หน้าเครื่องมือเต็มจอ (ไม่มีหัวหน้าเพจ)
    "frontend/app/(dashboard)/editor/page.tsx",
}

# hex จากยุค Phase gradient (ห้ามใช้เด็ดขาด — FAIL)
BANNED_HEX = {"#0057A8", "#1E88E5", "#42A5F5", "#6EE7B7"}

# emoji ที่ใช้งานได้จริง (ข้อมูล/ฟังก์ชัน) — ไม่ออก WARN
EMOJI_ALLOW = {
    0x2705,  # ✅ ผลสำเร็จ
    0x274C,  # ❌ ผลผิดพลาด
    0x2713,  # ✓ คัดลอก/บันทึกแล้ว
    0x2715,  # ✕ ปุ่มปิด
    0x1F947, 0x1F948, 0x1F949,  # 🥇🥈🥉 อันดับช่าง
}

# บริบทที่อนุญาตให้มี emoji ได้ (ข้อมูลที่ส่งจริงไป LINE / comment)
EMOJI_ALLOW_CONTEXT = re.compile(
    r'("icon":|icon:|title:|altText:|template|chatHistory|lines\.push\(|line_tpl_|sample:|{/\*|^\s*\*|^\s*//)'
)

# gradient ที่ได้รับอนุญาต (ลายตาราง engineering grid / hero navy ของ login)
GRADIENT_ALLOW = re.compile(r"(transparent 1px|#0B1F4B|--tp-navy-dark)")

# หน้า/บริบทที่ hex เป็นข้อมูลจริง (editor = ธีม, qr-sheet = print CSS)
HEX_ALLOW_FILE = {
    # หน้า theme/design editor — hex เป็นค่าข้อมูลที่ผู้ใช้ปรับแต่งจริง
    "frontend/app/(dashboard)/editor/page.tsx",
    "frontend/app/(dashboard)/settings/design/page.tsx",
    # LINE Flex JSON + header_color config — hex ต้องเป็นค่าจริงที่ส่งให้ LINE API
    "frontend/app/(dashboard)/settings/notifications/page.tsx",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

GRADIENT_RE = re.compile(r"bg-gradient-|linear-gradient\(|radial-gradient\(|var\(--cmms-gradient")
HEX_RE = re.compile(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b")
EMOJI_RE = re.compile(r"[\U0001F300-\U0001FAFF\u2600-\u27BF\uFE0F]")
ANDON_BADGE_RE = re.compile(r'variant="(error|warning|success)"')

def list_pages(diff_ref=None):
    """คืนรายการไฟล์ page.tsx ทั้งหมด (หรือเฉพาะที่เปลี่ยนเทียบ diff_ref)."""
    base = os.path.join(ROOT, "frontend", "app")
    all_pages = []
    for dirpath, _dirs, files in os.walk(base):
        if "node_modules" in dirpath or ".next" in dirpath:
            continue
        for fn in files:
            if fn == "page.tsx":
                rel = os.path.relpath(os.path.join(dirpath, fn), ROOT).replace("\\", "/")
                all_pages.append(rel)
    if not diff_ref:
        return sorted(all_pages)

    # diff เทียบ ref → เฉพาะไฟล์ที่เปลี่ยน
    try:
        out = subprocess.run(
            ["git", "diff", "--name-only", diff_ref, "--", "frontend/app"],
            cwd=ROOT, capture_output=True, text=True, timeout=20,
        )
        if out.returncode != 0:
            raise subprocess.CalledProcessError(out.returncode, out.args)
        changed = {l.strip().replace("\\", "/") for l in out.stdout.splitlines() if l.strip()}
    except Exception:
        # ref ไม่ valid (เช่น push แรก) → เทียบกับ HEAD~1
        out = subprocess.run(
            ["git", "diff", "--name-only", "HEAD~1", "--", "frontend/app"],
            cwd=ROOT, capture_output=True, text=True, timeout=20,
        )
        changed = {l.strip().replace("\\", "/") for l in out.stdout.splitlines() if l.strip()}
    return sorted(p for p in all_pages if p in changed)


def audit_file(rel):
    """ตรวจไฟล์เดียว → (issues, file_summary)."""
    path = os.path.join(ROOT, rel)
    with open(path, encoding="utf-8") as f:
        lines = f.read().splitlines()

    issues = []
    text = "\n".join(lines)

    # 1) Gradient (FAIL)
    for i, ln in enumerate(lines, 1):
        if GRADIENT_RE.search(ln) and not GRADIENT_ALLOW.search(ln):
            issues.append(("gradient", "FAIL", i, ln.strip()[:110]))

    # 2) Banned hex (FAIL)
    for i, ln in enumerate(lines, 1):
        for m in re.finditer(HEX_RE, ln):
            h = m.group(0).upper()
            if h in BANNED_HEX:
                issues.append(("banned-hex", "FAIL", i, ln.strip()[:110]))
                break

    # 3) Emoji (WARN)
    for i, ln in enumerate(lines, 1):
        for m in EMOJI_RE.finditer(ln):
            cp = ord(m.group())
            if cp in EMOJI_ALLOW:
                continue
            if EMOJI_ALLOW_CONTEXT.search(ln):
                continue
            issues.append(("emoji", "WARN", i, "U+%04X %s" % (cp, ln.strip()[:100])))

    # 4) Eyebrow (WARN)
    has_eyebrow = "cmms-eyebrow" in text
    if not has_eyebrow and rel not in EYEBROW_EXEMPT:
        issues.append(("eyebrow", "WARN", 0, "missing .cmms-eyebrow (หัวหน้าเพจ)"))

    # 5) Hex hardcode (WARN)
    if rel not in HEX_ALLOW_FILE:
        for i, ln in enumerate(lines, 1):
            # ช่วง var(--token, #fallback) — hex fallback ใน token ไม่ถือเป็น hardcode
            var_spans = [(m.start(), m.end()) for m in re.finditer(r"var\([^)]*\)", ln)]
            for m in re.finditer(HEX_RE, ln):
                h = m.group(0)
                if h.upper() in ("#FFFFFF",) or h.upper() in BANNED_HEX:
                    continue
                if any(s <= m.start() < e for s, e in var_spans):
                    continue
                # ข้าม hex ภายใน block <style> (print CSS เช่น qr-sheet)
                if "<style" in "\n".join(lines[max(0, i - 40):i]):
                    continue
                # ข้าม hex ที่เป็นตัวอย่างข้อความบอกผู้ใช้ (hint: "เช่น #0068B5")
                if re.search(r'hint: [\"\u201C].*#', ln):
                    continue
                issues.append(("hex", "WARN", i, "%s %s" % (h, ln.strip()[:100])))
                break  # 1 ต่อบรรทัดพอ

    # 6) Andon heuristic (WARN)
    n_badges = len(ANDON_BADGE_RE.findall(text))
    if n_badges > 0 and "cmms-status" not in text and "AndonLamp" not in text:
        issues.append(("andon", "WARN", 0, "%d Badge error/warning/success → ควรใช้ไฟ Andon" % n_badges))

    # 7) KPI (WARN)
    if "cmms-kpi-card" in text and "cmms-kpi-value" not in text:
        issues.append(("kpi", "WARN", 0, "cmms-kpi-card ไม่มี .cmms-kpi-value (ตัวเลข Barlow)"))

    summary = {
        "eyebrow": has_eyebrow,
        "lines": len(lines),
        "emoji": sum(1 for i in issues if i[0] == "emoji"),
        "hex": sum(1 for i in issues if i[0] == "hex"),
        "gradient": sum(1 for i in issues if i[0] == "gradient"),
        "banned_hex": sum(1 for i in issues if i[0] == "banned-hex"),
        "andon": sum(1 for i in issues if i[0] == "andon"),
        "kpi": sum(1 for i in issues if i[0] == "kpi"),
    }
    return issues, summary


def main():
    ap = argparse.ArgumentParser(description="CMMS-TPT design-guideline audit")
    ap.add_argument("--strict", action="store_true", help="WARN ทุกตัว = FAIL (ใช้ gate งานใหม่)")
    ap.add_argument("--diff", metavar="REF", help="ตรวจเฉพาะไฟล์ที่เปลี่ยนเทียบ REF (เช่น origin/main)")
    ap.add_argument("--json", action="store_true", help="output เป็น JSON")
    args = ap.parse_args()

    pages = list_pages(args.diff)
    all_issues = {}
    summaries = {}

    for rel in pages:
        issues, summary = audit_file(rel)
        all_issues[rel] = issues
        summaries[rel] = summary

    n_fail = sum(1 for iss in all_issues.values() for (_k, lv, _i, _t) in iss if lv == "FAIL")
    n_warn = sum(1 for iss in all_issues.values() for (_k, lv, _i, _t) in iss if lv == "WARN")
    fail_also = n_fail + (n_warn if args.strict else 0)
    status = "FAIL" if fail_also else "PASS"

    if args.json:
        print(json.dumps({
            "status": status,
            "strict": args.strict,
            "diff": args.diff,
            "pages": len(pages),
            "fail": n_fail,
            "warn": n_warn,
            "files": {k: [{"rule": r, "level": l, "line": i, "detail": t} for (r, l, i, t) in v]
                      for k, v in all_issues.items() if v},
        }, ensure_ascii=False, indent=2))
        sys.exit(0 if status == "PASS" else 1)

    print("=" * 78)
    print("CMMS-TPT Design Guideline Audit  (docs/EN/DESIGN-GUIDELINE.md)")
    print("=" * 78)
    print("pages scanned: %d%s" % (len(pages), "  (diff vs %s)" % args.diff if args.diff else ""))
    print("FAIL: %d   WARN: %d%s" % (n_fail, n_warn, "   [STRICT: WARN=fail]" if args.strict else ""))
    print("-" * 78)

    for rel in sorted(all_issues):
        iss = all_issues[rel]
        if not iss:
            continue
        s = summaries[rel]
        flag = "✗" if any(lv == "FAIL" for (_k, lv, _i, _t) in iss) else "·"
        print("\n%s %s  (eyebrow:%s emoji:%d hex:%d grad:%d andon:%d kpi:%d)" % (
            flag, rel, "✓" if s["eyebrow"] else "—",
            s["emoji"], s["hex"], s["gradient"], s["andon"], s["kpi"]))
        for rule, lv, i, detail in iss:
            print("   [%s] %-11s L%s  %s" % (lv, rule, i or "-", detail))

    print("-" * 78)
    print("RESULT: %s%s" % (status, "  (ลบ WARN ทั้งหมดให้เหลือ 0 เพื่อผ่าน --strict)" if status == "PASS" else ""))
    sys.exit(0 if status == "PASS" else 1)


if __name__ == "__main__":
    main()
