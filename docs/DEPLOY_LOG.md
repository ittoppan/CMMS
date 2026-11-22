# Deploy Log

| BUILD_ID | commit hash | หมายเหตุ |
|---|---|---|
| M2nyF5DmBFU3EH6mPo7DY | 706006c8 (feat(asset): redesign asset detail page + asset_registry permissions) | deploy ครั้งแรกของงาน asset detail (asset_registry/view redesign + permissions) |
| TmG1DPnVeuQzeN09b0p5F | 2b1a3fc5 (feat(settings): security hardening step 1) | deploy หลังงาน settings security; รวม asset detail ด้วย |

หมายเหตุ: production ปัจจุบัน (BUILD_ID TmG1DPnVeuQzeN09b0p5F) ตรงกับ commit 2b1a3fc5 (HEAD) ซึ่งรวม asset detail commit 706006c8 อยู่แล้ว
| X2MVXatUUBEJyIa1pvHqR | b7f0c6e4 (feat(asset): asset detail redesign + permissions hardening) | deploy หลังงาน asset detail round 2 (BOM perm, QR minimal, asset_hub gating, tests 172) |
| TmG1DPnVeuQzeN09b0p5F | 4868b01b (fix(settings): hide secrets, public allowlist, login lockout) | ขั้น 1 commit (local) |
| MR9mCmyk0xiqG3WCV7UAf | 4868b01b (fix(settings): hide secrets, public allowlist, login lockout) | deploy หลังขั้น 1 (settings security, login lockout, tests 186) |
