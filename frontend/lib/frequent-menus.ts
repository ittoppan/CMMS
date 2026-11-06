/**
 * frequent-menus.ts — เมนูที่ใช้บ่อยต่อผู้ใช้ (UX P5: /home "ใช้บ่อย" แถว 6–8 รายการ)
 *
 * หลักการ:
 *  - นับการเข้าหน้าจริงตอนกดเมนู (layout บันทึกทุกครั้งที่ pathname เปลี่ยน) ลง localStorage
 *  - ให้คะแนนถ่วงน้ำหนัก "เมื่อเร็ว ๆ นี้มากกว่าเก่า" (half-life 10 วัน)
 *  - resolve กลับเป็นเมนูของ NAV_GROUPS (href ไม่ตรงเป๊ะ เช่น /repair/view ให้เครดิตเมนูแม่ /repair)
 *  - กรองด้วย canShow (สิทธิ์เมนูของ role) — เมนูที่ไม่มีสิทธิ์ไม่ปรากฏเด็ดขาด
 *  - ถ้าประวัติยังน้อย/ยังว่าง → เติมด้วยรายการแนะนำ (DEFAULT_FREQUENT_HREFS) เรียงตามความต้องการใช้ทั่วไป
 */
import { NAV_GROUPS, type NavItemDef } from "@/components/dashboard/sidebar-nav";

const FREQ_KEY = "cmms_menu_freq_v1";
const MAX_TIMESTAMPS = 30; // เก็บ 30 ครั้งล่าสุดต่อเมนู
const HALF_LIFE_DAYS = 10;
/** landing หน้าที่เปิดทุกครั้ง = ไม่นับ (กันการกลายเป็น "เปิดหน้าแรกบ่อยสุด") */
const EXCLUDED_HREFS = new Set(["/home", "/dashboard", "/profile", "/login"]);

/** รายการแนะนำตอนยังไม่มีประวัติ — เรียงจากการใช้งานทั่วไปของโรงงาน */
const DEFAULT_FREQUENT_HREFS: string[] = [
  "/repair/request",
  "/repair/my_tasks",
  "/repair/tracking",
  "/repair",
  "/pm_am",
  "/inspections",
  "/spare_parts",
  "/planning",
  "/reports",
  "/analytics",
];

function loadStore(): Record<string, number[]> {
  try {
    const raw = localStorage.getItem(FREQ_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as Record<string, number[]>) : {};
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, number[]>) {
  try {
    localStorage.setItem(FREQ_KEY, JSON.stringify(store));
  } catch { /* เต็มเครื่อง/โหมดจำกัด — ข้าม */ }
}

/** map path → href เมนูที่ "ใกล้ที่สุด" (exact ก่อน แล้ว prefix ยาวสุด) — null ถ้าไม่เกี่ยวกับเมนู */
export function menuHrefForPath(pathname: string): string | null {
  const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (!p) return null;

  let best: string | null = null;
  let bestLen = 0;
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      if (p === it.href) return it.href;
      // path ใต้เมนู (เช่น /repair/view) ให้เครดิตเมนูแม่ เมื่อไม่มี exact
      if (p.startsWith(it.href + "/") && it.href.length > bestLen) {
        bestLen = it.href.length;
        best = it.href;
      }
    }
  }
  return best;
}

/** บันทึกการใช้งานหน้า (เรียกตอน pathname เปลี่ยนใน layout) */
export function recordMenuUsage(pathname: string) {
  if (typeof window === "undefined") return;
  const href = menuHrefForPath(pathname);
  if (!href || EXCLUDED_HREFS.has(href)) return;
  const store = loadStore();
  const list = [...(store[href] || []), Date.now()].slice(-MAX_TIMESTAMPS);
  store[href] = list;
  saveStore(store);
}

/** href → เมนูแรกที่ตรง (รวม secondary — ผู้ใช้จริงอาจใช้ secondary บ่อย) */
function itemForHref(href: string): NavItemDef | null {
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      if (it.href === href) return it;
    }
  }
  return null;
}

function scoreOf(store: Record<string, number[]>, href: string): number {
  const list = store[href];
  if (!list || list.length === 0) return 0;
  const now = Date.now();
  return list.reduce((acc, ts) => {
    const ageDays = Math.max(0, (now - ts) / 86_400_000);
    return acc + Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
  }, 0);
}

/**
 * คำนวณเมนู "ใช้บ่อย" n รายการ:
 *  1) เรียงตามคะแนน (ระดับ 90 วันล่าสุด) desc — กรอง canShow ทิ้งตัวที่ไม่มีสิทธิ์
 *  2) เหลือช่องเติมจาก DEFAULT_FREQUENT_HREFS (กรอง canShow + ไม่ซ้ำ)
 */
export function getFrequentMenuItems(
  n: number,
  canShow: (perm: string) => boolean
): NavItemDef[] {
  if (typeof window === "undefined") return [];
  const store = loadStore();

  const scored = Object.keys(store)
    .map((href) => ({ href, score: scoreOf(store, href) }))
    .filter((s) => s.score > 0.01)
    .sort((a, b) => b.score - a.score);

  const out: NavItemDef[] = [];
  const used = new Set<string>();

  for (const { href } of scored) {
    const it = itemForHref(href);
    if (!it || used.has(it.href) || !canShow(it.perm)) continue;
    out.push(it);
    used.add(it.href);
    if (out.length >= n) return out;
  }

  for (const href of DEFAULT_FREQUENT_HREFS) {
    if (out.length >= n) break;
    const it = itemForHref(href);
    if (!it || used.has(it.href) || !canShow(it.perm)) continue;
    out.push(it);
    used.add(it.href);
  }
  return out;
}
