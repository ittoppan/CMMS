/**
 * route-perms.ts — แผนที่ path → สิทธิ์เมนู (UX P4: route-level 403 guard)
 *
 * derive จาก NAV_GROUPS (sidebar) จุดเดียว — ไม่ซ่อมแซมด้วยมือ:
 *  1) exact map:   href ของทุกเมนู → รายการ perm ของ href นั้น
 *  2) prefix map:  pathPrefixes ของกลุ่ม → รวม perm ทั้งกลุ่ม (ใช้กับหน้าลึก เช่น /repair/view?id=1)
 *
 * นโยบาย "กันด้วยความระมัดระวัง" (fail-open):
 *  - path ที่ไม่รู้จัก (ไม่ตรง exact และไม่อยู่ใต้ pathPrefixes ใด) → null = ไม่กั้น
 *  - กั้นเมื่อ permission โหลดแล้วและ perm ที่ต้องใช้ "ทุกตัว" ถูกปิดชัดเจน (=== 0)
 *    (key ที่ไม่มีใน map = ไม่ระบุ = อนุญาต ตามพฤติกรรม canShow เดิม)
 */
import { NAV_GROUPS } from "@/components/dashboard/sidebar-nav";

export interface RequiredPerms {
  /** perm keys ที่ต้องมี "ตัวใดตัวหนึ่ง" จึงผ่าน */
  perms: string[];
  /** true = แมปตรงกับ href เมนูพอดี / false = จาก pathPrefixes ของกลุ่ม */
  exact: boolean;
}

const norm = (p: string) => {
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p;
};

const EXACT_MAP = new Map<string, string[]>();
const PREFIX_MAP = new Map<string, string[]>(); // prefix → union perms ทั้งกลุ่ม

for (const group of NAV_GROUPS) {
  const groupPerms = [...new Set(group.items.map((it) => it.perm))];
  for (const it of group.items) {
    const list = EXACT_MAP.get(norm(it.href));
    if (list) {
      if (!list.includes(it.perm)) list.push(it.perm);
    } else {
      EXACT_MAP.set(norm(it.href), [it.perm]);
    }
  }
  for (const pre of group.pathPrefixes) {
    const key = norm(pre);
    const cur = PREFIX_MAP.get(key);
    if (!cur) PREFIX_MAP.set(key, [...groupPerms]);
    else for (const p of groupPerms) if (!cur.includes(p)) cur.push(p);
  }
}

/**
 * หา perm ที่ path นี้ต้องใช้ — คืน null ถ้าไม่ควรกั้น (path ไม่รู้จัก)
 * แมป exact ก่อน (ยาวสุดชนะ) แล้วค่อย prefix (ยาวสุดชนะ)
 */
export function requiredPermsFor(pathname: string): RequiredPerms | null {
  const p = norm(pathname || "/");
  const exact = EXACT_MAP.get(p);
  if (exact) return { perms: exact, exact: true };

  let best: string[] | null = null;
  let bestLen = 0;
  for (const [pre, perms] of PREFIX_MAP) {
    // path ต้องอยู่ "ใต้" prefix: เท่ากันพอดีหรือตามด้วย "/"
    if (p === pre || p.startsWith(pre + "/")) {
      if (pre.length > bestLen) {
        bestLen = pre.length;
        best = perms;
      }
    }
  }
  return best ? { perms: best, exact: false } : null;
}

/**
 * ตัดสินว่า path ถูกกั้นไหม — เรียกได้ทั้งก่อน/หลัง permission โหลด
 * - permission === null (ยังโหลด / โหลดพลาด) → อนุญาต (fail-open ตามฟีเดอร์เดิม)
 * - กั้นเฉพาะเมื่อ perm ที่ต้องใช้ "ทุกตัว" เป็น 0 ชัดเจน
 */
export function routeIsBlocked(
  pathname: string,
  permission: Record<string, number> | null
): boolean {
  if (!permission) return false;
  const req = requiredPermsFor(pathname);
  if (!req) return false;
  return req.perms.every((key) => permission[key] === 0);
}
