# Saved Views — Filter Contract & Initial Scope (Draft)

Status: draft design (ข้อ ข.) — ไม่ได้ implement ในรอบนี้

## Goals
- ให้ผู้ใช้บันทึก/เรียกใช้มุมมองการกรอง/เรียง/ค้นหาที่ใช้ซ้ำได้บนหน้ารายการ (list) โดยไม่ต้องตั้งค่าซ้ำทุกครั้ง
- ใช้สัญญา (contract) กลางร่วมกันระหว่าง UI, state ใน URL/local store, และ API query params เพื่อให้พฤติกรรมสม่ำเสมอและขยายหน้าอื่นได้ง่าย

## Non-goals (v1)
- ไม่ครอบคลุม dashboard/widget layout, ไม่แทนที่สิทธิ์การเข้าถึงข้อมูล, ไม่ทำ sharing ข้ามผู้ใช้/ข้ามบทบาทในเฟสแรก (เว้นแต่กำหนดเพิ่ม)
- ไม่บังคับให้ทุกหน้ารองรับทันที — เริ่มจากหน้าที่มี filter ใช้งานจริงและซ้ำบ่อย

## Filter Contract (proposed)

### 1) Canonical view model
```ts
type SavedView = {
  id: string;                 // server id หรือ local uuid (ตาม storage mode)
  name: string;               // ชื่อที่ผู้ใช้ตั้ง
  entity: string;             // เช่น "work_orders", "assets", "spare_parts"
  version: 1;                 // schema version ของ filter contract
  filters: Record<string, FilterValue>; // key → normalized value
  sort?: { key: string; dir: "asc" | "desc" } | null;
  search?: string | null;     // คำค้นข้อความอิสระ (ถ้าหน้ารองรับ)
  columns?: string[] | null;  // optional: คอลัมน์ที่แสดง (ถ้าหน้ารองรับ)
  isDefault?: boolean;        // default view ต่อ entity ต่อผู้ใช้ (v1: อย่างมาก 1 อัน)
  createdAt?: string;         // ISO8601
  updatedAt?: string;         // ISO8601
};

type FilterValue =
  | string
  | number
  | boolean
  | null
  | string[]                  // multi-select
  | { from?: string; to?: string } // date/range (ISO date/datetime ตาม field)
  | { op: "eq"|"neq"|"in"|"gt"|"gte"|"lt"|"lte"|"between"|"contains"; value: any };
```

**หลักการ:** เก็บค่าในรูป normalized (ไม่ผูกกับ component state ภายใน), key ของ `filters` ต้องตรงกับ `filter key` ที่ entity นั้นประกาศ (ดู registry ด้านล่าง). ค่า empty/undefined ไม่ต้องเก็บ.

### 2) Entity filter registry (ต่อหน้า/ต่อโดเมน)
แต่ละหน้ารายการที่รองรับ Saved Views ต้องประกาศ registry:
```ts
type FilterDef = {
  key: string;                // query/filter key กลาง
  type: "select"|"multi"|"text"|"date"|"dateRange"|"number"|"boolean";
  label: string;
  param?: string;             // ชื่อ query param ที่ส่ง API/URL (ถ้าต่างจาก key)
  optionsSource?: "static"|"api";
  serialize?: (v: FilterValue) => Record<string,string | string[]>; // view → URL/API
  deserialize?: (q: URLSearchParams) => FilterValue | undefined;   // URL/API → view
};
```
- UI render controls จาก registry; การ serialize/deserialize เป็นแหล่งความจริงเดียว (single source) เพื่อลด drift ระหว่าง URL, API call, และ saved view
- หน้า/ฟิลด์ที่ยังไม่พร้อมประกาศ registry = ยังไม่อยู่ในขอบเขต saved view ของหน้านั้น

### 3) State & precedence
- **URL เป็นแหล่งความจริงของหน้าจอปัจจุบัน**: โหลดหน้า/เปลี่ยน filter → อัปเดต query string (shareable, refresh-safe)
- โหลด saved view = apply ค่า view แล้วเขียนลง URL; ผู้ใช้แก้ filter ต่อ = “dirty” state (ยังไม่เขียนทับ view จนกด Save/Update)
- Precedence: URL params (explicit) > default saved view ของ entity > ค่าตั้งต้นของหน้า

### 4) Storage (v1 recommendation)
- **เฟสแรก (เร็ว/ลดความเสี่ยง):** per-user, per-entity ใน `localStorage` (key เช่น `cmms:savedViews:v1:<userId>:<entity>`) + export/import JSON ได้ในภายหลัง — ไม่ต้อง migration DB/API ก่อน
- **เฟสถัดไป (ถ้าต้อง sync ข้ามเครื่อง/แชร์):** ตาราง/API เช่น `user_saved_views` (user_id, entity, name, payload_json, is_default, timestamps) ผ่าน `/api/v1/*` ที่มี CSRF/authz ตามมาตรฐาน; payload ต้อง validate ตาม schema version
- ต้องมี migration path: อ่าน local → push ขึ้น server เมื่อเปิดใช้ server mode (opt-in)

### 5) API/query compatibility
- `serialize` ของ registry ต้องสร้าง query params ที่ endpoint ปัจจุบันรองรับอยู่แล้ว (ไม่เปลี่ยน semantics ของ API เดิม); ถ้า endpoint ยังไม่รองรับ filter ใด ให้ซ่อน/ไม่เปิดใน v1 ของหน้านั้น
- ห้าม retire `/api/v1/*` เดิม; เพิ่มพารามิเตอร์แบบ backward-compatible เท่านั้นเมื่อจำเป็น

## Initial Scope (proposed v1 pages)
เลือกหน้ารายการที่มี filter ชัดและใช้งานซ้ำบ่อย (ต้องยืนยัน filter keys จริงกับโค้ด/ API ก่อน implement):
1. **Work Orders / รายการงานซ่อม** (สถานะ, ประเภท, priority, ช่าง/ผู้รับผิดชอบ, ช่วงวัน, ค้นหา) — คุณค่าสูงสุด
2. **Assets / ทะเบียนทรัพย์สิน** (สถานะ, ประเภท/หมวด, location/พื้นที่, criticality, ค้นหา)
3. **Spare Parts / อะไหล่** (หมวด, สถานะสต็อก/ต่ำกว่าจุดสั่ง, location, ค้นหา)

ขยายเฟสถัดไป: PM/AM plans, Calibration due list, Inspections/Work requests ตาม usage จริง

## UX (v1 outline)
- Control บริเวณ filter bar: dropdown “มุมมองที่บันทึก” (รายการ + Default), ปุ่ม `บันทึกมุมมอง`, เมนู `บันทึกทับ/เปลี่ยนชื่อ/ตั้งเป็นค่าเริ่มต้น/ลบ` (confirm ก่อนลบ/เขียนทับ)
- แสดง badge/สถานะเมื่อ view ถูกแก้ไข (dirty) และปุ่ม reset กลับค่าหน้าปกติ
- ชื่อซ้ำใน entity เดียวกัน: เตือนหรือบังคับไม่ซ้ำ (v1 แนะนำไม่ซ้ำเพื่อกันสับสน)
- จำกัดจำนวน view ต่อ entity (เช่น 20) เพื่อกัน localStorage โต; แจ้งผู้ใช้เมื่อถึงขีด

## Implementation notes
- สร้าง helper กลางใน `frontend/lib/saved-views/` (types, registry types, serialize/deserialize utils, storage adapter interface: `local`/`server`) และ hook เช่น `useSavedViews(entity, registry)`
- แต่ละหน้าให้ registry + ผูกกับ filter state/URL ที่มีอยู่ (ไม่ refactor ใหญ่; incremental)
- Validate payload เวลาอ่าน (กันข้อมูลเก่า/เสียจาก localStorage หรือ schema bump) — ถ้า parse ไม่ได้ให้ข้ามและแจ้งเตือนเบา ๆ ไม่ crash หน้า
- i18n: label ชื่อเมนู/ปุ่มผ่านระบบข้อความที่มีอยู่; ชื่อ view เป็นข้อมูลผู้ใช้
- Accessibility: เมนู/ dialog ใช้ component ที่มีอยู่ (`Dropdown/Select`, `Dialog`, `Button`), focus trap/aria label ครบ

## Open questions / ต้องยืนยันก่อน implement
- เก็บ server-side ในเฟสแรกเลยหรือไม่ (ขึ้นกับความต้องการ sync ข้ามอุปกรณ์/เบราว์เซอร์)
- ต้องการแชร์ view ระหว่างผู้ใช้/บทบาทหรือไม่ (กระทบ permission และ schema)
- รายการ filter key/param ที่แน่นอนของแต่ละ entity (ต้องอ่านโค้ดหน้ารายการและ `/api/v1/*` ที่เกี่ยวข้องก่อนลงมือแต่ละหน้า)
- รูปแบบ date/range ที่ backend ของแต่ละ endpoint คาดหวัง (YYYY-MM-DD vs datetime) เพื่อกำหนด serializer ให้ตรง

