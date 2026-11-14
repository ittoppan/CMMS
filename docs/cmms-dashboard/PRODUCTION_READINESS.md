# CMMS-TPT — Production Readiness

## สรุป

| ด้าน | สถานะ | หมายเหตุ |
|---|---|---|
| TypeScript | PASS | `npx tsc --noEmit` 0 error |
| Build | PASS | `npm run build` exit 0 |
| Design audit | PASS | strict 242 หน้า FAIL 0 WARN 0 |
| Git | PASS | commit + push `origin freebuff/ux-ui` และ `origin main` |
| Data integrity | ATTENTION | ฐานข้อมูลยังไม่มีใบงานปิด/PM/ต้นทุน → KPI หลายตัวแสดง N/A ตามจริง |
| Deploy production | DONE (2026-11-14 09:47) | backup 09:44 → `git pull --ff-only` ถึง `8751c99` → `deploy-next.ps1` 30/30 checks, `BUILD_ID=nOrw5KXGZv66eJAtnXLWB` |
| ตรวจหลัง deploy | PASS | `/api/health.php` 200, `/dashboard` 200 · แถบ SLA แสดง “ปกติ 1/99” ตรงกับ `kpi_alerts()` |

## สิ่งที่ต้องทำก่อน deploy

1. `cd frontend && npm run build` (หรือใช้ prebuilt ตาม `scripts/deploy-next.ps1 -Prebuilt <dir> -Port 3001`)
2. ตรวจ `BUILD_ID` ใหม่ให้บริการที่ `/_next/static/<BUILD_ID>/_buildManifest.js`
3. Smoke: `/login` 200, `/dashboard` 200, `/repair/workload` 200, `/api/health.php` 200
4. ตรวจ Scheduled Tasks: CMMS-NextJS / Watchdog / Backup = Ready

## ความเสี่ยงที่ยอมรับได้ / ต้องสื่อสารกับผู้ใช้

- **แดชบอร์ดจะดู "ว่าง"** เพราะข้อมูลจริงยังมีเฉพาะใบงานเปิด 99 ใบ และไม่มีผู้รับผิดชอบ
  → ไม่ใช่บั๊ก; ตัวเลข N/A คือการรายงานตามจริงตามกติกา "ห้ามแต่งค่า"
- รูปช่างจะแสดงเฉพาะผู้ใช้ที่มี `avatar`/`avatar_path` (10/11 คน) และรูปปัญหาไม่มีเลย
  เพราะ `before_image_path` ว่าง 99/99
- TV rotation เปิดเป็นค่าเริ่มต้นบน `/dashboard` — ปิดได้ด้วย `?tv=0` หรือกดปุ่มหยุด

## Rollback

- โค้ด: `git revert <commit>` แล้ว build/deploy ใหม่
- ไม่มีการเปลี่ยน schema/ข้อมูลในงานนี้ → ไม่ต้อง rollback ฐานข้อมูล
