"use client";

/**
 * useCan — สิทธิ์ระดับ action ของผู้ใช้ปัจจุบัน สำหรับซ่อน/ปิดปุ่มใน UI
 *
 *   const can = useCan("spare_parts");
 *   {can("manage") && <Button>เพิ่มรายการ</Button>}
 *
 * ค่าเริ่มต้น = ยังไม่รู้สิทธิ์ → คืน false (fail-closed: ไม่โชว์ปุ่มที่อาจกดไม่ได้)
 * ผลลัพธ์ cache ต่อ module ต่อการโหลดหน้า จึงเรียกได้หลายที่โดยไม่ยิง API ซ้ำ
 */

import { useEffect, useState } from "react";

type CanMap = Record<string, boolean>;

const cache = new Map<string, CanMap>();
const inflight = new Map<string, Promise<CanMap | null>>();

function loadPerms(module: string): Promise<CanMap | null> {
    const cached = cache.get(module);
    if (cached) return Promise.resolve(cached);
    const existing = inflight.get(module);
    if (existing) return existing;

    const p = fetch(`/api/v1/my_permissions.php?module=${encodeURIComponent(module)}`, {
        credentials: "include",
    })
        .then((res) => (res.ok ? res.json() : null))
        .then((json: { actions?: CanMap } | null) => {
            const actions = json?.actions;
            if (!actions) return null;
            cache.set(module, actions);
            return actions;
        })
        .catch(() => null)
        .finally(() => {
            inflight.delete(module);
        });

    inflight.set(module, p);
    return p;
}

export function useCan(module: string): (action: string) => boolean {
    const [actions, setActions] = useState<CanMap>(() => cache.get(module) ?? {});

    useEffect(() => {
        let alive = true;
        const cached = cache.get(module);
        if (cached) {
            setActions(cached);
            return;
        }
        loadPerms(module).then((actions) => {
            if (alive && actions) setActions(actions);
        });
        return () => {
            alive = false;
        };
    }, [module]);

    return (action: string) => actions[action] === true;
}
