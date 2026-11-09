-- UX: ฟอร์มแจ้งซ่อมแนบวิดีโอจุดชำรุดได้ (staging อัปโหลดก่อนสร้างใบงาน → จด path บนใบงาน)
ALTER TABLE repair ADD COLUMN video_path VARCHAR(500) NULL AFTER before_image_path;
