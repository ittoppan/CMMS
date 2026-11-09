-- UX: ฟอร์มแจ้งซ่อมแนบไฟล์เอกสาร (PDF/DOC/XLS/CSV/ZIP) ได้ (staging อัปโหลดก่อนสร้างใบงาน → จด path บนใบงาน)
ALTER TABLE repair ADD COLUMN attachment_path VARCHAR(500) NULL AFTER video_path;
