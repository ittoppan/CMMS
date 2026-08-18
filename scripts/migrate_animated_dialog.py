#!/usr/bin/env python3
"""Migrate pages from Astryx `<Dialog>` to `<AnimatedDialog>` (exit animation wrapper).
Idempotent: safe to re-run; handles both CRLF and LF files."""
import io, os, re, sys

APP = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "frontend", "app", "(dashboard)"))

IMP_OLD = 'import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";'
IMP_NEW = 'import { DialogHeader } from "@astryxdesign/core/Dialog";\nimport AnimatedDialog from "@/components/AnimatedDialog";'

CLOSE_COND_OLD = "        </Dialog>\n      )}"
CLOSE_COND_NEW = "        </AnimatedDialog>"
CLOSE_MOUNT_OLD = "      </Dialog>"
CLOSE_MOUNT_NEW = "      </AnimatedDialog>"

REPLACEMENTS = {
    "asset_registry/bom_tree/page.tsx": [
        (IMP_OLD, IMP_NEW),
        ("      {modalOpen && (\n        <Dialog isOpen={modalOpen} onOpenChange={(open) => { if (!open) setModalOpen(false); }}>",
         "      <AnimatedDialog open={modalOpen} onClose={() => setModalOpen(false)}>"),
        ("      {confirmDelete && (\n        <Dialog isOpen={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>",
         "      <AnimatedDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>"),
        (CLOSE_COND_OLD, CLOSE_COND_NEW),
    ],
    "asset_registry/page.tsx": [
        (IMP_OLD, IMP_NEW),
        ("      {deleteTarget && (\n        <Dialog isOpen={true} onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)}>",
         "      <AnimatedDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>"),
        (CLOSE_COND_OLD, CLOSE_COND_NEW),
    ],
    "forms/page.tsx": [
        (IMP_OLD, IMP_NEW),
        ("      {uploadOpen && (\n        <Dialog isOpen onOpenChange={(open) => { if (!open) setUploadOpen(false); }}>",
         "      <AnimatedDialog open={uploadOpen} onClose={() => setUploadOpen(false)}>"),
        (CLOSE_COND_OLD, CLOSE_COND_NEW),
    ],
    "pm_am/checksheet/page.tsx": [
        (IMP_OLD, IMP_NEW),
        ("      {sigModalOpen && selectedPlan && (\n        <Dialog isOpen onOpenChange={(open) => { if (!open && !submitting) setSigModalOpen(false); }}>",
         "      <AnimatedDialog open={sigModalOpen && !!selectedPlan} onClose={() => { if (!submitting) setSigModalOpen(false); }}>"),
        (CLOSE_COND_OLD, CLOSE_COND_NEW),
    ],
    "pm_am/page.tsx": [
        (IMP_OLD, IMP_NEW),
        ("      <Dialog isOpen={!!deferTarget} onOpenChange={(o) => !o && setDeferTarget(null)}>",
         "      <AnimatedDialog open={!!deferTarget} onClose={() => setDeferTarget(null)}>"),
        ("      <Dialog isOpen={!!detailTarget} onOpenChange={(o) => !o && setDetailTarget(null)}>",
         "      <AnimatedDialog open={!!detailTarget} onClose={() => setDetailTarget(null)}>"),
        (CLOSE_MOUNT_OLD, CLOSE_MOUNT_NEW),
    ],
    "repair/assign/page.tsx": [
        (IMP_OLD, IMP_NEW),
        ("      <Dialog isOpen={assignOpen} onOpenChange={setAssignOpen}>",
         "      <AnimatedDialog open={assignOpen} onClose={() => setAssignOpen(false)}>"),
        (CLOSE_MOUNT_OLD, CLOSE_MOUNT_NEW),
    ],
    "repair/my_tasks/page.tsx": [
        (IMP_OLD, IMP_NEW),
        ("      {closeModalOpen && (\n        <Dialog isOpen onOpenChange={(open) => { if(!open) setCloseModalOpen(false); }}>",
         "      <AnimatedDialog open={closeModalOpen} onClose={() => setCloseModalOpen(false)}>"),
        (CLOSE_COND_OLD, CLOSE_COND_NEW),
    ],
    "repair/tracking/page.tsx": [
        (IMP_OLD, IMP_NEW),
        ("      {evalModalOpen && (\n        <Dialog \n          isOpen={evalModalOpen} \n          onOpenChange={setEvalModalOpen}\n        >",
         "      <AnimatedDialog open={evalModalOpen} onClose={() => setEvalModalOpen(false)}>"),
        (CLOSE_COND_OLD, CLOSE_COND_NEW),
    ],
    "repair/view/page.tsx": [
        (IMP_OLD, IMP_NEW),
        ("      <Dialog\n        isOpen={!!previewUrl}\n        onOpenChange={(open: boolean) => { if (!open) handleClosePreview(); }}\n      >",
         "      <AnimatedDialog\n        open={!!previewUrl}\n        onClose={() => handleClosePreview()}\n      >"),
        (CLOSE_MOUNT_OLD, CLOSE_MOUNT_NEW),
    ],
    "safety/work_permit/page.tsx": [
        (IMP_OLD, IMP_NEW),
        ("      <Dialog isOpen={modalOpen} onOpenChange={(open) => setModalOpen(open)}>",
         "      <AnimatedDialog open={modalOpen} onClose={() => setModalOpen(false)}>"),
        (CLOSE_MOUNT_OLD, CLOSE_MOUNT_NEW),
    ],
    "settings/page.tsx": [
        (IMP_OLD, IMP_NEW),
        ("      <Dialog isOpen={showDiff} onOpenChange={(open) => { if (!open) setShowDiff(false); }}>",
         "      <AnimatedDialog open={showDiff} onClose={() => setShowDiff(false)}>"),
        ("      <Dialog isOpen={showAudit} onOpenChange={(open) => { if (!open) setShowAudit(false); }}>",
         "      <AnimatedDialog open={showAudit} onClose={() => setShowAudit(false)}>"),
        (CLOSE_MOUNT_OLD, CLOSE_MOUNT_NEW),
    ],
    "spare_parts/page.tsx": [
        (IMP_OLD, IMP_NEW),
        ("      <Dialog isOpen={batchOpen} onOpenChange={setBatchOpen}>",
         "      <AnimatedDialog open={batchOpen} onClose={() => setBatchOpen(false)}>"),
        ("      <Dialog\n        variant=\"fullscreen\"\n        isOpen={isNarrow && isPanelDialogOpen}\n        onOpenChange={setPanelDialogOpen}\n      >",
         "      <AnimatedDialog\n        variant=\"fullscreen\"\n        open={isNarrow && isPanelDialogOpen}\n        onClose={() => setPanelDialogOpen(false)}\n      >"),
        ("      {deleteTarget && (\n        <Dialog isOpen={true} onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)}>",
         "      <AnimatedDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>"),
        (CLOSE_COND_OLD, CLOSE_COND_NEW),
        (CLOSE_MOUNT_OLD, CLOSE_MOUNT_NEW),
    ],
    "spare_parts/stock_take/page.tsx": [
        (IMP_OLD, IMP_NEW),
        ("      <Dialog isOpen={showCreate} onOpenChange={(open) => { if (!open) setShowCreate(false); }}>",
         "      <AnimatedDialog open={showCreate} onClose={() => setShowCreate(false)}>"),
        ("      <Dialog isOpen={confirmComplete} onOpenChange={(open) => { if (!open) setConfirmComplete(false); }}>",
         "      <AnimatedDialog open={confirmComplete} onClose={() => setConfirmComplete(false)}>"),
        (CLOSE_MOUNT_OLD, CLOSE_MOUNT_NEW),
    ],
    "users/page.tsx": [
        (IMP_OLD, IMP_NEW),
        ("      {deleteTarget && (\n        <Dialog isOpen={true} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>",
         "      <AnimatedDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>"),
        (CLOSE_COND_OLD, CLOSE_COND_NEW),
    ],
}

def variants(s):
    return (s.replace("\r\n", "\n").replace("\n", "\r\n"), s.replace("\r\n", "\n"))

# ── ขั้นที่ 2: wrap children ของ delete-confirm dialog ด้วย {target && (...)}
# (เดิม conditional mount ให้ type narrowing — ลบไปแล้ว TS ต้องเห็น null-check)
WRAPS = {
    "asset_registry/bom_tree/page.tsx": [
        ("        <AnimatedDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>\n          <DialogHeader title=\"ยืนยันการลบชิ้นส่วน\" onOpenChange={(open) => { if (!open) setConfirmDelete(null); }} />",
         "        <AnimatedDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>\n          <DialogHeader title=\"ยืนยันการลบชิ้นส่วน\" onOpenChange={(open) => { if (!open) setConfirmDelete(null); }} />\n          {confirmDelete && ("),
        ("                <TrashIcon className=\"w-4 h-4\" />\n                {deleting ? \"กำลังลบ...\" : \"ยืนยันลบ\"}\n              </button>\n            </HStack>\n          </VStack>\n        </AnimatedDialog>",
         "                <TrashIcon className=\"w-4 h-4\" />\n                {deleting ? \"กำลังลบ...\" : \"ยืนยันลบ\"}\n              </button>\n            </HStack>\n          </VStack>\n          )}\n        </AnimatedDialog>"),
    ],
    "asset_registry/page.tsx": [
        ("      <AnimatedDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>\n          <DialogHeader title=\"ยืนยันการลบข้อมูลเครื่องจักร\" onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)} />",
         "      <AnimatedDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>\n          <DialogHeader title=\"ยืนยันการลบข้อมูลเครื่องจักร\" onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)} />\n          {deleteTarget && ("),
        ("                </HStack>\n              </>\n            )}\n          </VStack>\n        </AnimatedDialog>",
         "                </HStack>\n              </>\n            )}\n          </VStack>\n          )}\n        </AnimatedDialog>"),
    ],
    "spare_parts/page.tsx": [
        ("      <AnimatedDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>\n          <DialogHeader title=\"ยืนยันการลบรายการอะไหล่\" onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)} />",
         "      <AnimatedDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>\n          <DialogHeader title=\"ยืนยันการลบรายการอะไหล่\" onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)} />\n          {deleteTarget && ("),
        ("                    {deleting ? \"กำลังลบ...\" : \"ลบรายการ\"}\n                  </button>\n                </HStack>\n              </>\n            )}\n          </VStack>\n        </AnimatedDialog>",
         "                    {deleting ? \"กำลังลบ...\" : \"ลบรายการ\"}\n                  </button>\n                </HStack>\n              </>\n            )}\n          </VStack>\n          )}\n        </AnimatedDialog>"),
    ],
    "users/page.tsx": [
        ("      <AnimatedDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>\n          <DialogHeader title=\"ยืนยันการลบผู้ใช้\" onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} />",
         "      <AnimatedDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>\n          <DialogHeader title=\"ยืนยันการลบผู้ใช้\" onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} />\n          {deleteTarget && ("),
        ("                      {deleting ? \"กำลังลบ...\" : \"ยืนยันลบผู้ใช้\"}\n                    </button>\n                  </HStack>\n                </>\n              )}\n            </VStack>\n          </div>\n        </AnimatedDialog>",
         "                      {deleting ? \"กำลังลบ...\" : \"ยืนยันลบผู้ใช้\"}\n                    </button>\n                  </HStack>\n                </>\n              )}\n            </VStack>\n          </div>\n          )}\n        </AnimatedDialog>"),
    ],
}

def main():
    fails = []
    for rel, reps in REPLACEMENTS.items():
        path = os.path.join(APP, rel)
        with io.open(path, "r", encoding="utf-8", newline="") as f:
            text = f.read()
        # ไฟล์นี้ migrate ครบแล้ว (ไม่มี <Dialog ตัวจริงเหลือ — <DialogHeader ไม่นับ) — ข้าม
        if not re.search(r"<Dialog[ >\n]", text) and "</Dialog>" not in text:
            print(f"{rel}: already migrated, skip")
            continue
        for old, new in reps:
            old_crlf, old_lf = variants(old)
            new_crlf, new_lf = variants(new)
            if old == IMP_OLD and "import AnimatedDialog from \"@/components/AnimatedDialog\";" in text:
                continue
            if old_crlf in text:
                cnt = text.count(old_crlf)
                text = text.replace(old_crlf, new_crlf)
                print(f"{rel}: CRLF x{cnt} {old_lf[:48]!r}")
            elif old_lf in text:
                cnt = text.count(old_lf)
                text = text.replace(old_lf, new_lf)
                print(f"{rel}: LF x{cnt} {old_lf[:48]!r}")
            else:
                fails.append(f"{rel}: NOT FOUND: {old_lf[:80]!r}")
        with io.open(path, "w", encoding="utf-8", newline="") as f:
            f.write(text)
    # ── ขั้นที่ 2: wrap children delete-confirm ──
    for rel, reps in WRAPS.items():
        path = os.path.join(APP, rel)
        with io.open(path, "r", encoding="utf-8", newline="") as f:
            text = f.read()
        if "{deleteTarget && (" in text or "{confirmDelete && (" in text:
            print(f"{rel}: wraps already applied, skip")
            continue
        for old, new in reps:
            old_crlf, old_lf = variants(old)
            new_crlf, new_lf = variants(new)
            if old_crlf in text:
                text = text.replace(old_crlf, new_crlf)
                print(f"{rel}: wrap CRLF {old_lf[:44]!r}")
            elif old_lf in text:
                text = text.replace(old_lf, new_lf)
                print(f"{rel}: wrap LF {old_lf[:44]!r}")
            else:
                fails.append(f"{rel} WRAP: NOT FOUND: {old_lf[:80]!r}")
        with io.open(path, "w", encoding="utf-8", newline="") as f:
            f.write(text)
    if fails:
        print("\n=== FAILED ===")
        for f_ in fails:
            print(f_)
        sys.exit(1)
    print("\nAll migrations applied.")

if __name__ == "__main__":
    main()
