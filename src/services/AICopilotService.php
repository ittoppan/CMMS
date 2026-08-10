<?php

class AICopilotService {

    /**
     * AI Diagnosis Assistant for Technician queries (e.g. "มอเตอร์ร้อน + เสียงดัง")
     */
    public static function diagnoseSymptom(string $symptom): array {
        $symptomLower = mb_strtolower($symptom, 'UTF-8');

        // Enhanced symptom detection with more keywords and variations
        if (str_contains($symptomLower, 'มอเตอร์') || str_contains($symptomLower, 'ร้อน') || str_contains($symptomLower, 'ดัง') || str_contains($symptomLower, 'สั่น') || str_contains($symptomLower, 'สั่นสะเทือน') || str_contains($symptomLower, 'เสียงดังผิดปกติ') || str_contains($symptomLower, 'สั่นผิดปกติ')) {
            return [
                'symptom' => $symptom,
                'causes' => [
                    '1. ตลับลูกปืน (Bearing) ขาดสารหล่อลื่นหรือติดล็อก',
                    '2. ภาระโหลดมอเตอร์สูงเกินเกณฑ์ (Overload)',
                    '3. พัดลมระบายความร้อนท้ายมอเตอร์อุดตัน',
                    '4. สายพานหย่อนหรือตึงเกินไป',
                    '5. การติดตั้งมอเตอร์ไม่สมดุล (Imbalance)'
                ],
                'steps' => [
                    'ขั้นที่ 1: วัดอุณหภูมิเสื้อตลับลูกปืนด้วยปืนอินฟราเรด (ไม่ควรเกิน 75°C)',
                    'ขั้นที่ 2: ตรวจเช็คกระแสไฟฟ้า (Ampere) ด้วยแคลมป์มิเตอร์เทียบกับ Nameplate',
                    'ขั้นที่ 3: ใช้เครื่องวัดความสั่นสะเทือน (Vibration Meter) ตรวจจับความถี่ตลับลูกปืน',
                    'ขั้นที่ 4: ตรวจสอบสภาพสายพานและปรับความตึง',
                    'ขั้นที่ 5: ตรวจสอบการติดตั้งและการเชื่อมต่อมอเตอร์' 
                ],
                'spares' => [
                    ['code' => 'SUP0010015', 'name' => 'BEARING 6205 2RS C3 (SKF)', 'qty' => '2 ชิ้น'],
                    ['code' => 'SP-GREASE-01', 'name' => 'MOBIL POLYREX EM GREASE', 'qty' => '1 กระป๋อง']
                ]
            ];
        } elseif (str_contains($symptomLower, 'ปั๊ม') || str_contains($symptomLower, 'น้ำรั่ว') || str_contains($symptomLower, 'เสียงดัง') || str_contains($symptomLower, 'แรงดันตก')) {
             return [
                'symptom' => $symptom,
                'causes' => [
                    '1. ซีลปั๊มเสื่อมสภาพหรือเสียหาย',
                    '2. โอริง (O-ring) สึกหรอหรือขาด',
                    '3. ข้อต่อท่อมีรอยรั่วซึม',
                    '4. แรงดันน้ำมันหล่อลื่นต่ำเกินไป'
                ],
                'steps' => [
                    'ขั้นที่ 1: ตรวจสอบรอยรั่วที่ซีลและโอริงของปั๊ม',
                    'ขั้นที่ 2: ตรวจสอบข้อต่อท่อและสายอ่อนทั้งหมด',
                    'ขั้นที่ 3: วัดแรงดันน้ำมันหล่อลื่นและเติมหากจำเป็น',
                    'ขั้นที่ 4: ฟังเสียงการทำงานของปั๊มเพื่อหารอยผิดปกติ'
                ],
                'spares' => [
                    ['code' => 'SUP0020001', 'name' => 'PUMP SEAL KIT', 'qty' => '1 ชุด'],
                    ['code' => 'SUP0030005', 'name' => 'O-RING SET', 'qty' => '1 ชุด']
                ]
            ];
        } elseif (str_contains($symptomLower, 'ระบบไฮดรอลิก') || str_contains($symptomLower, 'วาล์ว')) {
             return [
                'symptom' => $symptom,
                'causes' => [
                    '1. ระดับน้ำมันไฮดรอลิกต่ำ',
                    '2. ตัวกรองอุดตัน',
                    '3. วาล์วควบคุมทำงานผิดปกติ',
                    '4. ท่อไฮดรอลิกเสียหายหรือรั่ว'
                ],
                'steps' => [
                    'ขั้นที่ 1: ตรวจสอบระดับน้ำมันไฮดรอลิกในถังพัก',
                    'ขั้นที่ 2: ตรวจสอบและทำความสะอาด/เปลี่ยนไส้กรอง',
                    'ขั้นที่ 3: ทดสอบการทำงานของวาล์วควบคุมแต่ละตัว',
                    'ขั้นที่ 4: ตรวจสอบท่อและข้อต่อไฮดรอลิกทั้งหมดเพื่อหารอยรั่ว'
                ],
                'spares' => [
                    ['code' => 'SUP0040002', 'name' => 'HYDRAULIC OIL ISO VG 46', 'qty' => '5 ลิตร'],
                    ['code' => 'SUP0040010', 'name' => 'HYDRAULIC FILTER ELEMENT', 'qty' => '1 ชิ้น']
                ]
            ];
        }

        // Default response if no specific symptom is matched
        return [
            'symptom' => $symptom,
            'causes' => ['1. เซนเซอร์หรือสวิตช์ตรวจจับระยะคลาดเคลื่อน', '2. แรงดันนิวเมติกส์/ไฮดรอลิกไม่ถึงเกณฑ์'],
            'steps' => ['ขั้นที่ 1: ตรวจเช็คไฟสถานะ LED ที่ตู้ PLC', 'ขั้นที่ 2: วัดแรงดันดันสายลมหลัก (> 6 Bar)'],
            'spares' => [['code' => 'SUP0010016', 'name' => '500PFE FILTER ELEMENT', 'qty' => '1 ชิ้น']]
        ];
    }
}
