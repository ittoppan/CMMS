/**
 * บีบอัดรูปภาพฝั่ง client ก่อนอัปโหลด
 * - resize ให้ด้านยาวสุดไม่เกิน maxSize px
 * - แปลงเป็น JPEG (data URL) ด้วย quality ที่กำหนด
 * - คืนค่า Promise<string> (data URL) เพื่อใช้เป็น avatar ได้ทันที
 */
export function compressImage(
  file: File,
  maxSize = 512,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          // ถ้ารูปเล็กกว่าขีดจำกัดอยู่แล้ว ไม่ต้อง resize (ยังคงแปลงเป็น JPEG)
          if (width > maxSize || height > maxSize) {
            if (width >= height) {
              height = Math.max(1, Math.round((height * maxSize) / width));
              width = maxSize;
            } else {
              width = Math.max(1, Math.round((width * maxSize) / height));
              height = maxSize;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Canvas not supported"));
            return;
          }
          // พื้นหลังขาว (กรณี PNG โปร่งใส) ป้องกันได้รูปดำ
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error("ไม่สามารถอ่านไฟล์รูปภาพได้"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("ไม่สามารถอ่านไฟล์ได้"));
    reader.readAsDataURL(file);
  });
}
