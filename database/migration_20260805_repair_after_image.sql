-- ============================================================
-- Migration: เพิ่มหมวด 'after_image' (รูปหลังซ่อม) ให้ repair_attachments
-- เพื่อแยกรูปก่อนซ่อม (failure_image) กับหลังซ่อม (after_image)
-- ใช้ประกอบการส่ง LINE notification พร้อมรูป Before/After
-- ============================================================
ALTER TABLE `repair_attachments`
  MODIFY COLUMN `category` ENUM('failure_image','after_image','video','document','other') NOT NULL DEFAULT 'other';
