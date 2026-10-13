"use client";

// /process-flows — Visual Process Flows: แผนผังขั้นตอนหลักของกระบวนการซ่อมบำรุง
// (แบบ static/documentation — happy path + สถานะแยกจากสายหลัก ตรงตาม workflow ของระบบ)

import { Fragment } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  CalendarDays,
  Ruler,
  ShieldCheck,
  ShoppingCart,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { Card, CardContent } from "@/components/ui/card";
import { usePageHero, useLang } from "@/lib/i18n";
import { cn } from "@/lib/cn";

interface PfStep {
  label: string;
  note?: string;
  wait?: boolean;
}

interface PfFlow {
  id: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  steps: PfStep[];
  branchTitle: string;
  branches: { from: string; to: string }[];
}

const TH_FLOWS: PfFlow[] = [
  {
    id: "repair",
    icon: Wrench,
    title: "งานซ่อม (Corrective Maintenance)",
    desc: "ตั้งแต่แจ้งซ่อมจนปิดใบงาน พร้อมสถานะรองระหว่างดำเนินการ",
    steps: [
      { label: "แจ้งซ่อม", note: "draft → open" },
      { label: "พิจารณา & อนุมัติ", note: "ผู้มีอำนาจอนุมัติ (waiting_approval)" },
      { label: "มอบหมายช่าง", note: "assign → รับโดยหัวหน้าชุด" },
      { label: "รับงาน", note: "accepted" },
      { label: "ดำเนินการซ่อม", note: "อาจพัก / รออะไหล่ / รอภายนอก", wait: true },
      { label: "ตรวจรับงาน", note: "completed → verify" },
      { label: "ปิดใบงาน", note: "closed" },
    ],
    branchTitle: "สาขาแยกจากสายหลัก",
    branches: [
      { from: "ก่อนงานเสร็จ", to: "cancelled / rejected" },
      { from: "เกินกำหนด SLA", to: "flag ความสำคัญ + แจ้งเตือน" },
    ],
  },
  {
    id: "pm",
    icon: CalendarDays,
    title: "แผน PM/AM (Preventive Maintenance)",
    desc: "วางแผนและปฏิบัติงานบำรุงรักษาเชิงป้องกันตามรอบ",
    steps: [
      { label: "สร้างแผน PM", note: "draft → active" },
      { label: "กำหนดรอบ & ตาราง", note: "batch schedule / ปฏิทิน" },
      { label: "ถึงกำหนดรอบ", note: "pending — due_date มาถึง", wait: true },
      { label: "วางแผนรอบงาน", note: "จัดงาน/คนตามรอบ" },
      { label: "ปฏิบัติงาน PM", note: "in_progress", wait: true },
      { label: "บันทึกผล + หลักฐาน", note: "เช็คชีท รูปถ่าย ระยะเวลา" },
      { label: "เสร็จรอบถัดไป", note: "completed / completed_early → กำหนดรอบใหม่" },
    ],
    branchTitle: "สาขาแยกจากสายหลัก",
    branches: [
      { from: "เลยกำหนดรอบ", to: "overdue (แจ้งเตือน)" },
      { from: "เลื่อน / ข้ามรอบ", to: "skipped" },
    ],
  },
  {
    id: "spare",
    icon: ShoppingCart,
    title: "เบิกจ่ายอะไหล่ (Issue Center)",
    desc: "เบิก-จ่ายอะไหล่ตั้งแต่ขอเบิก ตัดสต็อก จนบันทึกยอดและยอดคืน",
    steps: [
      { label: "ขอเบิก", note: "pending — รออนุมัติ" },
      { label: "อนุมัติยอด", note: "approved" },
      { label: "เบิกจ่าย", note: "ตัดสต็อก real-time" },
      { label: "บันทึกยอดเข้า SAGE", note: "ปิดยอดอัตโนมัติ" },
      { label: "คืนของส่วนเกิน", note: "returns — ยอดไม่ใช้คืนคลัง", wait: true },
    ],
    branchTitle: "สาขาแยกจากสายหลัก",
    branches: [{ from: "ก่อนจ่าย", to: "cancelled / rejected" }],
  },
  {
    id: "calibration",
    icon: Ruler,
    title: "สอบเทียบเครื่องมือวัด (Calibration)",
    desc: "รอบสอบเทียบ ตั้งแต่กำหนดรอบ ตรวจสอบผล จนออกใบรับรอง",
    steps: [
      { label: "กำหนดรอบสอบเทียบ", note: "แผน: draft / active + ปฏิทิน" },
      { label: "ถึงกำหนด / ล่วง", note: "scheduled → pending / overdue", wait: true },
      { label: "เริ่มสอบเทียบ", note: "in_progress — บันทึกจุดวัด" },
      { label: "ส่งผลตรวจสอบ", note: "pending_review" },
      { label: "อนุมัติผล", note: "approved → บันทึกประวัติ + ใบรับรอง" },
      { label: "คำนวณรอบถัดไป", note: "จากช่วงสอบเทียบอัตโนมัติ" },
    ],
    branchTitle: "สาขาแยกจากสายหลัก",
    branches: [
      { from: "ผลไม่ผ่าน", to: "rejected → แก้ไข/สอบเทียบใหม่" },
      { from: "ค่าเกินพิกัด (OOT)", to: "เปิดสอบสวน OOT" },
    ],
  },
  {
    id: "rca",
    icon: Activity,
    title: "วิเคราะห์สาเหตุราก (RCA)",
    desc: "วิเคราะห์เหตุขัดข้อง สู่มาตรการแก้ไข และยืนยันผลการดำเนินการ",
    steps: [
      { label: "เปิดเหตุการณ์", note: "open" },
      { label: "ตรวจสอบข้อมูล", note: "investigating — 5-Why / Ishikawa" },
      { label: "ระบุสาเหตุราก", note: "root_cause_identified" },
      { label: "ลงปฏิบัติแก้ไข", note: "action: proposed → approved → applied", wait: true },
      { label: "ยืนยันผล", note: "verification — ปิดการกระทำด้วยหลักฐาน" },
      { label: "ปิดเคส", note: "closed" },
    ],
    branchTitle: "สาขาแยกจากสายหลัก",
    branches: [
      { from: "เกิดซ้ำ", to: "reopened → ย้อนตรวจสอบใหม่" },
      { from: "ยกเลิก", to: "cancelled" },
    ],
  },
  {
    id: "ptw",
    icon: ShieldCheck,
    title: "ใบอนุญาตทำงานเสี่ยง (PTW)",
    desc: "ออก-อนุมัติ-ปฏิบัติ-ปิดใบอนุญาตทำงานเสี่ยง ตามเงื่อนไขความปลอดภัย",
    steps: [
      { label: "สร้างใบอนุญาต", note: "draft" },
      { label: "ส่งพิจารณา", note: "requested" },
      { label: "ทบทวนความเสี่ยง", note: "risk_review" },
      { label: "อนุมัติครบทุกขั้น", note: "อนุมัติรายขั้น ← ล็อก LOTO / ตรวจแก๊ส" },
      { label: "ปฏิบัติงาน", note: "active — ระงับชั่วคราว (suspended) ได้", wait: true },
      { label: "ปิดใบอนุญาต", note: "completed → closed" },
    ],
    branchTitle: "สาขาแยกจากสายหลัก",
    branches: [
      { from: "ไม่อนุมัติ", to: "rejected" },
      { from: "ระหว่างปฏิบัติ", to: "expired / requires_review" },
    ],
  },
];

const EN_FLOWS: PfFlow[] = [
  {
    id: "repair",
    icon: Wrench,
    title: "Work Orders (Corrective Maintenance)",
    desc: "From request to close, including in-progress branch statuses",
    steps: [
      { label: "Report issue", note: "draft → open" },
      { label: "Review & approve", note: "waiting_approval" },
      { label: "Assign crew", note: "assign — accepted by lead" },
      { label: "Accept task", note: "accepted" },
      { label: "Perform repair", note: "may pause / wait for parts / external", wait: true },
      { label: "Verify work", note: "completed → verify" },
      { label: "Close work order", note: "closed" },
    ],
    branchTitle: "Branches off the main path",
    branches: [
      { from: "Before completion", to: "cancelled / rejected" },
      { from: "SLA overdue", to: "flag priority + alert" },
    ],
  },
  {
    id: "pm",
    icon: CalendarDays,
    title: "PM Plan (Preventive Maintenance)",
    desc: "Plan and execute preventive maintenance on schedule",
    steps: [
      { label: "Create PM plan", note: "draft → active" },
      { label: "Set cycle & schedule", note: "batch schedule / calendar" },
      { label: "Due cycle", note: "pending — due_date reached", wait: true },
      { label: "Plan the cycle", note: "allocate jobs & people" },
      { label: "Execute PM", note: "in_progress", wait: true },
      { label: "Record result", note: "checksheet, photos, time" },
      { label: "Done, next cycle", note: "completed / completed_early → next due" },
    ],
    branchTitle: "Branches off the main path",
    branches: [
      { from: "Past due date", to: "overdue (alert)" },
      { from: "Postponed / skip", to: "skipped" },
    ],
  },
  {
    id: "spare",
    icon: ShoppingCart,
    title: "Spare Parts Issue Center",
    desc: "Request, approve, issue, deduct stock and record returns",
    steps: [
      { label: "Issue request", note: "pending — awaiting approval" },
      { label: "Approve order", note: "approved" },
      { label: "Issue parts", note: "real-time stock deduction" },
      { label: "Sync to SAGE", note: "auto close the order" },
      { label: "Return surplus", note: "returns — restock leftovers", wait: true },
    ],
    branchTitle: "Branches off the main path",
    branches: [{ from: "Before issue", to: "cancelled / rejected" }],
  },
  {
    id: "calibration",
    icon: Ruler,
    title: "Calibration",
    desc: "From scheduling the cycle to approving results and certificates",
    steps: [
      { label: "Schedule calibration", note: "plan: draft / active + calendar" },
      { label: "Due / overdue", note: "scheduled → pending / overdue", wait: true },
      { label: "Run calibration", note: "in_progress — record points" },
      { label: "Submit result", note: "pending_review" },
      { label: "Approve result", note: "approved → history + certificate" },
      { label: "Compute next due", note: "from calibration interval" },
    ],
    branchTitle: "Branches off the main path",
    branches: [
      { from: "Failing result", to: "rejected → re-calibrate" },
      { from: "Out of tolerance (OOT)", to: "open OOT investigation" },
    ],
  },
  {
    id: "rca",
    icon: Activity,
    title: "Root Cause Analysis (RCA)",
    desc: "Analyse the failure, drive corrective actions and verify the outcome",
    steps: [
      { label: "Open event", note: "open" },
      { label: "Investigate", note: "investigating — 5-Why / Ishikawa" },
      { label: "Root cause identified", note: "root_cause_identified" },
      { label: "Implement actions", note: "action: proposed → approved → applied", wait: true },
      { label: "Verify results", note: "verification — close actions with evidence" },
      { label: "Close case", note: "closed" },
    ],
    branchTitle: "Branches off the main path",
    branches: [
      { from: "Recurrence", to: "reopened → re-investigate" },
      { from: "Cancel", to: "cancelled" },
    ],
  },
  {
    id: "ptw",
    icon: ShieldCheck,
    title: "Work Permit (PTW)",
    desc: "Create, approve, execute and close a high-risk work permit safely",
    steps: [
      { label: "Create permit", note: "draft" },
      { label: "Submit", note: "requested" },
      { label: "Risk review", note: "risk_review" },
      { label: "Step-wise approval", note: "approvals ← LOTO lock / gas test" },
      { label: "Execute work", note: "active — suspend-able (suspended)", wait: true },
      { label: "Close permit", note: "completed → closed" },
    ],
    branchTitle: "Branches off the main path",
    branches: [
      { from: "Not approved", to: "rejected" },
      { from: "During work", to: "expired / requires_review" },
    ],
  },
];

function StepNode({ index, step }: { index: number; step: PfStep }) {
  const wait = Boolean(step.wait);
  return (
    <div
      className={cn(
        "flex w-auto max-w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5",
        wait ? "border-[var(--cmms-warning)] bg-secondary" : "border-border bg-card"
      )}
    >
      <span
        className={cn(
          "flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold",
          wait ? "bg-[var(--cmms-warning)] text-white" : "bg-secondary text-muted-foreground"
        )}
        aria-hidden="true"
      >
        {index + 1}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-tight text-foreground">{step.label}</span>
        {step.note && (
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{step.note}</span>
        )}
      </span>
    </div>
  );
}

function DoneNode({ index, label, note }: { index: number; label: string; note?: string }) {
  return (
    <div className="flex w-auto max-w-full items-center gap-2.5 rounded-xl border border-primary bg-primary px-3.5 py-2.5 text-white">
      <span
        className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-[0.7rem] font-bold"
        aria-hidden="true"
      >
        {index + 1}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-tight">{label}</span>
        {note && <span className="mt-0.5 block text-xs leading-snug text-white/80">{note}</span>}
      </span>
    </div>
  );
}

function FlowCard({ flow }: { flow: PfFlow }) {
  const Icon = flow.icon;
  const last = flow.steps.length - 1;

  return (
    <Card id={`pf-${flow.id}`} className="scroll-mt-24">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight text-foreground">{flow.title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{flow.desc}</p>
          </div>
        </div>

        {/* Desktop / tablet: horizontal lane */}
        <div className="hidden items-center gap-x-2 gap-y-3 lg:flex lg:flex-wrap">
          {flow.steps.map((step, i) => (
            <Fragment key={`${flow.id}-h-${i}`}>
              {i > 0 && <ArrowRight size={16} strokeWidth={2} aria-hidden="true" className="shrink-0 text-muted-foreground" />}
              {i === last ? (
                <DoneNode index={i} label={step.label} note={step.note} />
              ) : (
                <StepNode index={i} step={step} />
              )}
            </Fragment>
          ))}
        </div>

        {/* Mobile: vertical lane */}
        <div className="flex flex-col items-stretch gap-1.5 lg:hidden">
          {flow.steps.map((step, i) => (
            <Fragment key={`${flow.id}-v-${i}`}>
              {i > 0 && <ArrowDown size={16} strokeWidth={2} aria-hidden="true" className="mx-auto shrink-0 text-muted-foreground" />}
              {i === last ? (
                <DoneNode index={i} label={step.label} note={step.note} />
              ) : (
                <StepNode index={i} step={step} />
              )}
            </Fragment>
          ))}
        </div>

        {flow.branches.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
              {flow.branchTitle}
            </p>
            <div className="flex flex-wrap gap-2">
              {flow.branches.map((b, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--cmms-danger)] bg-card px-2.5 py-1 text-xs text-[var(--cmms-danger)]"
                >
                  <span className="font-medium">{b.from}</span>
                  <ArrowRight size={12} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                  <span>{b.to}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProcessFlowsPage() {
  const hero = usePageHero("process_flows");
  const lang = useLang();
  const flows = lang === "th" ? TH_FLOWS : EN_FLOWS;
  const legendLabel = lang === "th"
    ? {
        step: "ขั้นตอนหลัก",
        wait: "รอ / ค้าง",
        done: "จบกระบวนการ",
        branch: "สาขาแยก",
        how: "แผนผังแสดงขั้นตอนหลัก (happy path) ของแต่ละกระบวนการ — สถานะที่แยกออกจากสายหลักแสดงในช่อง “สาขาแยก” ด้านล่าง",
      }
    : {
        step: "Main step",
        wait: "Wait / hold",
        done: "Done",
        branch: "Branch",
        how: "Diagrams show the main (happy path) steps — statuses that leave the main path are listed under “Branches” below",
      };

  const legendItems = [
    { key: "step", cls: "border-border bg-card text-foreground" },
    { key: "wait", cls: "border-[var(--cmms-warning)] bg-secondary text-foreground" },
    { key: "done", cls: "border-primary bg-primary text-white" },
    { key: "branch", cls: "border-dashed border-[var(--cmms-danger)] bg-card text-[var(--cmms-danger)]" },
  ];

  return (
    <PageShell
      breadcrumbs={[{ label: lang === "th" ? "หน้าแรก" : "Home", href: "/dashboard" }, { label: hero.title }]}
      eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
      title={hero.title}
      description={hero.desc}
    >
      <div className="space-y-5">
        <p className="max-w-3xl text-sm text-muted-foreground">{legendLabel.how}</p>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2">
          {legendItems.map((it) => (
            <span
              key={it.key}
              className={cn(
                "inline-flex items-center rounded-lg border px-2.5 py-1 text-xs",
                it.cls
              )}
            >
              {legendLabel[it.key as keyof typeof legendLabel]}
            </span>
          ))}
        </div>

        {/* Quick jump */}
        <nav aria-label={lang === "th" ? "ข้ามไปยังกระบวนการ" : "Jump to process"} className="flex flex-wrap items-center gap-2">
          {flows.map((f) => (
            <a
              key={f.id}
              href={`#pf-${f.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              style={{ textDecoration: "none" }}
            >
              <f.icon size={13} strokeWidth={1.75} aria-hidden="true" />
              {f.title.split(" (")[0]}
            </a>
          ))}
        </nav>

        <div className="grid gap-5">
          {flows.map((flow) => (
            <FlowCard key={flow.id} flow={flow} />
          ))}
        </div>
      </div>
    </PageShell>
  );
}