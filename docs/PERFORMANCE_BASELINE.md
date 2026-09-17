# PERFORMANCE BASELINE — CMMS-TOPPAN v1.0.0

ทุกตัวเลข = วัดจริงบนเครื่อง production นี้ 2026-09-17 เวลา ~11:00 local ผ่าน HTTP ฝั่ง PHP (`http://localhost:8081`) และเบราว์เซอร์จริงฝั่ง Next (`http://localhost:3001`).
**ยังไม่มีการ load test** — ค่านี้เป็น single-user baseline เพื่อจับการถอยหลัง (regression) เมื่อมีการเปิด/เพิ่มงาน.

## 1. สภาพแวดล้อมที่วัด

| รายการ | ค่า |
|---|---|
| Host | IIS 10 / FastCGI (activityTimeout 60, requestTimeout 180) |
| PHP | 8.3.26 NTS (opcache on; error_log → `logs/php-error.log` หลัง 11:19) |
| MySQL | 8.0 |localhost:3306|, session `+07:00` |
| Next | Node v22.16.0, :3001, production build `hdZW7CLyR4LnpYB9mnGoT` |
| Client | Playwright Chromium บนเครื่องเดียวกัน (LAN/loopback) |

## 2. API — PHP (IIS) เฉลี่ย

ดูรายละเอียดโพรโทคอลใน `docs/API_CONTRACT.md`.

| Endpoint | เวลา | ขนาด response | หมายเหตุ |
|---|---|---|---|
| `POST /api/auth/login.php` | **104 ms** (98-109, n=3) | — | session cookie ปกติ |
| `GET /api/v1/kpi_dashboard.php` | **28–31 ms** | 1.6 KB | session อบแล้ว |
| `GET /api/v1/repair/list.php` | **51 ms** | 347 KB | การ์ดงานซ่อม |
| `GET /api/v1/repair_detail.php?id=831` | **24 ms** | — | session อบแล้ว |
| `GET /api/v1/asset_registry/list.php` | **15 ms** | — | |
| `GET /api/v1/pm_am/plan/list.php` | **31 ms** | — | |
| `GET /api/v1/inspections/list.php` | **37 ms** | — | |
| `GET /api/v1/reports/report-center (recent)` | **65 ms** | — | |
| `GET /api/v1/spare_parts/list.php` | **79 ms** | **1.06 MB** | โหลดสุด — ดู I-1 (pagination) |
| `GET /api/v1/sage_items.php?q=BEARING` | **193 ms** | — | ODBC Sage 300 จริง (≈30 รายการ) |
| `GET /api/v1/sage_items.php?item_no=INVALID` | **43 ms** | `{"success":true,"item":null}` | graceful |
| `GET /api/health.php` | **16 ms** | 200 | |
| `/api/v1/sage_items.php` (unauth) | — | **401** | auth เด้งถูก |

## 3. Web App — Next.js (ตัวเลขการนำทางของเบราว์เซอร์)

| หน้า | TTFB | DOMContentLoaded | Load | ~Transfer |
|---|---|---|---|---|
| `/dashboard` | 160 ms | 188 ms | **1185 ms** | 71 KB |
| `/repair` | 14 ms | 58 ms | **225 ms** | 75 KB |
| `/reports/report-center` | 11 ms | 93 ms | **117 ms** | 71 KB |
| `/sync-center` | 10 ms | 66 ms | **96 ms** | 52 KB |
| `/spare_parts` | 14 ms | 37 ms | **115 ms** | 71 KB |

- dashboard ใช้ recharts → จังหวะแรก ~1.2s; หน้าอื่น < 230ms ใน loopback (บน LAN/device จะ + network latency)
- หลังหน้าแรก (prerender/asset cache) ทุกหน้าเร็วขึ้นอีก

## 4. สรุป Ingest / ตัวชี้วัดการแจ้งเตือน (threshold เสนอ)

| เมตริก | ค่าชัดเจน | ระดับเตือน |
|---|---|---|
| `/api/health.php` | 200, `db:ok` | ≠200/<5s → alert |
| login | ~104ms | >1s เฉลี่ย → ตรวจ |
| repair list | ~51ms | >500ms → ตรวจ query/load |
| spare_parts list | 79ms / 1.06MB | >3MB → ต้องทำ pagination (I-1) |
| sage_items | ~193ms | >5s (DSN ช้าทาง ODBC) → ตรวจ/fallback |
| disk | 9.6GB | <5GB → alert (backup โต ~7.4MB/วัน) |
| PHP error_log | `logs/php-error.log` | เติบโตเร็ว >1MB/วัน → ตรวจ |

## 5. วิธี re-run (for regression)

```powershell
# 1) API (ผ่าน curl/PHP ซึ่งใช้ session):
#    ใช้ scripts ที่อยู่ %TEMP%\opencode\phase21_login_time.php + phase21_api_probe.php เป็น template
# 2) Web App:
#    ใช้ Playwright CDP — navigate + performance.getEntriesByType('navigation')[0]
# 3) เปรียบเทียบกับตาราง §2/§3; ถ้าระยะเพิ่ม >2x ให้สอบสวนก่อนเปิดจริง
```