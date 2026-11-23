# COMPONENT LIBRARY — CMMS-TOPT (Next.js UI)

> สร้างจากโค้ดจริง (`frontend/components/**`) 2026-11-23 · ใช้คู่กับ `docs/DESIGN_SYSTEM.md` (หลักการ) และ `docs/DESIGN_TOKENS.md` (ค่าสี)
> **ห้ามสร้าง component ใหม่ถ้ามีอยู่ในตารางนี้** — และห้ามนำเข้าไลบรารีอื่นแทน (`@heroicons/react` เป็น legacy)

## 1. Layout / โครงหน้า (`@/components/layout`)

| Component | Props หลัก | ใช้เมื่อ |
|---|---|---|
| `PageHeader` | `title`, `description?`, `eyebrow?`, `breadcrumbs?: {label,href?}[]`, `primaryAction?`, `actions?: ReactNode[]`, `className?` | หัวหน้าของ **ทุกหน้า listing/form** — ให้ h1 หนึ่งตัวต่อหน้า |
| `DetailHeader` | เหมือน PageHeader + `status?: ReactNode` | หัวหน้าของหน้า detail/view (มีช่องสถานะ) |
| `KpiStrip` | `items: KpiItem[]` (`label,value,unit?,tone?,onClick?,href?,active?`), `ariaLabel?` | แถว KPI ที่กดกรองได้ — `tone` = `default｜warning｜danger｜success` |
| `ListToolbar` | `search: {value,onChange,placeholder?}`, `filters?`, `advancedFilters?`, `activeFilterCount?`, `onReset?`, `rightSlot?` | แถบค้นหา + ตัวกรองเหนือตาราง (อย่าเขียน input เอง) |
| `InfoGrid` | `items: {label,value,hint?}[]`, `columns?: 2｜3` | บล็อกข้อมูลแบบ definition list ในการ์ด |
| `FormPage` / `FormSection` / `FormActions` | `FormPage: {error?,success?}` · `FormSection: {title?,description?,columns?:1｜2}` · `FormActions: {primary?,secondary?:[],sticky?,error?,success?}` | หน้า form ทุกหน้า (แบ่งกลุ่มด้วย FormSection, ปุ่มยืนยันใน FormActions) |
| `HubGrid` / `HubCard` | `HubCard: {icon,title,description,href}` | หน้า hub/เมนูย่อยที่เลือกโมดูล |
| `Stack`, `VStack`, `HStack`, `Grid`, `Center`, `Section` | spacing props | จัดระยะแบบเป็นระบบ แทน `div` ซ้อน `div` |

## 2. Primitives (`@/components/ui`)

### ปุ่มและป้าย

| Component | ตัวเลือก | หมายเหตุ |
|---|---|---|
| `Button` | variant `primary｜secondary｜outline｜ghost｜danger` · size `sm(32)｜md(40)｜lg(48)｜icon(40)｜icon-xs(32)` · `loading` | ปุ่ม `sm`/`icon-xs` ขยายพื้นที่กดเป็น ≥48px อัตโนมัติ (ถุงมือ) — **หนึ่ง primary action ต่อหนึ่งวิว** |
| `Badge` | variant `neutral｜primary｜success｜warning｜danger｜info` · `dot?` | ใช้คู่สี `*-light` + `*-dark` เท่านั้น |
| `Alert`, `ErrorState`, `LoadingState`, `EmptyState` (`ui/state-panel` = `EmptyState`, `PermissionDeniedState`) | ข้อความ + action | ทุกหน้ามี empty/loading/error/denied ครบ 4 สถานะ |
| `Spinner`, `Skeleton` | `size`, `label` | skeleton ต้องมีรูปร่างใกล้ของจริง |
| `Progress`, `Timeline` | `Timeline: events[] + tone` | ประวัติงาน/ขั้นตอน |

### ฟอร์ม

| Component | หมายเหตุ |
|---|---|
| `Input`, `Textarea`, `Label`, `FormField` | `FormField` = label + control + description + error |
| `Select`, `Checkbox`, `RadioGroup`, `Switch`, `ToggleGroup`, `Calendar` | Radix ทั้งชุด — ใช้แทน `<select>` ดิบ |
| `Input` มี `label` prop ในตัว (ใช้ใน ListToolbar/ฟิลเตอร์) |

### ตารางข้อมูล

| Component | Props หลัก |
|---|---|
| `DataTable` (`ui/table.tsx`) | `columns`, `data`, `loading?`, `pageSize?`, `showPagination?`, `onRowClick?`, `emptyTitle/Description/Action?`, `variant?: "table"｜"cards"`, `selectable?`, `bulkActions?: {label,icon?,variant?,onRun}[]`, `exportFileName?`, `getRowId?` |
| `SimpleDataTable` (`ui/data-table-adapter.tsx`) | ห่อ `DataTable` ด้วย `SimpleColumn` (`key,header,cell?,accessorFn?`) สำหรับตารางทั่วไป |
| `OsTable` + `OsTHead/OsTBody/OsRow/OsHeadCell/OsCell` | ตารางที่ต้องคุม markup เอง (แถวรวม, ปุ่มต่อแถว) — สไตล์เดียวกับ DataTable |

**กฎ:** มือถือ/แท็บเล็ต < 1024px ให้ `variant="cards"`; ห้ามปล่อยตารางกว้างล้นหน้า — อนุญาตให้เลื่อนได้เฉพาะในกรอบ `overflow-x-auto` ของตารางเอง

### Overlay / นำทาง

| Component | หมายเหตุ |
|---|---|
| `Dialog`, `AlertDialog`, `AnimatedDialog` | ปิดด้วย Esc, โฟกัสกลับจุดเดิม, `bg-black/50` |
| `Sheet`, `Drawer`, `Popover`, `HoverCard`, `DropdownMenu`, `Command` (palette), `Tooltip` | Radix ทั้งชุด |
| `Breadcrumb`, `Tabs`, `Accordion`, `Collapsible`, `Pagination`, `ScrollArea`, `Separator` | — |
| `Card` | `rounded-xl border border-border bg-card` + `p-5` |

### ข้อมูลบุคคล/สถานะเฉพาะธุรกิจ

| Component | ใช้ที่ |
|---|---|
| `EmployeeAvatar` (`status` = online/away/offline/busy) | รายชื่อช่าง, ผู้รับงาน |
| `EquipmentStatus` | สถานะเครื่องจักร |
| `NotificationCenter`, `NotificationBell` | popover แจ้งเตือน — `aria-label` ต้องมีจำนวน unread |
| `Attachment` | ไฟล์แนบ/รูปก่อน-หลังซ่อม |

## 3. โดเมนงานซ่อม (`@/components/supervisor`)

| Component | Export | ใช้ที่ |
|---|---|---|
| `StatusChip.tsx` | `StatusChip`, `PriorityChip`, `andonOf`, `fmtDT`, `fmtDate` | ป้ายสถานะ/ความสำคัญ/รูปแบบวันที่ **ชุดเดียว** ทั้งคิวและ detail (ห้ามเขียน mapping ใหม่ในหน้า) |
| `WorkActions.tsx` | `AssignDialog`, `PauseDialog`, `ResumeButton`, `VerifyDialog`, `CloseButton`, `ReopenDialog` | ปุ่มเปลี่ยนสถานะใบงาน — ทุกตัวเรียก API เดิมและมี CSRF ผ่าน interceptor |
| `WorkOrderTrendChart.tsx` | `WorkOrderTrendChart` (`TrendPoint`) | กราฟแนวโน้ม (Recharts) — ต้อง lazy + skeleton |

## 4. โครงหน้าแบบมาตรฐาน (คัดลอกจากนี้)

```tsx
<div className="w-full space-y-6">
  <PageHeader
    title="ชื่อหน้า"
    description="คำอธิบายหนึ่งบรรทัด"
    breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ชื่อหน้า" }]}
    primaryAction={<Button variant="primary">แจ้งซ่อมใหม่</Button>}
  />
  <KpiStrip items={kpis} ariaLabel="สรุป" />
  <ListToolbar search={{ value, onChange, placeholder: "ค้นหา…" }} filters={<>…</>} activeFilterCount={n} onReset={reset} />
  <DataTable columns={columns} data={rows} variant="cards" exportFileName="work-orders" />
</div>
```

## 5. สิ่งที่ห้ามทำ

- ห้ามใช้ `components/ui/page-header.tsx` (ตัวเก่า) ในหน้าใหม่ — ใช้ `layout/PageHeader` หรือ `layout/DetailHeader`
- ห้าม hard-code hex ในหน้า — ใช้ token/คลาส semantic (ยกเว้นเอกสารพิมพ์ที่คง inline style เดิมไว้ แต่สีต้องผ่าน AA)
- ห้าม import `@heroicons/react` ในไฟล์ใหม่ — ใช้ `lucide-react` (strokeWidth 1.75)
- ห้ามสร้างป้ายสถานะ/ตัวกรอง/ตารางชุดใหม่ ถ้ามีของกลางอยู่แล้วในตารางข้างบน
- ห้ามแก้ logic ใน component กลางเพื่อให้หน้าใดหน้าหนึ่งผ่าน — แก้ที่หน้า

## 6. สถานะของหน้า demo

`/ui-demo` และ `/ui-kit` ถูกลบใน Phase 2 (2026-11-23) — ตัวอย่างการใช้งานจริงดูได้จาก `/supervisor`, `/supervisor/queue`, `/repair/view` ซึ่งเป็น reference implementation ของชุดนี้
