"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * useMenuPermission — สิทธิ์เมนู PWA ตามบทบาท (role-based) + ข้อมูลผู้ใช้
 *
 * - อ่าน role ของผู้ใช้จาก localStorage (LiffBridge เก็บไว้เมื่อเปิดจาก LINE)
 * - fetch /api/v1/menu_permissions.php เพื่อขอ permission ของบทบาทนั้น
 * - คืน canShow(menuKey) ใช้ filter เมนูใน Sidebar
 * - คืน avatar ผู้ใช้เพื่อแสดงรูปโปรไฟล์ (หลีกเลี่ยง fetch ซ้ำหน้า layout)
 *
 * fallback: ไม่รู้ role / โหลดไม่สำเร็จ -> เห็นเมนูทั้งหมด (ปลอดภัย ไม่กวนฟีเจอร์เดิม)
 */
export function useMenuPermission() {
  const router = useRouter();
  const [canShowAll, setCanShowAll] = useState(true); // fallback: เห็นหมด
  const [permission, setPermission] = useState<Record<string, number> | null>(null);
  const [roleName, setRoleName] = useState<string>("");
  const [userFullName, setUserFullName] = useState<string>("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [loading, setLoading] = useState(true);
  // ปุ่มล่างมือถือของบทบาท (เรียงลำดับแล้วจาก API) — ว่าง = ใช้ preset ใน layout
  const [bottomNavKeys, setBottomNavKeys] = useState<string[]>([]);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    // 1) หา role ของผู้ใช้ปัจจุบัน
    let roleId = "";
    let uid = "";
    try {
      uid = localStorage.getItem("cmms_line_user_id") || "";
      roleId = localStorage.getItem("cmms_line_role_id") || "";
    } catch { /* ignore */ }

    let url = "/api/v1/menu_permissions.php?";
    if (uid) {
      url += `line_user_id=${encodeURIComponent(uid)}`;
    } else if (roleId) {
      url += `role_id=${encodeURIComponent(roleId)}`;
    } else {
      // ไม่มีข้อมูล LINE -> ใช้ session (ผู้ดูแลระบบเห็นหมด)
      url += "user=1";
    }

    let res = await fetch(url);

    // ถ้า uid ไม่มีใน DB (เช่น ยังไม่ผูก / จำลอง) -> ลอง role_id ที่เก็บไว้ก่อน fallback
    if (!res.ok && roleId) {
      url = `/api/v1/menu_permissions.php?role_id=${encodeURIComponent(roleId)}`;
      res = await fetch(url);
    }
    // auth guard: session หมดอายุ (401) -> กลับเข้า /login
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (!mountedRef.current) return;

    if (json?.permission) {
      setPermission(json.permission);
      setCanShowAll(false);
      setRoleName(json?.user?.role_name || "");
      setUserFullName(json?.user?.full_name || "");
      setSimulated(Boolean(json?.user?.simulated));
      if (Array.isArray(json?.bottom_nav)) setBottomNavKeys(json.bottom_nav);

      const rawAvatar = json?.user?.avatar || json?.user?.avatar_path || "";
      let normalizedAvatar: string | null = null;
      if (rawAvatar) {
        const cleaned = String(rawAvatar).replace(/\\/g, "/");
        normalizedAvatar = cleaned.startsWith("data:") || cleaned.startsWith("/")
          ? cleaned
          : "/" + cleaned;
      }
      setAvatar(normalizedAvatar);

      // บังคับเปลี่ยนรหัสผ่าน (ไม่รวมบทบาทจำลอง)
      if (json?.user?.must_change_password && !json?.user?.simulated) {
        router.replace("/change-password");
        return;
      }
    }
  }, [router]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    load()
      .catch((e) => {
        console.warn("menu permission fallback -> show all:", e);
        if (mountedRef.current) setCanShowAll(true);
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    return () => { mountedRef.current = false; };
  }, [load]);

  const canShow = (menuKey: string): boolean => {
    if (canShowAll || !permission) return true;
    return permission[menuKey] !== 0; // default (ไม่มี key) = เห็น
  };

  return { canShow, roleName, userFullName, avatar, simulated, loading, bottomNavKeys, refresh: load };
}
