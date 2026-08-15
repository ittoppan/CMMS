-- Migration: LINE delivery history (recipient + template columns)
-- สำหรับหน้าประวัติการส่ง LINE (ใคร / เมื่อไหร่ / เทมเพลตไหน)
ALTER TABLE notification_logs
    ADD COLUMN recipient varchar(100) NULL AFTER status,
    ADD COLUMN template varchar(60) NULL AFTER recipient,
    ADD INDEX idx_notification_logs_template (template);
