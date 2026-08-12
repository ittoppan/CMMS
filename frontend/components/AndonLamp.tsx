"use client";

/**
 * AndonLamp — เสาไฟสัญญาณแบบโรงงาน (Andon tower)
 * โคมแดง/เหลือง/เขียวเรียงกัน — หลอดที่ "ติด" จะเรืองแสง + กระพริบ (เฉพาะแดง)
 * มาจากของจริงบนหัวเครื่องจักร: เขียว = พร้อมใช้งาน, เหลือง = ต้องดูแล, แดง = หยุดทำงาน
 */
export type AndonStatus = "ok" | "warn" | "down" | "idle";

const LABELS: Record<AndonStatus, string> = {
  ok: "พร้อมใช้งาน",
  warn: "ต้องดูแล",
  down: "หยุดทำงาน",
  idle: "ไม่มีการทำงาน",
};

export default function AndonLamp({
  status = "idle",
  size = "md",
  showLabel = false,
}: {
  status?: AndonStatus;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}) {
  const px = size === "sm" ? 6 : size === "lg" ? 12 : 9;
  const gap = size === "sm" ? 2 : 3;
  return (
    <span
      className={`cmms-andon lit-${status}`}
      role="img"
      aria-label={`สถานะ: ${LABELS[status]}`}
      title={LABELS[status]}
      style={showLabel ? { flexDirection: "row", alignItems: "center", gap: 8, padding: "4px 10px 4px 6px" } : undefined}
    >
      <span
        className="cmms-andon-lamp down"
        style={{ width: px, height: px }}
      />
      <span
        className="cmms-andon-lamp warn"
        style={{ width: px, height: px, marginTop: gap }}
      />
      <span
        className="cmms-andon-lamp ok"
        style={{ width: px, height: px, marginTop: gap }}
      />
      {showLabel && (
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "inherit" }}>
          {LABELS[status]}
        </span>
      )}
    </span>
  );
}
