import io
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import qrcode

# Register Sarabun fonts (available on Windows)
pdfmetrics.registerFont(TTFont("Sarabun", "C:/Windows/Fonts/Sarabun-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Sarabun-Bold", "C:/Windows/Fonts/Sarabun-Bold.ttf"))

URL = "https://cmms-tpt.shares.zrok.io/"
OUT = "docs/CMMS_TPT_PWA_POSTER.pdf"

# Build QR code image in memory
qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=10, border=2)
qr.add_data(URL)
qr.make(fit=True)
img = qr.make_image(fill_color="black", back_color="white")
buf = io.BytesIO()
img.save(buf, format="PNG")
buf.seek(0)
qr_reader = ImageReader(buf)

w, h = A4
c = canvas.Canvas(OUT, pagesize=A4)

# Background
c.setFillColor(colors.HexColor("#0f172a"))
c.rect(0, 0, w, h, fill=1, stroke=0)

# Title
c.setFillColor(colors.white)
c.setFont("Sarabun-Bold", 26)
c.drawCentredString(w/2, h - 45, "CMMS-TPT")
c.setFillColor(colors.HexColor("#94a3b8"))
c.setFont("Sarabun", 13)
c.drawCentredString(w/2, h - 68, "คู่มือติดตั้ง & เข้าใช้งานระบบ (PWA)  |  Installation & Usage Guide")

# Subtitle box
c.setFillColor(colors.HexColor("#1e293b"))
c.roundRect(40, h - 105, w - 80, 26, 8, fill=1, stroke=0)
c.setFillColor(colors.HexColor("#e2e8f0"))
c.setFont("Sarabun", 10.5)
c.drawCentredString(w/2, h - 89, "สแกน QR Code ด้วยมือถือ หรือเปิดลิงก์ด้านล่าง  |  Scan the QR code with your phone, or open the link below")

# QR code
qr_size = 150
qr_x = (w - qr_size) / 2
qr_y = h - 285
c.setFillColor(colors.white)
c.roundRect(qr_x - 12, qr_y - 12, qr_size + 24, qr_size + 24, 12, fill=1, stroke=0)
c.drawImage(qr_reader, qr_x, qr_y, width=qr_size, height=qr_size)

# URL text
c.setFillColor(colors.HexColor("#38bdf8"))
c.setFont("Sarabun-Bold", 12)
c.drawCentredString(w/2, qr_y - 22, URL)

# Steps section title
y = qr_y - 55
c.setFillColor(colors.white)
c.setFont("Sarabun-Bold", 15)
c.drawCentredString(w/2, y, "ขั้นตอนติดตั้งใช้งาน  |  Installation Steps")
y -= 22

steps = [
    ("1", "เปิดเว็บ / สแกน QR", "Open Web / Scan QR",
     "เปิดเบราว์เซอร์บนมือถือ แล้วสแกน QR Code ด้านบน (หรือพิมพ์ URL)",
     "Open the mobile browser, scan the QR code above (or type the URL)."),
    ("2", "เข้าสู่ระบบ", "Sign In",
     "กรอก Username/Password ที่ได้รับ หรือกด \"เข้าสู่ระบบด้วย LINE\"",
     "Enter the provided Username/Password, or sign in with LINE."),
    ("3", "ติดตั้งเป็นแอป (PWA)", "Install as App (PWA)",
     "เมนูเบราว์เซอร์ → \"Add to Home Screen\" / \"ติดตั้งแอป\" เพื่อใช้แบบแอป + offline",
     "Browser menu → \"Add to Home Screen\" / \"Install app\" to use as an app + offline."),
    ("4", "เปิดใช้งาน", "Start Using",
     "เปิดจากไอคอนบนหน้าจอ → ทำงานได้แม้ไม่มีเน็ต (sync ที่ /sync-center)",
     "Open from the home-screen icon → works even offline (sync at /sync-center)."),
]

for num, t_th, t_en, d_th, d_en in steps:
    c.setFillColor(colors.HexColor("#38bdf8"))
    c.circle(50, y + 2, 11, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#0f172a"))
    c.setFont("Sarabun-Bold", 11)
    c.drawCentredString(50, y - 1, num)
    c.setFillColor(colors.white)
    c.setFont("Sarabun-Bold", 12)
    c.drawString(70, y + 6, t_th)
    c.setFillColor(colors.HexColor("#93c5fd"))
    c.setFont("Sarabun", 10)
    c.drawString(70, y - 8, t_en)
    c.setFillColor(colors.HexColor("#cbd5e1"))
    c.setFont("Sarabun", 9.5)
    th_lines = simpleSplit(d_th, "Sarabun", 9.5, w - 95)
    yy = y - 24
    for ln in th_lines:
        c.drawString(70, yy, ln); yy -= 11
    c.setFillColor(colors.HexColor("#94a3b8"))
    en_lines = simpleSplit(d_en, "Sarabun", 9.5, w - 95)
    for ln in en_lines:
        c.drawString(70, yy, ln); yy -= 11
    y = yy - 8

# Tips box
tips_y = y - 2
box_h = 86
c.setFillColor(colors.HexColor("#1e293b"))
c.roundRect(40, tips_y - box_h, w - 80, box_h, 8, fill=1, stroke=0)
c.setFillColor(colors.HexColor("#fbbf24"))
c.setFont("Sarabun-Bold", 11)
c.drawString(50, tips_y - 16, "Tips / คำแนะนำ")
c.setFillColor(colors.HexColor("#e2e8f0"))
c.setFont("Sarabun", 9.5)
tips = [
    ("- iOS Safari: ต้อง Add to Home Screen ก่อนจึงจะใช้ Web Push ได้ (iOS 16.4+)",
     "- iOS Safari: Add to Home Screen is required before Web Push works (iOS 16.4+)."),
    ("- ไม่มีเน็ต: ทำงานต่อได้ แล้วเปิด /sync-center เพื่อ sync คิว",
     "- No internet: keep working, then open /sync-center to sync queued tasks."),
    ("- สิทธิ์เมนู = ตามบทบาท (Admin / Manager / Technician / กำหนดเอง)",
     "- Menu access = by role (Admin / Manager / Technician / custom)."),
]
ty = tips_y - 30
for th, en in tips:
    c.drawString(50, ty, th); ty -= 11
    c.setFillColor(colors.HexColor("#94a3b8"))
    c.drawString(50, ty, en); ty -= 13
    c.setFillColor(colors.HexColor("#e2e8f0"))

# Footer
c.setFillColor(colors.HexColor("#64748b"))
c.setFont("Sarabun", 9)
c.drawCentredString(w/2, 26, "CMMS-TPT  |  คู่มือติดตั้ง PWA / PWA Installation Guide  |  Sarabun")
c.save()
print("saved", OUT)
