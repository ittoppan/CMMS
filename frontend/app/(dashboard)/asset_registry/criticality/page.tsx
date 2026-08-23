"use client";

// asset_registry/criticality — migrate ui kit (PageShell, ui/Card, ui/Select, ui/Button, Lucide)
// business logic ครบเดิม: fetch index.php?resource=assets, PUT asset_registry.php (criticality), scoring matrix

import { useState, useEffect } from "react";
import { useToast } from "@/components/ToastProvider";
import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Scale,
  Calculator,
} from "lucide-react";

const FACTORS = [
  {
    key: "productionImpact",
    label: "1. ผลกระทบต่อไลน์การผลิต",
    options: [
      { value: "3", label: "3 - วิกฤต: ไลน์การผลิตหยุดทำงานทันที" },
      { value: "2", label: "2 - ปานกลาง: ผลิตช้าลง หรือใช้เครื่องอื่นแทนได้ชั่วคราว" },
      { value: "1", label: "1 - ต่ำ: ไม่มีผลกระทบต่อไลน์หลัก" },
    ],
  },
  {
    key: "safetyImpact",
    label: "2. ผลกระทบด้านความปลอดภัยและสิ่งแวดล้อม (EHS)",
    options: [
      { value: "3", label: "3 - วิกฤต: เสี่ยงต่อการเกิดอุบัติเหตุรุนแรง / สารเคมีรั่วไหล" },
      { value: "2", label: "2 - ปานกลาง: เสี่ยงเล็กน้อย บาดเจ็บขั้นปฐมพยาบาล" },
      { value: "1", label: "1 - ต่ำ: ไม่มีผลกระทบด้านความปลอดภัย" },
    ],
  },
  {
    key: "repairCost",
    label: "3. ค่าใช้จ่ายและระยะเวลาในการซ่อม",
    options: [
      { value: "3", label: "3 - วิกฤต: ค่าซ่อมสูงมาก & อะไหล่ต้องสั่งจากต่างประเทศ (>30 วัน)" },
      { value: "2", label: "2 - ปานกลาง: อะไหล่มีในประเทศ ใช้เวลาซ่อม 1-3 วัน" },
      { value: "1", label: "1 - ต่ำ: ค่าซ่อมต่ำ อะไหล่มีพร้อมในคลัง" },
    ],
  },
  {
    key: "failureFrequency",
    label: "4. ความถี่ในการเกิดเครื่องเสีย (MTBF)",
    options: [
      { value: "3", label: "3 - บ่อย: เสียสัปดาห์ละหลายครั้ง (MTBF < 100 ชม.)" },
      { value: "2", label: "2 - ปานกลาง: เสียเดือนละ 1-2 ครั้ง" },
      { value: "1", label: "1 - นานๆ ครั้ง: เสียปีละไม่เกิน 1-2 ครั้ง" },
    ],
  },
];

// น้ำหนัก: production 3, safety 3, repairCost 2, failureFrequency 2 (รวม 30 คะแนน)
const WEIGHTS: Record<string, number> = {
  productionImpact: 3,
  safetyImpact: 3,
  repairCost: 2,
  failureFrequency: 2,
};

export default function AssetCriticalityPage() {
  const [assets, setAssets] = useState<{ value: string; label: string; raw: any }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedMachine, setSelectedMachine] = useState("");
  const [currentRank, setCurrentRank] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  const [scores, setScores] = useState<Record<string, string>>({
    productionImpact: "3",
    safetyImpact: "3",
    repairCost: "2",
    failureFrequency: "2",
  });

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/index.php?resource=assets");
      const json = await res.json();
      if (Array.isArray(json.data)) {
        setAssets(
          json.data.map((a: any) => ({
            value: String(a.id),
            label: `${a.name}${a.code ? ` (${a.code})` : ""}${a.criticality ? ` • เกรด ${a.criticality}` : ""}`,
            raw: a,
          }))
        );
      }
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดรายการเครื่องจักรได้");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const handleSelect = (value: string) => {
    setSelectedMachine(value);
    const asset = assets.find((a) => a.value === value)?.raw;
    if (asset?.criticality) {
      setCurrentRank(asset.criticality);
    } else {
      setCurrentRank("");
    }
  };

  const totalScore =
    Number(scores.productionImpact) * WEIGHTS.productionImpact +
    Number(scores.safetyImpact) * WEIGHTS.safetyImpact +
    Number(scores.repairCost) * WEIGHTS.repairCost +
    Number(scores.failureFrequency) * WEIGHTS.failureFrequency;

  const rank = totalScore >= 24 ? "A" : totalScore >= 16 ? "B" : "C";

  const handleSave = async () => {
    if (!selectedMachine) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/asset_registry.php?id=${Number(selectedMachine)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criticality: rank }),
      });
      const json = await res.json();
      if (json.success) {
        setCurrentRank(rank);
        showToast("success", `บันทึกการจัดเกรดเครื่องจักรเป็นเกรด ${rank} เรียบร้อยแล้ว`);
        fetchAssets();
      } else {
        setError(json.error || "ไม่สามารถบันทึกได้");
      }
    } catch (e) {
      console.error(e);
      setError("เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่");
    }
    setSubmitting(false);
  };

  return (
    <PageShell
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "เครื่องจักร", href: "/asset_registry" }, { label: "ประเมินลำดับความสำคัญของเครื่องจักร" }]}
      title="ประเมินลำดับความสำคัญของเครื่องจักร"
      description="ประเมินความเสี่ยงและผลกระทบเพื่อจัดเกรดเครื่องจักรเป็นเกรด A, B, C อัตโนมัติ"
      actions={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <Scale size={14} strokeWidth={1.75} aria-hidden="true" />
          เมทริกซ์ความเสี่ยง
        </span>
      }
    >
      {error && (
        <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />
      )}

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-16">
            <Spinner size={20} label="" />
            <span className="text-sm text-muted-foreground">กำลังโหลดข้อมูลเครื่องจักร...</span>
          </CardContent>
        </Card>
      ) : (
        <Grid columns={3} gap={6}>
          {/* คอลัมน์ซ้าย: ฟอร์มประเมิน */}
          <div style={{ gridColumn: "span 2" }}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>1. เลือกเครื่องจักรและระบุปัจจัยความเสี่ยง</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="f-asset">เลือกเครื่องจักรที่ต้องการประเมิน <span className="text-destructive">*</span></Label>
                  <Select
                    value={selectedMachine}
                    onValueChange={handleSelect}
                  >
                    <SelectTrigger id="f-asset" aria-label="เลือกเครื่องจักร">
                      <SelectValue placeholder="เลือกเครื่องจักร..." />
                    </SelectTrigger>
                    <SelectContent>
                      {assets.map((a) => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4">
                  {FACTORS.map((factor) => (
                    <div key={factor.key} className="space-y-1.5">
                      <Label htmlFor={`f-${factor.key}`}>{factor.label} <span className="text-destructive">*</span></Label>
                      <Select
                        value={scores[factor.key]}
                        onValueChange={(v) => setScores({ ...scores, [factor.key]: String(v) })}
                      >
                        <SelectTrigger id={`f-${factor.key}`} aria-label={factor.label}>
                          <SelectValue placeholder="เลือกระดับ" />
                        </SelectTrigger>
                        <SelectContent>
                          {factor.options.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* คอลัมน์ขวา: ผลการประเมิน */}
          <div className="space-y-4">
            <Card
              className="text-center"
              style={{
                backgroundColor:
                  rank === "A" ? "var(--cmms-danger-light)"
                  : rank === "B" ? "var(--cmms-warning-light)"
                  : undefined,
                borderWidth: 2,
                borderColor:
                  rank === "A" ? "var(--cmms-danger)"
                  : rank === "B" ? "var(--cmms-warning)"
                  : "var(--cmms-border)",
              }}
            >
              <CardContent className="flex flex-col items-center gap-3 space-y-0 p-5">
                <Calculator
                  size={32}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  style={{
                    color:
                      rank === "A" ? "var(--cmms-danger)"
                      : rank === "B" ? "var(--cmms-warning)"
                      : "var(--cmms-primary)",
                  }}
                />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">คะแนนประเมินรวม</p>
                  <p className="text-[42px] font-semibold leading-tight tabular-nums">
                    {totalScore} <span className="text-lg font-normal text-muted-foreground">/ 30</span>
                  </p>
                </div>
                <Badge
                  variant={rank === "A" ? "danger" : rank === "B" ? "warning" : "primary"}
                  className="px-4 py-1.5 text-base"
                >
                  ผลการจัดเกรด: เกรด {rank}
                </Badge>
                {currentRank && currentRank !== rank && (
                  <p className="text-sm text-muted-foreground">(ปัจจุบัน: เกรด {currentRank} — ยังไม่บันทึก)</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-5">
                <h4 className="text-base font-semibold">มาตรการดูแลตามเกรด {rank}</h4>
                {rank === "A" && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-destructive">เครื่องจักรเกรด A (วิกฤต):</p>
                    <p className="text-sm text-muted-foreground">• ต้องทำ PM เข้มงวด (รายสัปดาห์/รายเดือน)</p>
                    <p className="text-sm text-muted-foreground">• สำรองอะไหล่วิกฤต 100%</p>
                    <p className="text-sm text-muted-foreground">• ติดตั้ง IoT Sensor เฝ้าระวังตลอด 24 ชม.</p>
                  </div>
                )}
                {rank === "B" && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium" style={{ color: "var(--cmms-warning)" }}>เครื่องจักรเกรด B (สำคัญ):</p>
                    <p className="text-sm text-muted-foreground">• ทำ PM ตามรอบปกติ (รายเดือน/ราย 3 เดือน)</p>
                    <p className="text-sm text-muted-foreground">• สำรองอะไหล่ตามจุดสั่งซื้อขั้นต่ำ</p>
                  </div>
                )}
                {rank === "C" && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">เครื่องจักรเกรด C (รอง):</p>
                    <p className="text-sm text-muted-foreground">• สามารถปล่อยใช้งานจนเสียแล้วซ่อม หรือทำ PM รายปี</p>
                    <p className="text-sm text-muted-foreground">• ไม่จำเป็นต้องสต็อกอะไหล่ราคาสูง</p>
                  </div>
                )}

                <Button
                  className="mt-4 w-full"
                  disabled={submitting || !selectedMachine}
                  onClick={handleSave}
                >
                  <Scale size={16} strokeWidth={1.75} aria-hidden="true" />
                  {submitting ? "กำลังบันทึก..." : "บันทึกผลการประเมินเกรด"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </Grid>
      )}

    </PageShell>
  );
}
