# Deploy Log

ทุกแถว = BUILD_ID หนึ่งค่ากับ commit เดียวที่ใช้ build จริง (ห้ามซ้ำ BUILD_ID หรือ commit ในแถวเดียวกัน)

| BUILD_ID | commit hash (ที่ build จริง) | หลักฐาน | หมายเหตุ |
|---|---|---|---|
| M2nyF5DmBFU3EH6mPo7DY | 706006c8 — feat(asset): redesign asset detail page + asset_registry permissions | บันทึกไว้ใน commit 055644b5 (docs: deploy log mapping commit to BUILD_ID) ทันทีหลัง deploy | deploy แรกของงาน asset detail |
| TmG1DPnVeuQzeN09b0p5F | 2b1a3fc5 — feat(settings): security hardening step 1 | บันทึกไว้ใน commit 055644b5 | ยังรวม asset detail 706006c8 อยู่แล้ว |
| X2MVXatUUBEJyIa1pvHqR | b7f0c6e4 — feat(asset): asset detail redesign + permissions hardening | บันทึกไว้ใน commit 82962f54 | asset detail round 2 (BOM perm, QR minimal, tests 172) |
| MR9mCmyk0xiqG3WCV7UAf | 4868b01b — fix(settings): hide secrets, public allowlist, login lockout | บันทึกไว้ใน c7746eb3; `frontend/.next/BUILD_ID` = MR9mCmyk0xiqG3WCV7UAf และ 4868b01b คือ HEAD ตอน build | settings ขั้น 1 (186 tests) — กำลังรันอยู่ก่อนงานรอบนี้ |
| — (รอ deploy รอบนี้) | — | — | เติมหลัง deploy สำเร็จ |

## ทำไม hash ถึงดูขัดกัน (ตรวจด้วย `git reflog -40`, `git log --oneline --graph -25`)

- **TmG1 เคยถูกจับคู่กับ 4868b01b** ในตารางเดิม เพราะแถวถูกต่อท้ายหลังบรรทัดหมายเหตุ (ตารางขาด) และมีคนเติมแถว "TmG1 ↔ 4868b01b (ขั้น 1 commit local)" ปนเข้ามา — เป็นการบันทึกผิด ไม่ใช่ build จริง: BUILD_ID TmG1 ถูก deploy ก่อน commit 4868b01b จะเกิดขึ้น (4868b01b เขียนเวลา 20:59:38 หลัง deploy ของ TmG1)
- **b7f0c6e4 กับ 706006c8**: 706006c8 คือ commit แรกของงาน asset detail แต่ถูก amend/commit ใหม่เป็น b7f0c6e4 (round 2) — เป็นการแก้ commit เดิมด้วย `git commit --amend`/สร้าง commit ใหม่ ไม่ใช่ rebase ของทั้ง branch; ทั้งสองเป็น ancestor ของ HEAD
- **c59c2177 / 94f1a9c5**: เป็น commit ของงาน settings ขั้น 1 ที่ถูก `git commit --amend` เป็น c59c2177 แล้ว `git reset` กลับไป 82962f54 ก่อน commit 4868b01b ใหม่ → ทั้งสองไม่ใช่ ancestor ของ HEAD (กู้คืนได้จาก reflog เท่านั้น)
- สรุปกลไก: **amend + reset** (ไม่ใช่ rebase/squash) ทำให้มี commit hash หลายรุ่นของงานเดียวกันใน reflog

## ยืนยัน ancestor ของ HEAD ปัจจุบัน

- HEAD = c7746eb3 (docs: update deploy log with new BUILD_ID)
- 706006c8, 2b1a3fc5, b7f0c6e4, 4868b01b, 82962f54, 9afd145e = ancestor ของ HEAD (ตรวจด้วย `git merge-base --is-ancestor`)
- c59c2177, 94f1a9c5 = ไม่ใช่ ancestor (ถูก amend/reset ออกไปแล้ว)

## รุ่นที่รันอยู่ (ก่อน deploy รอบนี้)

- BUILD_ID = MR9mCmyk0xiqG3WCV7UAf (`frontend/.next/BUILD_ID`)
- build จาก commit 4868b01b ซึ่งเป็น ancestor ของ HEAD c7746eb3
- git status: สะอาด (ก่อนเริ่มงานรอบนี้)
