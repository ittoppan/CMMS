# PWA OFFLINE + SYNC — CMMS-TPT (Phase 19)

> วันที่: 2026-09-16 · ภาพรวม:

```
เบราว์เซอร์ (ออนไลน์)                     ฝั่ง server
┌──────────────────────────┐         ┌───────────────────────┐
│ UI (Next.js)             │  fetch  │ PHP REST API (IIS :8081)│
│   ↓ ล้มเหลว/offline       │ ──────► │  idempotency_guard()   │
│ SyncEngine (IndexedDB)    │  X-Client-Action-Id            │
│   queue → retry → replay  │ ◄─────  │  X-Idempotent-Replay   │
│  Dead simple + conflicts  │  409    │  409 CONFLICT          │
└──────────────────────────┘         └───────────────────────┘
```

โครงสร้างใหม่ทั้งหมดของ Phase 19 อยู่ที่ `frontend/lib/offline/*` —
โดน pipeline เดิม (Service Worker `frontend/public/sw.js`, queue ร่างเก่า)
เหลือเป็นเปลือกดึงข้อมูลจาก engine ใหม่

---

## 1. องค์ประกอบหลัก

| ไฟล์ | หน้าที่ |
|---|---|
| `frontend/lib/offline/idb.ts` | wrapper IndexedDB — DB **`cmms-sync`** v1, stores: `queue`, `cache`, `attachments`, `meta` |
| `frontend/lib/offline/types.ts` | types: `SyncQueueItem`, `SyncRunResult`, `SyncStats`, `OfflineAttachmentRecord`, `NetStateType` |
| `frontend/lib/offline/engine.ts` | **SyncEngine** singleton — ใจกลาง: enqueue/retry/drain/deps/single-flight |
| `frontend/lib/offline/connectivity.tsx` | `ConnectivityProvider`, `useConnectivity`, `usePendingQueueCount` — สถานะออนไลน์ + badge |
| `frontend/lib/offline/photo.ts` | เตรียมภาพ 1280px @0.72 (compression) + ตรวจงบพื้นที่ก่อนบันทึก offline |
| `frontend/lib/offlineQueue.ts` | **bridge** — API เก่า (`enqueue/flushQueue/sendOrEnqueue/pendingCount`) ย้ายถิ่นมาที่ engine + drain localStorage v1 |
| `frontend/app/(dashboard)/sync-center/page.tsx` | **Sync Center** — ดูคิว, retry/ลบ, สถิติ sync, งบพื้นที่ |
| `frontend/components/ConnectivityStatus.tsx` | chip บน topbar (desktop) + icon (mobile) |

สถานะที่ branch ครอบคลุม (ไอคอนหน้า ConnectivityStatus):
- `online` — พร้อม (+ badge จำนวนคิวถ้ามี)
- `offline` — ขาดการเชื่อมต่อ → ทำงานต่อในคิว
- `syncing` — กำลังดันคิว (`cmms:sync-changed`)
- `conflict` — มีรายการชน ต้องจัดการใน Sync Center
- `queued` — จำนวนงานรอซิงก์

---

## 2. SyncEngine ทำงานยังไง

### 2.1 Queue item
```ts
type SyncQueueItem = {
  client_action_id: string;      // idempotency key (makeId → `action_<...>`)
  entity_type: string;           // e.g. "repair_spare_usage"
  entity_id?: string | number;   // จาก `id=` ใน URL (ถ้ามี)
  kind: string;                  // สี label บน UI
  url: string;                   // /api/... (relative, POST/PUT)
  body: Record<string, unknown>;
  status: "pending" | "processing" | "success" | "failed" | "conflict";
  attempts: number;              // retry counter (MAX_RETRIES=3)
  base_updated_at?: string;      // -s 409 → CONFLICT
  createdAt: number; priority: number;
  lastTryAt?: number; lastError?: string; resolvedAt?: string;
};
```

### 2.2 ส่งยังไง
1. **deps มาก่อน**: items ที่มี `entity_id` จะส่งทีหลัง item แม่ (ค่า
   `priority` ตามลำดับ) — เช่น spare ที่อ้าง WO จะรอให้ WO สร้างเสร็จก่อน
2. ส่งพร้อม `X-Client-Action-Id` + `X-CSRF-Token` (จาก `lib/api.ts`)
3. ผล:
   - 200 → `success` ตัดออกจากคิว (purge ของสำเร็จ 7 วัน)
   - `425 TOO_EARLY` (การประมวลผลก่อนหน้า) → retry เร็ว
   - **409 CONFLICT** → `conflict` หยุด retry อัตโนมัติ เหลือคนจัดการ
   - 4xx อื่น → `failed` ไม่ retry
   - network/5xx → retry schedule 8s → 20s → 45s (3 ครั้ง)
4. `single-flight`: ซิงก์พร้อมกันไม่ได้ (`busy=true`) — ครั้งถัดไปถูกคิว

### 2.3 เหตุการณ์ (window events)
| event | ความหมาย |
|---|---|
| `cmms:sync-changed` | queue/flags เปลี่ยน — สถานะ + Sync Center รีเฟรช |
| `cmms:offline-queued` | มีรายการใหม่เข้า queue (badge bottom nav) |
| `window.ononline` / probe | engine.drain() ปล่อยคิวเมื่อเชื่อมต่อกลับ |

---

## 3. Connectivity states

`connectivity.tsx` — probe `GET /api/v1/csrf.php` ทุก 10 วินาที:

```
ONLINE ──(fetch ล้มเหลว)──► OFFLINE ──(probing ok)──► RECONNECTING ──► ONLINE
   ▲                          │                          │
   └───────────  window.ononline/drain ────────────────────┘
```

- ใช้ `offlineQueueCount()` (รวม legacy + engine) แสดง badge
- แม้ `online` แต่มี queue ค้าง → ยัง show badge ให้ user press "sync now"
- ใน Sync Center: ปุ่ม Refresh ตอน offline จะจบที่ error หน้าตาเดียวกัน

---

## 4. Offline บันทึกภาพ + อะไหล่

- `photo.ts`: `preparePhoto()` ลดภาพ (1280px, 0.72) → blob → DB `attachments`
- งบพื้นที่: `ATTACHMENT_MAX_BYTES = 120MB`, `ATTACHMENT_MAX_ITEMS = 60`
  (นับเฉพาะ blob รอซิงก์; ภาพที่อัปแล้วลบจากคิว)
- `makeClientActionId()` — สร้าง id ก่อน upload → ผูกกับ queue item
  (idempotent upload, retry ไม่ทำซ้ำ)
- `addSagePart()` บนหน้า view: offline ล้ม → `sendOrEnqueue(...)` เข้า engine

---

## 5. Sync Center UI (`/sync-center`)

ส่วนที่คนใช้เห็น: สถานะออนไลน์, จำนวนงานรอ/สำเร็จ/ล้มเหลว/ชน, ปุ่ม
**Sync now / Retry ทั้งหมด / ล้างรายการที่สำเร็จ**, ตารางคิว (kind, url,
status, attempts, lastError, แก้ไข conflict), สถิติ storage ของ attachments
- เปิดใช้กับผู้ใช้ทุกระดับ (หน้าไม่จำกัดสิทธิ์เมนู — เข้าผ่าน chip สถานะ)

---

## 6. Service Worker & caching

`frontend/public/sw.js` (v37):
- **network-first** สำหรับทุก navigation; offline routes (network-first +
  cache) ครอบหน้า: `/repair/request`, `/repair/my_tasks`, `/repair/view`,
  `/pm_am/checksheet`, **`/sync-center`**
- `API_CACHE` cache GET /api/* (network-first, 30 นาที) — ใช้เมื่อ offline
  เพื่อโหลดข้อมูลที่โหลดไปแล้ว (หน้าออฟไลน์ของช่าง)
- **ข้อควรรู้เรื่องความเป็นส่วนตัว**: ข้อมูลวันทำงานซ่อมอาจถูก cache ใน
  IndexedDB ของเบราว์เซอร์ช่าง (เงื่อนไขของฟีเจอร์ offline ให้ทำงานจริง)
  — ออกจากระบบไม่ได้ล้าง IndexedDB อัตโนมัติ ผู้ดูแลควรแจ้งพนักงาน
- เขียนใหม่ถูกตีขึ้นเองทุก build; อย่าแก้ `server.js` ตรง ๆ — แก้ที่
  `frontend/src` + `frontend/public/sw.js`

---

## 7. Idempotency / conflict (สรุปสั้น)

ดูรายละเอียดเต็มใน `docs/API_CONTRACT.md` §12 (idempotency) + §13
(repair_attachment GET)

| กรณี | พฤติกรรม |
|---|---|
| ส่งซ้ำ idempotency key เดียวกัน | replay response เดิม (200 + `X-Idempotent-Replay: 1`) |
| คลิกซ้ำขณะกำลังประมวลผล | 425 `TOO_EARLY` (client retry เร็ว) |
| แก้ข้อมูลที่ `updated_at` เก่ากว่า server | 409 `CONFLICT` → item ไปขึ้น Sync Center |
| อัปโหลดรูปซ้ำ | dedupe ด้วย content hash + idempotency key |

---

## 8. ความปลอดภัย (สรุป)

- คิวของช่าง เก็บข้อมูล **เฉพาะงานที่ตนเองได้รับ** — API ตรวจสิทธิ์
  (assigned tech / supervisor) ฝั่ง server อีกชั้น (เช็ค `repair_attachment` GET)
- ทุก POST/PUT ที่เข้ามาจากคิวต้องผ่าน `enforceCsrf()` + login;
  idempotency key ตรวจเป็น UUID/`action_` เท่านั้น (ไม่เข้า SQL ตรง ๆ)
- ไม่มี secret ใน frontend; token ทั้งหมดใน `.env`
- `scripts/phase19_sync_check.php` — smoke test 15/15 (idempotency, replay,
  conflict 409, attachment dedupe, cleanup)

---

## 9. การทดสอบ (Phase 19)

| layer | เครื่องมือ | สิ่งที่ตรวจ |
|---|---|---|
| backend | `php scripts/phase19_sync_check.php` | WO create idempotency, spare add dedupe, 409 conflict, attachment dedupe, GET list, cleanup |
| frontend | `npm run typecheck` / `npm run build` | ผ่าน tsc/build |
| unit | `scripts/design-audit.py --diff --strict` | design token ไม่ regress |
| e2e | Playwright spec (sync-center page load ตรวจสถานะ) | เปิดหน้าได้ + จับสถานะ online |
| security | `php scripts/security_check.php` | 0 failed |