<?php

class AICopilotService {

    /**
     * AI Diagnosis Assistant for Technician queries (e.g. "มอเตอร์ร้อน + เสียงดัง")
     */
    public static function diagnoseSymptom(string $symptom): array {
        $symptomLower = mb_strtolower($symptom, 'UTF-8');

        if (str_contains($symptomLower, 'มอเตอร์') || str_contains($symptomLower, 'ร้อน') || str_contains($symptomLower, 'ดัง')) {
            return [
                'symptom' => $symptom,
                'causes' => [
                    '1. ตลับลูกปืน (Bearing) ขาดสารหล่อลื่นหรือติดล็อก',
                    '2. ภาระโหลดมอเตอร์สูงเกินเกณฑ์ (Overload)',
                    '3. พัดลมระบายความร้อนท้ายมอเตอร์อุดตัน'
                ],
                'steps' => [
                    'ขั้นที่ 1: วัดอุณหภูมิเสื้อตลับลูกปืนด้วยปืนอินฟราเรด (ไม่ควรเกิน 75°C)',
                    'ขั้นที่ 2: ตรวจเช็คกระแสไฟฟ้า (Ampere) ด้วยแคลมป์มิเตอร์เทียบกับ Nameplate',
                    'ขั้นที่ 3: ใช้เครื่องวัดความสั่นสะเทือน (Vibration Meter) ตรวจจับความถี่ตลับลูกปืน'
                ],
                'spares' => [
                    ['code' => 'SUP0010015', 'name' => 'BEARING 6205 2RS C3 (SKF)', 'qty' => '2 ชิ้น'],
                    ['code' => 'SP-GREASE-01', 'name' => 'MOBIL POLYREX EM GREASE', 'qty' => '1 กระป๋อง']
                ]
            ];
        }

        return [
            'symptom' => $symptom,
            'causes' => ['1. เซนเซอร์หรือสวิตช์ตรวจจับระยะคลาดเคลื่อน', '2. แรงดันนิวเมติกส์/ไฮดรอลิกไม่ถึงเกณฑ์'],
            'steps' => ['ขั้นที่ 1: ตรวจเช็คไฟสถานะ LED ที่ตู้ PLC', 'ขั้นที่ 2: วัดแรงดันดันสายลมหลัก (> 6 Bar)'],
            'spares' => [['code' => 'SUP0010016', 'name' => '500PFE FILTER ELEMENT', 'qty' => '1 ชิ้น']]
        ];
    }
}
