# PHASE 10 — End-to-End Testing Report

> วันที่: 2026-11-19
> ขอบเขต: ทดสอบ notification flow จริง (trigger → inbox → delivery → channel)

---

## 1. สรุปผลการทดสอบ

| หมวด | สถานะ | จำนวน |
|---|---|---|
| Unit tests (test_notifications.php) | ✅ PASS | 62/62 |
| NotificationCenterService flow | ✅ PASS | 6/6 |
| Notification rules CRUD | ✅ PASS | 4/4 |
| Notification engine (CLI) | ✅ PASS | รันสำเร็จ |
| Quiet hours | ✅ PASS | save/get/isIn |
| Template validate/preview | ✅ PASS | validate + preview |
| iot_alarm event fix | ✅ PASS | php -l ผ่าน |

---

## 2. รายละเอียดการทดสอบ

### 2.1 Unit Tests (scripts/test_notifications.php)
- **ผลลัพธ์:** 62 PASS, 0 FAIL
- **ครอบคลุม:** getSettingValue, substituteVars, encodeHeader, buildEmailHtml, publicBaseUrl, linePhotoUrl, repairPhotoUrls, getLineTemplate, getEmailTemplateConfig, logLineSend, sendLinePushMessage (disabled), sendNotificationToUser (guarded), regression guard
- **DB:** ใช้ scratch DB (cmms_tpt_ntftest) — ไม่กระทบ production

### 2.2 NotificationCenterService Flow (E2E)
| Test | ผลลัพธ์ |
|---|---|
| notify() creates inbox row | ✅ สร้าง 1 row |
| listForUser() returns items | ✅ 30 items, unread count correct |
| markRead() updates | ✅ 1 row updated |
| saveQuietHours() + getQuietHours() | ✅ enabled=true, 22:00-07:00 |
| isInQuietHours() | ✅ false (current time not in quiet hours) |
| savePreferences() | ✅ work_order/push = false |
| validateTemplateVars() | ✅ detects unknown vars (name) |
| previewTemplate() | ✅ renders WO-2026-0142 / MCH-01 |

### 2.3 Notification Rules CRUD (E2E)
| Test | ผลลัพธ์ |
|---|---|
| saveRule() create | ✅ id=5 |
| saveRule() update | ✅ id=5 updated |
| rules() list | ✅ found our rule |
| deleteRule() | ✅ deleted |

### 2.4 Notification Engine (CLI)
- **คำสั่ง:** `php scripts/notification_engine.php --module=pm,low_stock,sla,escalation,calibration,inspection,retry`
- **ผลลัพธ์:** รันสำเร็จ (exit 0)
- **Candidates:** PM 0, low stock 678 (deduped), SLA 1 (deduped), escalation 0, calibration 0, inspection 0
- **Retry:** 0 deliveries (ไม่มี pending/failed)

### 2.5 Quiet Hours
- **save/get:** ✅ enabled=true, 22:00-07:00
- **isInQuietHours:** ✅ false (current time outside quiet hours)
- **Validation:** ✅ regex ปรับแล้ว (00-23:00-59)

### 2.6 Template Validate/Preview
- **validateTemplateVars:** ✅ detects unknown vars
- **previewTemplate:** ✅ renders with sample vars

---

## 3. สิ่งที่ไม่สามารถทดสอบได้ (ต้องการ config จากผู้ใช้)

| รายการ | เหตุผล | ต้องการ |
|---|---|---|
| Teams channel delivery | Teams webhook URL ว่าง | Teams Incoming Webhook URL |
| Telegram delivery (live) | ทดสอบได้ (token ตั้งค่าแล้ว) | — |
| Email delivery (live) | SMTP ตั้งค่าแล้ว แต่ต้องมี user email | — |
| Web Push delivery (live) | ต้องมี browser subscription | เปิด push บนอุปกรณ์ |
| LINE delivery (live) | LINE token ตั้งค่าแล้ว | LINE user ผูก account |

---

## 4. สรุป

ระบบ notification ทำงานถูกต้องในระดับ unit + service:
- ✅ 62/62 unit tests pass
- ✅ 6/6 service flow tests pass
- ✅ 4/4 rules CRUD tests pass
- ✅ Notification engine รันสำเร็จ
- ✅ Quiet hours ทำงานถูกต้อง
- ✅ Template validate/preview ทำงานถูกต้อง

ช่องว่างที่เหลือ:
- Teams webhook URL (ต้องการจากผู้ใช้)
- Live channel delivery (ต้องการ user config: email, push subscription, LINE binding)
- Scheduled events ที่ยังไม่มี trigger (calibration, shutdown, spare_optimization, etc.) — ตาม PHASE 08 audit
