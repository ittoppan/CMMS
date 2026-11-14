# CMMS-TPT — Chart Architecture

## สถานะปัจจุบัน

| ประเด็น | สภาพจริง |
|---|---|
| Library ที่ใช้ | `recharts` (มีใน `package.json` และใช้ใน wallboard) |
| `echarts` / `echarts-for-react` | **ยังไม่ติดตั้ง** — คำขอ Part 4 ต้องเพิ่ม dependency |
| Wrapper กลาง | ยังไม่มี `components/charts/*`; กราฟถูกประกอบในหน้า dashboard โดยตรง |
| Theme | สีกราฟมาจาก `frontend/lib/dashboard-tower.ts` (`TOWER_PALETTE`) |
| States | มี loading (`aria-busy`), empty (ข้อความ + N/A), error (แบนเนอร์เตือน) ในระดับหน้า |

## การตัดสินใจ

**ยังไม่ย้ายไป ECharts ในรอบนี้** เพราะ:
1. การเพิ่ม dependency ใหม่ทั้งชุด (echarts ~1MB+) ต้องอนุมัติและต้องทดสอบ bundle/SSR
2. ระบบมีกราฟ recharts ที่ทำงานจริงและผ่าน design audit อยู่แล้ว
3. กติกาโปรเจกต์: "Do not introduce unnecessary dependencies" + "Do not create duplicate implementations"

## แผนที่แนะนำ (เมื่อได้รับอนุมัติ)

```
frontend/components/charts/
  ChartContainer.tsx   // กรอบมาตรฐาน: title, subtitle, actions, refresh time, states
  ChartTheme.ts        // อ่าน token จาก TOWER_PALETTE / --cmms-*
  ChartTooltip.tsx     // tooltip มาตรฐาน (หน่วย + ตัวคั่นหลักพัน)
  ChartLegend.tsx
  ChartEmpty.tsx       // "ยังไม่มีข้อมูล" + ระบุแหล่งที่ขาด
  ChartError.tsx
  LineChart.tsx / AreaChart.tsx / BarChart.tsx / StackedBar.tsx
  DonutChart.tsx / GaugeChart.tsx / ParetoChart.tsx / HeatmapChart.tsx
```

ลำดับการย้าย: `dashboard` → `analytics` → `mtbf_mttr` → `cost` (ทีละหน้า, เก็บ recharts ไว้เป็น fallback)

## ข้อกำหนดคุณภาพของกราฟ (ใช้ได้ทั้งสองไลบรารี)

- แกนเวลาใช้ข้อมูลจริงเท่านั้น; ช่วงที่ไม่มีข้อมูลต้องเป็นช่องว่าง ไม่เติม 0 ปลอม
- Tooltip ระบุหน่วย (งาน / ชม. / นาที / บาท) และช่วงวันที่
- สีสื่อความหมายคงที่ทั้งระบบ (เขียว=ปิดงาน, เหลือง=กำลังทำ, แดง=เกินกำหนด, เทา=ยังไม่มอบหมาย)
- กราฟที่ตัวเลขเป็น N/A ต้องไม่แสดงกราฟเปล่าที่ดูเหมือนค่า 0
