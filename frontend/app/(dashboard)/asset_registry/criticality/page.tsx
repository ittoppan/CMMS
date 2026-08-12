"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ToastProvider";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Icon } from "@astryxdesign/core/Icon";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Grid } from "@astryxdesign/core/Grid";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { Selector } from "@astryxdesign/core/Selector";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import {
  ScaleIcon,
  CalculatorIcon,
} from "@heroicons/react/24/outline";

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

  if (loading) {
    return (
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดข้อมูลเครื่องจักร...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>ประเมินลำดับความสำคัญของเครื่องจักร</Heading>
            <Badge label="เมทริกซ์ความเสี่ยง" variant="info" />
          </HStack>
          <Text type="body" color="secondary">ประเมินความเสี่ยงและผลกระทบเพื่อจัดเกรดเครื่องจักรเป็นเกรด A, B, C อัตโนมัติ</Text>
        </VStack>
      </HStack>

      <Grid columns={3} gap={6}>
        {/* คอลัมน์ซ้าย: ฟอร์มประเมิน */}
        <div style={{ gridColumn: "span 2" }}>
          <Card padding={5}>
            <VStack gap={4}>
              <Heading level={4}>1. เลือกเครื่องจักรและระบุปัจจัยความเสี่ยง</Heading>

              <Field inputID="f-asset" label="เลือกเครื่องจักรที่ต้องการประเมิน *" isRequired>
                <Selector
                  label="เลือกเครื่องจักร"
                  isLabelHidden
                  placeholder="เลือกเครื่องจักร..."
                  options={assets}
                  value={selectedMachine}
                  onChange={handleSelect}
                />
              </Field>

              <FormLayout>
                <VStack gap={4}>
                  {FACTORS.map((factor) => (
                    <Field key={factor.key} inputID={`f-${factor.key}`} label={`${factor.label} *`}>
                      <Selector
                        label={factor.label}
                        isLabelHidden
                        options={factor.options}
                        value={scores[factor.key]}
                        onChange={(v) => setScores({ ...scores, [factor.key]: String(v) })}
                      />
                    </Field>
                  ))}
                </VStack>
              </FormLayout>
            </VStack>
          </Card>
        </div>

        {/* คอลัมน์ขวา: ผลการประเมิน */}
        <VStack gap={4}>
          <Card
            padding={5}
            style={{
              textAlign: "center",
              backgroundColor: rank === "A" ? "var(--color-error-wash)" : rank === "B" ? "var(--color-warning-wash)" : "var(--color-surface)",
              border: `2px solid ${rank === "A" ? "var(--color-error)" : rank === "B" ? "var(--color-warning)" : "var(--color-border)"}`,
            }}
          >
            <VStack gap={3} hAlign="center">
              <Icon icon={CalculatorIcon} size="lg" color={rank === "A" ? "error" : rank === "B" ? "warning" : "accent"} />
              <VStack gap={0}>
                <Text type="supporting" weight="bold" style={{ textTransform: "uppercase" }}>คะแนนประเมินรวม</Text>
                <Heading level={1} style={{ fontSize: 42 }}>
                  {totalScore} <span style={{ fontSize: 18, color: "var(--color-secondary)" }}>/ 30</span>
                </Heading>
              </VStack>
              <Badge label={`ผลการจัดเกรด: เกรด ${rank}`} variant={rank === "A" ? "error" : rank === "B" ? "warning" : "info"} style={{ fontSize: 16, padding: "8px 16px" }} />
              {currentRank && currentRank !== rank && (
                <Text type="body" size="sm" color="secondary">(ปัจจุบัน: เกรด {currentRank} — ยังไม่บันทึก)</Text>
              )}
            </VStack>
          </Card>

          <Card padding={5}>
            <VStack gap={3}>
              <Heading level={4}>มาตรการดูแลตามเกรด {rank}</Heading>
              {rank === "A" && (
                <VStack gap={2}>
                  <Text type="body" size="sm" style={{ color: "var(--color-error)" }} weight="semibold">เครื่องจักรเกรด A (วิกฤต):</Text>
                  <Text type="body" size="sm" color="secondary">• ต้องทำ PM เข้มงวด (รายสัปดาห์/รายเดือน)</Text>
                  <Text type="body" size="sm" color="secondary">• สำรองอะไหล่วิกฤต 100%</Text>
                  <Text type="body" size="sm" color="secondary">• ติดตั้ง IoT Sensor เฝ้าระวังตลอด 24 ชม.</Text>
                </VStack>
              )}
              {rank === "B" && (
                <VStack gap={2}>
                  <Text type="body" size="sm" style={{ color: "var(--color-warning)" }} weight="semibold">เครื่องจักรเกรด B (สำคัญ):</Text>
                  <Text type="body" size="sm" color="secondary">• ทำ PM ตามรอบปกติ (รายเดือน/ราย 3 เดือน)</Text>
                  <Text type="body" size="sm" color="secondary">• สำรองอะไหล่ตามจุดสั่งซื้อขั้นต่ำ</Text>
                </VStack>
              )}
              {rank === "C" && (
                <VStack gap={2}>
                  <Text type="body" size="sm" color="secondary" weight="semibold">เครื่องจักรเกรด C (รอง):</Text>
                  <Text type="body" size="sm" color="secondary">• สามารถปล่อยใช้งานจนเสียแล้วซ่อม หรือทำ PM รายปี</Text>
                  <Text type="body" size="sm" color="secondary">• ไม่จำเป็นต้องสต็อกอะไหล่ราคาสูง</Text>
                </VStack>
              )}

              <Button
                label={submitting ? "กำลังบันทึก..." : "บันทึกผลการประเมินเกรด"}
                variant="primary"
                isDisabled={submitting || !selectedMachine}
                onClick={handleSave}
                style={{ marginTop: 16 }}
                icon={<Icon icon={ScaleIcon} size="sm" />}
              />
            </VStack>
          </Card>
        </VStack>
      </Grid>

    </VStack>
  );
}
