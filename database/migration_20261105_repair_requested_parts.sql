-- UX P2: ผู้แจ้งซ่อมเลือกอะไหล่ที่ต้องการเบิกตอนกรอกฟอร์ม (JSON string: [{code,name,qty}])
ALTER TABLE repair ADD COLUMN requested_parts MEDIUMTEXT NULL AFTER notes;
