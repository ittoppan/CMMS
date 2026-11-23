# MOCK_DATA_AUDIT — ตรวจข้อมูลปลอม/ค่าคงที่ (2026-11-23)

ขอบเขต: `frontend/app`, `frontend/components` (ค้นหา monthlyData, mock, sample, dummy, fake, placeholder ที่เป็นข้อมูล, Math.random(), อาร์เรย์ตัวเลขฝัง, ค่าคงที่แสดงเป็น KPI/เปอร์เซ็นต์, ข้อความตัวอย่าง, fallback ??/||)

## สรุป
- ไม่พบตัวเลขปลอมที่ผู้ใช้เห็นอยู่ในหน้าหลัก (ยกเว้น placeholder ที่ติดป้าย N/A แล้ว)
- Math.random() ใช้เฉพาะสร้าง id ภายใน (facility-layout) และเอฟเฟกต์ภาพ (login scene) ไม่ใช่ข้อมูล KPI
- ค่าคงที่ที่พบเป็น default config (budget exceed_pct ?? 100, capacity warn/over ?? 85/100, sort_order ?? 100, max_stock || 100) ไม่ใช่ KPI ปลอม
- monthlyData ใน `/dashboard/my` ถูกลบแล้ว (commit แยกก่อนหน้า); analytics/page.tsx คำนวณจาก API จริง

## ตารางผล (ตัวอย่างที่เกี่ยวข้อง)

| ไฟล์:บรรทัด | สิ่งที่พบ | ปรากฏให้ผู้ใช้เห็น | แนวทางแก้ |
|---|---|---|---|
| frontend/app/(dashboard)/dashboard/my/page.tsx:198-201 | perfMetrics แสดง N/A + note "ไม่มีแหล่งข้อมูล" | ใช่ (ป้าย N/A ชัดเจน) | คงไว้ (ไม่ใช่ค่าปลอม) |
| frontend/app/(dashboard)/dashboard/my/page.tsx:263-266 | sub "N/A vs last week (ไม่มีข้อมูล)" | ใช่ (ป้าย N/A) | คงไว้ |
| frontend/app/(dashboard)/dashboard/wallboard/page.tsx:11 | OEE แสดง N/A | ใช่ (ป้าย N/A) | คงไว้ |
| frontend/app/(dashboard)/analytics/page.tsx:107 | monthlyData คำนวณจาก API | ใช่ | คงไว้ (ไม่ใช่ mock) |
| frontend/app/(dashboard)/budget/page.tsx:262 | exceed_pct ?? 100 (default config) | ใช่ (ค่า config) | คงไว้ |
| frontend/app/(dashboard)/workforce/capacity/page.tsx:62-63 | warn/over ?? 85/100 (default config) | ใช่ (ค่า config) | คงไว้ |

## รายการที่แก้ทันทีเป็น "ไม่มีข้อมูล"
- ไม่มีรายการใหม่ในขั้นนี้ (mock monthlyData ใน /dashboard/my ถูกลบแล้วก่อนหน้า)

## ข้อจำกัด
- การตรวจแบบ grep อาจพลาดข้อมูลปลอมที่ไม่ใช้คำหลัก; แนะนำตรวจด้วย code review เพิ่มเติมในแต่ละโมดูล Phase C