# PWA (Progressive Web App) — CMMS-TOPPAN

> คู่มือติดตั้ง ใช้งาน บำรุงรักษา และข้อกำหนด สำหรับฟีเจอร์ PWA ของระบบ CMMS-TOPPAN
> อัปเดตล่าสุด: สิงหาคม 2026 · เวอร์ชัน SW: `cmms-tpt-*v2`

---

## 1. ภาพรวม

ระบบ CMMS-TOPPAN รองรับการใช้งานเป็น **PWA (Progressive Web App)** — ผู้ใช้สามารถ **ติดตั้งแอปฯ ลงเครื่อง** (โทรศัพท์/แท็บเล็ต/คอมพิวเตอร์) ได้เหมือนแอป native โดยไม่ต้องผ่าน App Store และยังเปิดใช้งานได้บางส่วน **เมื่อออฟไลน์**

| คุณสมบัติ | สถานะ |
|---|---|
| ติดตั้งได้ (Installable) | ✅ ทั้ง Android / iOS / Windows / macOS / ChromeOS |
| เปิดออฟไลน์ (Offline shell) | ✅ หน้าที่เคยเปิดไว้แล้ว |
| โหลดเร็ว (Cache static assets) | ✅ cache-first สำหรับ `/_next/*` และ icons |
| ข้อมูลออฟไลน์ (API cache) | ✅ GET `/api/v1/*` network-first + fallback |
| Auto-update เมื่อมีเวอร์ชันใหม่ | ✅ SKIP_WAITING + reload อัตโนมัติ |
| แยกตามสิทธิ์ผู้ใช้ (Role-based) | ✅ เมนู/ข้อมูลออฟไลน์ = เฉพาะสิ่งที่ผู้ใช้คนนั้นเห็นได้ |

---

## 2. ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | ตำแหน่ง | หน้าที่ |
|---|---|---|
| `manifest.webmanifest` | `frontend/public/` | Metadata แอปฯ: ชื่อ, start_url, shortcuts, icons, theme |
| `sw.js` | `frontend/public/` | Service worker: กลยุทธ์ cache + offline fallback + auto-update |
| `offline.html` | `frontend/public/` | หน้าแสดงเมื่อเปิดหน้าที่ไม่เคย cache ขณะออฟไลน์ |
| `PwaRegister.tsx` | `frontend/components/` | Client component: register SW หลัง page load + auto-update |
| `layout.tsx` | `frontend/app/` | ประกาศ `manifest`, `applicationName`, `appleWebApp`, `themeColor` |
| `icons/icon-192.png`, `icon-512.png` | `frontend/public/icons/` | ไอคอนติดตั้ง (192/512 + maskable) |

---

## 3. กลยุทธ์ Service Worker (sw.js v2)

แยก cache เป็น 3 กลุ่ม เพื่อไม่ให้ cache ข้อมูลเก่าซ้อนกับของใหม่:

| Cache | เนื้อหา | กลยุทธ์ |
|---|---|---|
| `cmms-tpt-shell-v2` | `/`, `/offline.html`, manifest, icons, หน้าที่เคยเปิด (HTML) | Network-first → cache → offline.html |
| `cmms-tpt-assets-v2` | `/_next/*` (JS/CSS chunks), `/icons/*` | **Cache-first** (เร็ว + ใช้ได้ออฟไลน์) |
| `cmms-tpt-api-v2` | GET `/api/v1/*` (pm_am, work-orders, analytics…) | Network-first → cache fallback |

**หลักการสำคัญ**
- ตอบสนองเฉพาะ `method === GET` — **POST/PUT/DELETE (แจ้งซ่อม, บันทึกเช็คชีท, สร้างแผน) ต้องต่อเน็ตเสมอ** และไม่ถูก cache
- Cross-origin (CDN, LINE) ปล่อยผ่าน ไม่ยุ่ง
- Navigation ไปหน้าที่ไม่เคย cache ขณะออฟไลน์ → แสดง `offline.html`

### Auto-update
1. Deploy ไฟล์ `sw.js` ใหม่ → เบราว์เซอร์พบ byte ต่าง → ลง `installing`
2. `PwaRegister.tsx` ส่ง `SKIP_WAITING` → SW ใหม่ activate
3. `controllerchange` → reload หน้า 1 ครั้ง (กัน loop)
4. `activate` ล้าง cache เวอร์ชันเก่า (`v1`) อัตโนมัติ

> **เวลาแก้ code หน้าเว็บ**: แค่ deploy หน้าใหม่ — `sw.js` ไม่ต้องแก้ ถ้าไม่ได้เปลี่ยนกลยุทธ์ cache
> **เวลาแก้ sw.js / เปลี่ยนกลยุทธ์**: ให้ **เปลี่ยนชื่อ cache เป็น v3** (เช่น `cmms-tpt-shell-v3`) + `PRECACHE_URLS` ใหม่ — SW จะล้าง v2 เอง

---

## 4. วิธีติดตั้ง (End-user)

### 🤖 Android (Chrome)
1. เปิดระบบด้วย HTTPS
2. แถบเมนู ⋮ → **"Add to Home screen" / "ติดตั้งแอป"**
3. กดติดตั้ง → ได้ไอคอนบนหน้าจอโฮม เปิดแบบ full-screen

### 🍎 iPhone / iPad (Safari)
1. เปิดระบบด้วย HTTPS
2. กดปุ่ม **Share (⬆️)** → **"Add to Home Screen"**
3. ตั้งชื่อ → เพิ่ม

### 💻 Desktop (Chrome / Edge)
1. เปิดระบบ → คลิกไอคอน **ติดตั้ง (⊞)** ที่ท้าย address bar (หรือเมนู ⋮ → Cast, save and share → Install)
2. บน Windows จะได้ shortcut + เปิดในหน้าต่าง standalone

### แอปฯ มี **Shortcuts** (กดค้าง/คลิกขวาที่ไอคอน):
แดชบอร์ด · แจ้งซ่อมด่วน · ทำเช็คชีท PM · ปฏิทิน PM

---

## 5. ข้อกำหนด (Requirements)

### สำหรับผู้ใช้ (Browser)
| เบราว์เซอร์ | สนับสนุน |
|---|---|
| Chrome / Edge (Android, Desktop) | ✅ เต็มรูปแบบ |
| Safari (iOS 16.4+) | ✅ (ต้องเพิ่มเองจาก Share) |
| Firefox (Desktop) | ⚠️ ติดตั้งได้บางส่วน, offline ทำงาน |
| Internet Explorer | ❌ ไม่รองรับ |

### สำหรับระบบ (Server)
- **HTTPS เป็นสิ่งที่จำเป็น** (PWA ใช้ได้เฉพาะ secure context + localhost) — ใช้ cert จริง หรือ ngrok/tunnel ก็ได้
- IIS ต้องมี MIME type:
  | นามสกุล | MIME | สถานะ |
  |---|---|---|
  | `.webmanifest` | `application/manifest+json` | ✅ เพิ่มแล้ว (มี.ค. 2026) |
  | `.js` | `application/javascript` | ✅ มีอยู่แล้ว |
  | `.png` | `image/png` | ✅ มีอยู่แล้ว |
- ถ้า reverse proxy (IIS → node): ตั้งค่าให้ `Cache-Control: no-cache` สำหรับ `/sw.js` เพื่อให้อัปเดตทัน ไม่ถูก cache ค้าง (แนะนำ)
- Dev server: `localhost` ใช้ได้เลย ไม่ต้อง HTTPS

---

## 6. สิทธิ์เมนู & ความปลอดภัย (Role-based)

- **เมนูแสดงตามสิทธิ์เหมือนเดิม** — PWA ไม่ได้ bypass ระบบ permission
- ทุก API ยังตรวจ `$_SESSION['user_id']` + role ที่ฝั่ง server (เช่น `/api/v1/pm_am.php` ส่ง 401 ถ้าไม่มี session)
- SW **cache เฉพาะ response ที่ GET สำเร็จ** → ผู้ใช้แต่ละคนจะได้ cache เฉพาะหน้าที่ตัวเองเข้าถึงเท่านั้น
- ไม่มีข้อมูลของ role อื่น หรือข้อมูล "เฉพาะบุคคล" (เช่น session token) ถูก cache — cookie/token ไม่ถูกเก็บใน cache
- ผู้ใช้ออกจากระบบ (logout) → หน้า login โหลดใหม่ตามปกติ (network-first) — cache หน้าที่เคยเปิดยังคงมีในเครื่องของผู้ใช้นั้นเอง (เป็นพฤติกรรมปกติของเบราว์เซอร์)

---

## 7. การ Deploy ขึ้น Production

1. Build: `npm run build` (ใน `frontend/`) — ตรวจ `public/` มีครบ: `sw.js`, `manifest.webmanifest`, `offline.html`, `icons/`
2. คัดลอก `public/*` ไปยัง web root ของ production ด้วย (ไฟล์เหล่านี้ต้อง reachable ที่ `/sw.js`, `/manifest.webmanifest` …)
3. ตรวจ MIME `.webmanifest` บน IIS (ข้อ 5) — ถ้า server ใหม่ ต้องเพิ่มใหม่
4. เปิดเว็บครั้งแรก → ตรวจ DevTools > Application:
   - Manifest: ถูกต้อง (name/icon)
   - Service Workers: `sw.js` **activated**
5. ทดสอบ offline: DevTools > Network > **Offline** → reload → หน้าที่เคยเปิดต้องยังโหลดได้
6. แจ้งผู้ใช้ติดตั้งตามหัวข้อ 4

### ถ้าใช้ `output: "standalone"`
- `sw.js`, `manifest`, `offline.html`, `icons` ต้อง copy ไปไว้ข้าง `.next/standalone` ตามโครงสร้าง public ที่ถูก expose (หรือ config IIS/chroot ให้ถูก path)

---

## 8. Checklist ทดสอบ (QA)

- [ ] เปิดหน้า `/` → แถบ address bar โชว์ไอคอนติดตั้ง
- [ ] Manifest: name = "CMMS-TOPPAN — ระบบบริหารงานซ่อมบำรุง", start_url = `/`
- [ ] DevTools > Application > Service Workers: status = **activated and running**
- [ ] DevTools > Network > Offline → reload `/dashboard` → ยังแสดง (จาก cache)
- [ ] ออฟไลน์ + เปิดหน้าใหม่ที่ไม่เคยเปิด → แสดง `offline.html`
- [ ] Online กลับมา → ข้อมูลสด (ไม่ใช่ของเก่า) — network-first
- [ ] ติดตั้งบน Android → เปิด standalone + shortcut ครบ 4
- [ ] iOS → Add to Home Screen → เปิด standalone
- [ ] Logout → ยังบังคับ login เหมือนเดิม
- [ ] อัปเดต code → SW ใหม่ activated อัตโนมัติ ไม่ต้องล้างแคชมือ

---

## 9. Troubleshooting

| อาการ | สาเหตุ/วิธีแก้ |
|---|---|
| ไม่มีปุ่มติดตั้ง | ยังไม่ HTTPS (ใช้ localhost หรือติดตั้ง cert) · manifest/icon ผิด · SW ยังไม่ activated (รอ reload 2 ครั้งแรก) |
| Manifest 404/406 | MIME `.webmanifest` ไม่มีบน IIS → เพิ่มตามข้อ 5 |
| อัปเดตหน้าแล้วไม่ขึ้น | SW cache เก่า → reload 1-2 ครั้ง หรือ DevTools > Application > Clear site data |
| ออฟไลน์แล้วหน้าว่าง | หน้านั้นไม่เคยเปิดมาก่อน → ควรได้ offline.html (ถ้าไม่ แสดง SW ยังไม่ control: เปิด `/` แล้ว reload) |
| API ข้อมูลเก่าตอนออฟไลน์ | ตั้งใจแล้ว — cache fallback ใช้ข้อมูลล่าสุดที่เคยโหลด (ระบุชัดบน offline.html ว่า "บันทึกข้อมูลต้องต่อเน็ต") |
| **Dev: แก้โค้ดแล้วไม่ขึ้น** | **SW cache-first คืน chunk `_next/static` เก่า (ใน dev chunk ชื่อไม่เปลี่ยน)** → bump ชื่อ cache ใน `sw.js` (เช่น `cmms-tpt-assets-v3` → `-v4`) แล้ว reload 2 ครั้ง หรือ DevTools > Application > Clear site data |
| Dev: โหลดหน้าแล้ว error ใหม่ ๆ | แก้ไฟล์เสร็จต้องรอ dev server log ขึ้น "Compiled" — ถ้าไม่มี แสดง HMR หลุด (server restart) |

---

## 10. ไฟล์ที่เกี่ยวข้องกับการพัฒนาต่อ

- ถ้าอยากเพิ่มหน้าให้ offline เสมอ (precache): เพิ่ม URL ใน `PRECACHE_URLS` ของ `sw.js`
- ถ้าอยากเพิ่ม shortcut: แก้ `manifest.webmanifest` → `shortcuts`
- ถ้าอยากเปลี่ยนสีธีม: แก้ `theme_color` / `background_color` ใน manifest + `viewport.themeColor` ใน `layout.tsx`
