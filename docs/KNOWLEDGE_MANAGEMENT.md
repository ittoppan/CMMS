# KNOWLEDGE MANAGEMENT — CMMS Knowledge Center (Phase 38)

> คู่มือฉบับนี้อธิบาย **ศูนย์ความรู้ (Knowledge Center)** ซึ่งเป็นชั้นงานความรู้ที่วางอยู่ **เหนือ** ระบบควบคุมเอกสาร (Phase 32)
> เอกสารต้นฉบับถาวรอยู่ที่ `docs/DOCUMENT_CONTROL.md` — กฎของ Phase 32 ไม่ถูกแก้หรือลบโดย Phase 38 นี้

---

## 1) หลักการสูงสุด (Design Contract)

1. **Additive เท่านั้น** — Phase 38 เพิ่มตารางใหม่ ไม่แก้ตารางธุรกรรมเดิม ไม่เขียนทับ `controlled_documents`, `document_revision`, `approval_workflow`, `document_acknowledgement`
2. **เอกสารควบคุมยังเป็นเจ้าของเอกสารฉบับจริง** — บทความความรู้เป็น “คำอธิบาย/คำแนะนำ” ไม่ใช่เอกสารที่ออกเลขที่ควบคุม
3. **ความสัมพันธ์คือการอ้างอิงที่ตรวจสอบได้ (validated reference)** — `knowledge_relation` และ `knowledge_document_ref` ตรวจสอบว่าเป้าหมายมีอยู่จริงก่อนบันทึก ไม่เคยแก้หรือลบต้นทาง
4. **สิ่งที่เผยแพร่แล้วเปลี่ยนย้อนหลังไม่ได้** — แก้ไขโดยสร้างเวอร์ชันใหม่ (`article_new_version`) และเก็บประวัติทุกเวอร์ชัน
5. **ไม่มีการกุข้อมูล** — ตัวเลขทุกตัวมาจาก event จริง (`knowledge_usage`, `knowledge_search_log`) ถ้าไม่มีข้อมูลต้องขึ้นว่า “ยังไม่มีข้อมูล” ห้ามแสดง 0% หรือ 0 ทั้งที่ยังไม่ได้วัด
6. **เอกสารควบคุมที่เลิกใช้งานแล้วต้องไม่ถูกเอาอ้างต่อ** — `knowledge_document_ref.is_stale` ถูก flag แบบ read-only ให้ผู้ใช้งานเห็นและไปแก้ที่ต้นทาง

---

## 2) ขอบเขตฟีเจอร์

| ฟีเจอร์ | ทำอะไร | หน้าจอ |
|---|---|---|
| Knowledge Overview | KPI จริง + สถานะฟีเจอร์ + ทางลัด | `/knowledge` |
| Search & Discovery | ค้นหาความรู้/เอกสาร/คู่มือ พร้อม log การค้นและ click | `/knowledge/search` |
| Article Lifecycle | สร้าง–แก้–ส่งตรวจ–อนุมัติ–เผยแพร่–ทำเวอร์ชันใหม่–เก็บถาวร | `/knowledge/articles` |
| Knowledge Gaps | ช่องว่างความรู้จากคำค้นที่ไม่มีคำตอบ + ปิดช่องว่างด้วยบทความ | `/knowledge/gaps` |
| Scheduled Reviews | รอบทบทวนความรู้ (scheduled / incident / user report) | `/knowledge/reviews` |
| Taxonomy & Settings | หมวดหมู่ (ลำดับชั้น) และแท็ก + ค่าระบบ | `/knowledge/taxonomy` |
| Usage Analytics | เหตุการณ์ใช้งานจริง + ผลตอบรับ + ส่งออก CSV | `/knowledge/usage` |

---

## 3) Lifecycle ของบทความ

```
draft ──submit──▶ in_review ──approve──▶ approved ──publish──▶ published ──new version──▶ (เวอร์ชันใหม่ draft)
  ▲                   │                                          │
  └──── send_back ────┘                                          ├── supersede ──▶ superseded
                                                              └── archive ────▶ archived
```

- `draft` แก้ได้ทุกอย่าง
- `in_review` — ผู้ส่งตรวจแก้เนื้อหาไม่ได้ (ต้อง `send_back` ก่อน)
- `approved` — อนุมัติแล้ว แก้เนื้อหาไม่ได้จนกว่าจะสร้างเวอร์ชันใหม่
- `published` — เป็นเวอร์ชันที่ผู้ใช้เห็น มีเงื่อนไขก่อนเผยแพร่ตาม settings (ดูหัวข้อ 8)
- `superseded` / `archived` — ปิดการใช้งาน แต่ยังคงอยู่ในประวัติและยังถูกนับในสถิติ
- **ผู้เขียนห้ามอนุมัติงานของตนเอง** (author ≠ approver) — บังคับที่ server ไม่ใช่แค่ซ่อนปุ่มใน UI

---

## 4) โมเดลข้อมูล

ตารางทั้งหมด 12 ตาราง (ดูรายละเอียดคอลัมน์ใน `docs/PHASE_38_REPORT.md` หัวข้อ 4):

| ตาราง | หน้าที่ |
|---|---|
| `knowledge_category` | หมวดหมู่แบบลำดับชั้น (`parent_id`), เปิด/ปิด, ลำดับแสดงผล |
| `knowledge_article` | บทความ 1 แถว = 1 เวอร์ชัน (immutable เมื่อ published) |
| `knowledge_published_guard` | บังคับ “มี published ได้เพียงเวอร์ชันเดียวต่อ `article_key`” ผ่าน trigger |
| `knowledge_tag` / `knowledge_article_tag` | แท็กและการผูกแท็กกับบทความ |
| `knowledge_relation` | ความสัมพันธ์ระหว่างบทความ/ทรัพยากร (ตรวจสอบเป้าหมายก่อนบันทึก) |
| `knowledge_document_ref` | อ้างอิงเอกสารควบคุม Phase 32 + ธง `is_stale` |
| `knowledge_usage` | event ต่อการใช้งานจริง (view/print/feedback ฯลฯ) |
| `knowledge_search_log` | log การค้นหา + คลิกเข้าถึง → ต้นทางของ Knowledge Gap |
| `knowledge_gap` | ช่องว่างความรู้ (คำค้นที่ไม่มีคำตอบ) + สถานะ/ความสำคัญ |
| `knowledge_review` | รอบทบทวนความรู้ + ผลลัพธ์ |
| `knowledge_activity` | audit log แบบ append-only ทุกการเปลี่ยนสถานะ |

---

## 5) การเชื่อมโยงกับ Document Control (Phase 32)

ชนิดการอ้างอิงเอกสาร (`implements`, `governs`, `summarises`, `evidenced_by`, `supersedes`, `reference`):

- **ต้นทางเดียว (one-way)** — Phase 38 เขียนแค่ฝั่ง Knowledge
- **ตรวจสอบก่อนเสมอ** — อ้าง doc/revision ที่ไม่มีจริงจะถูกปฏิเสธ
- **ตรวจสอบความทันสมัย** — `knowledge_auto_check_document_stale` เปิดไว้เพื่อ flag เอกสารที่ถูก supersede/withdraw
- **ห้ามแก้เอกสารต้นทาง** — ถ้าเอกสารเปลี่ยน ให้แก้ที่ Phase 32 แล้วรอสแกนรอบถัดไป

ถ้าต้องการเอกสารฉบับที่ควบคุมจริง → ใช้ Document Control (`/documents`) ไม่ใช่หน้า Knowledge

---

## 6) Knowledge Gap = งานจริงจากพฤติกรรมผู้ใช้

- `knowledge_auto_create_gap` เปิดไว้: คำค้นที่ตั้งค่า `kn_gap_min_occurrences` ครั้งใน `kn_gap_window_days` จะเปิด gap ให้อัตโนมัติ (นับจาก `knowledge_search_log` จริง)
- คำค้นที่ไม่มีคำตอบถูกระบุว่า “ไม่มีคำตอบ” ไม่ใช่เดาคำตอบที่ไม่มี
- ปิดช่องว่างได้ด้วยการ **ผูก gap เข้ากับบทความที่สร้างขึ้นจริง** (`resolved_article_id`) — ปิดแล้ว gap เปลี่ยนเป็น `resolved` และนับผลได้
- สถานะ: `open → triaged → in_progress → resolved | rejected`

---

## 7) รอบทบทวนความรู้ (Review)

- ตั้งรอบได้ 5 trigger: `scheduled`, `incident`, `major_revision`, `user_report`, `manual`
- `knowledge_review_default_days` เป็นค่าเริ่มต้น, `knowledge_review_overdue_warn_days` ใช้ติดสีเตือน
- ผลลัพธ์: `approved`, `needs_revision`, `rejected` (ต้องใส่ findings เมื่อไม่ผ่าน)
- `needs_revision` ทำให้บทความกลับเข้าสู่รอบแก้ไขเพื่อสร้างเวอร์ชันใหม่

---

## 8) ค่าระบบ (settings group `knowledge`)

ค่าสำคัญ (ครบทั้งหมดใน `scripts/apply_phase38_knowledge.php`):

| ค่า | ความหมาย |
|---|---|
| `knowledge_enabled` | ปิด/เปิดศูนย์ความรู้ทั้งระบบ |
| `knowledge_publish_requires_approved` | เผยแพร่ต้องผ่านการอนุมัติก่อน |
| `knowledge_publish_requires_category` | ต้องมีหมวดหมู่ก่อนเผยแพร่ |
| `knowledge_publish_requires_relation` | ต้องมีความสัมพันธ์/เอกสารอ้างอิงอย่างน้อย 1 รายการ |
| `knowledge_publish_requires_review_record` | ต้องมีบันทึกรอบทบทวน |
| `knowledge_privileged_roles` | role ที่เห็น draft/superseded ได้ (ค่าเริ่มต้น `1,2,6`) |
| `knowledge_search_include_documents` / `_manuals` | รวมเอกสาร Phase 32 / คู่มือเข้าผลค้นหา |
| `knowledge_usage_log_enabled`, `knowledge_search_log_enabled` | เปิด/ปิดการเก็บ log |
| `knowledge_usage_retention_days`, `knowledge_search_log_retention_days` | ระยะเก็บข้อมูลดิบ |
| `knowledge_auto_create_gap`, `knowledge_gap_min_occurrences`, `knowledge_gap_window_days` | เกณฑ์เปิดช่องว่างอัตโนมัติ |
| `knowledge_auto_check_document_stale` | ตรวจธงเอกสารต้นทางล่าสุด |
| `knowledge_max_results`, `knowledge_page_default_size`, `knowledge_export_row_limit` | เพดานผลลัพธ์/หน้า/ไฟล์ส่งออก |

---

## 9) สิทธิ์ (RBAC)

สิทธิ์ราย action ของ Knowledge: `read`, `search`, `create`, `edit`, `submit`, `review`, `approve`, `publish`, `archive`, `manage_gap`, `manage_review`, `manage_taxonomy`, `view_usage`, `export`

ข้อบังคับเพิ่มเติมนอกเหนือจาก RBAC:
- ผู้ใช้ทั่วไปเห็นเฉพาะ `published` ที่ไม่ `restricted/confidential`
- ผู้ใช้ที่เป็นเจ้าของเวอร์ชันที่ยังไม่เผยแพร่เห็นของตัวเอง
- role ใน `knowledge_privileged_roles` เห็นทุกสถานะ
- การจำกัดสิทธิ์ถูกบังคับที่ SQL (visibility clause) — ไม่พึ่งการซ่อนข้อมูลฝั่ง UI

---

## 10) การใช้งานทั่วไป

1. **เขียนบทความ**: `/knowledge/articles/create` → ใส่หัวข้อ เนื้อหา ขั้นตอน หมวดหมู่ แท็ก
2. **ผูกบริบท**: เพิ่มความสัมพันธ์ (เครื่องจักร/งานซ่อม/ฯลฯ) และอ้างอิงเอกสารควบคุม
3. **ส่งตรวจ**: ผู้อนุมัติ (ไม่ใช่ผู้เขียน) อนุมัติ
4. **เผยแพร่**: ผู้มีสิทธิ์ publish เผยแพร่ — ระบบบังคับเงื่อนไขก่อนเผยแพร่ให้ผ่าน
5. **เก็บข้อมูลผลตอบรับ**: ผู้ใช้กด helpful / not helpful / no answer ที่หน้าบทความ → ขึ้น Usage & Feedback
6. **ทบทวนตามรอบ**: `/knowledge/reviews` เห็นรายการที่ครบกำหนดและเกินกำหนด
7. **ปิดช่องว่าง**: คำค้นที่ไม่มีคำตอบสะสม → สร้างบทความ → ปิด gap ด้วยบทความนั้น

---

## 11) การทำงานกับระบบอื่น

| ระบบ | ความสัมพันธ์ |
|---|---|
| Document Control (Phase 32) | ต้นทางเอกสารที่ควบคุม — Knowledge อ้างอิงทางเดียว |
| Knowledge = additive ชั้นบน | ไม่แทนที่ระบบใด |
| Search | รวมผลจาก Knowledge + เอกสาร + คู่มือ แต่แยกป้ายกำกับทุกชนิด |
| Notifications | เหตุการณ์ review ครบกำหนดรายงานผ่านระบบแจ้งเตือนเดิม |
| Usage/Analytics | event ดิบอยู่ในตาราง Knowledge ไม่ปนกับ KPI กลางของ Phase 37 |

---

## 12) การติดตั้งและตรวจสอบ

ติดตั้ง (idempotent):

```bash
php scripts/apply_phase38_knowledge.php --apply --yes
```

ตรวจสอบ:

```bash
php scripts/smoke_phase38_knowledge.php       # PASS 82  FAIL 0
php scripts/smoke_phase38_api_transport.php   # PASS 19  FAIL 0
php scripts/smoke_phase37_reliability.php     # ต้องยัง PASS 57  FAIL 0
cd frontend && npm run verify                  # tsc --noEmit + next build
```

หมายเหตุ: ถ้า prod standalone server (`node server.js`) ล็อกโฟลเดอร์ `.next/standalone` ให้ build ไปยังโฟลเดอร์สำรอง:
`$env:NEXT_DIST_DIR=".next-verify"; npm run build`

---

## 13) ข้อจำกัดที่รู้อยู่แล้ว (พร้อมหลักฐาน)

- ฐานข้อมูลจริงยังไม่มีบทความความรู้ → Usage/Review/Gap จะขึ้นว่า “ยังไม่มีข้อมูล” ตามหลักข้อ 5 (ไม่ใช่ข้อบกพร่องของระบบ)
- ฐานข้อมูลจริงไม่มี `controlled_documents` → การตรวจ staleness ของเอกสารอ้างอิงถูกข้ามพร้อมหมายเหตุ (NOTE) ใน smoke
- การค้นหาเป็นการจับคำในชื่อ/เนื้อหา/แท็ก/หมวดหมู่แบบ lexical ranking — ยังไม่ใช่เวกเตอร์เชิงความหมาย (semantic search)
- ตัวเลขสถิติดิบเก็บตามระยะเวลา (retention) ตามค่า settings จึงอาจไม่ครอบคลุมตลอดอายุระบบ