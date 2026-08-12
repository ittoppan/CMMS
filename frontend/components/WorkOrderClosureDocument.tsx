"use client";

export interface WorkOrderDocData {
  id: number;
  workOrderNo: string;
  assetName: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignedName: string;
  receiverName: string;
  beforeImg: string;
  afterImg: string;
  receiverSignature: string;
  completedAt: string;
  createdDate: string;
  rootCause: string;
  solution: string;
  costParts: number;
  costLabor: number;
  costOutsource: number;
  downtimeMinutes: number;
  parts: WorkOrderPart[];
}

export interface WorkOrderPart {
  code: string;
  name: string;
  quantity_used: number;
  unit_price: number;
}

const statusLabels: Record<string, string> = {
  completed: "เสร็จสิ้น", closed: "ปิดงาน", resolved: "แก้ไขแล้ว",
  in_progress: "กำลังซ่อม", waiting_parts: "รออะไหล่", pending_parts: "รออะไหล่",
  open: "รอดำเนินการ", pending: "รอดำเนินการ", overdue: "เกินกำหนด",
};

const priorityLabels: Record<string, string> = {
  critical: "วิกฤต", high: "สูง", medium: "ปานกลาง", low: "ต่ำ",
};

export default function WorkOrderClosureDocument({ wo }: { wo: WorkOrderDocData }) {
  const status = String(wo.status || "").toLowerCase();
  const priority = String(wo.priority || "").toLowerCase();
  const total = (wo.costParts || 0) + (wo.costLabor || 0) + (wo.costOutsource || 0);
  const partsTotal = (wo.parts || []).reduce(
    (s, p) => s + (Number(p.quantity_used) || 0) * (Number(p.unit_price) || 0),
    0
  );

  const statusBg =
    status === "completed" || status === "closed" || status === "resolved" ? "#DCFCE7"
    : status === "in_progress" || status === "waiting_parts" || status === "pending_parts" ? "#DBEAFE"
    : status === "overdue" ? "#FEE2E2"
    : "#FEF3C7";

  const priorityBg =
    priority === "critical" ? "#FEE2E2"
    : priority === "high" ? "#FFEDD5"
    : priority === "low" ? "#F0FDF4"
    : "#E0E7FF";

  return (
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
        background: "#FFFFFF",
        color: "#1E293B",
        padding: 28,
        fontFamily: "inherit",
      }}
    >
      {/* Document Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #0F172A", paddingBottom: 16 }}>
        <div>
          <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#475569", letterSpacing: 1 }}>
            บริษัท ท็อปพาน เฟล็กซิเบิ้ล แพคเกจจิ้ง (ประเทศไทย) จำกัด
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#0F172A", marginTop: 2 }}>
            ใบส่งมอบและปิดงานซ่อมบำรุง (F-EN-03)
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#3B82F6" }}>{wo.workOrderNo}</div>
          <div style={{ fontSize: "0.8rem", color: "#64748B", marginTop: 2 }}>วันที่ปิดงาน: {wo.completedAt}</div>
          <div style={{ fontSize: "0.8rem", color: "#64748B", marginTop: 2 }}>วันที่แจ้ง: {wo.createdDate}</div>
        </div>
      </div>

      {/* Status & Priority Strip */}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 999, background: statusBg, color: "#0F172A" }}>
          สถานะ: {statusLabels[status] || wo.status || "รอดำเนินการ"}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 999, background: priorityBg, color: "#0F172A" }}>
          ความเร่งด่วน: {priorityLabels[priority] || wo.priority || "ปานกลาง"}
        </span>
      </div>

      {/* Machine & Problem Summary Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
        <div style={{ background: "#F8FAFC", padding: 16, borderRadius: 10, border: "1px solid #E2E8F0" }}>
          <div style={{ fontSize: 12, color: "#64748B" }}>เครื่องจักร / อุปกรณ์:</div>
          <div style={{ fontWeight: 700, marginTop: 2 }}>{wo.assetName}</div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 8 }}>หัวข้ออาการเสีย:</div>
          <div style={{ fontWeight: 600, marginTop: 2 }}>{wo.title}</div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 8 }}>รายละเอียด / อาการ:</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>{wo.description}</div>
        </div>

        <div style={{ background: "#F8FAFC", padding: 16, borderRadius: 10, border: "1px solid #E2E8F0" }}>
          <div style={{ fontSize: 12, color: "#64748B" }}>ผู้รับผิดชอบงานซ่อม:</div>
          <div style={{ fontWeight: 700, color: "#2563EB", marginTop: 2 }}>{wo.assignedName}</div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 8 }}>ผู้รับมอบงานซ่อมเสร็จ:</div>
          <div style={{ fontWeight: 700, color: "#16A34A", marginTop: 2 }}>{wo.receiverName || "-"}</div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 8 }}>เวลาซ่อม (Downtime):</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>{wo.downtimeMinutes > 0 ? `${wo.downtimeMinutes} นาที` : "-"}</div>
        </div>
      </div>

      {/* Before / After Photos */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
        <div style={{ border: "2px dashed #EF4444", borderRadius: 12, padding: 12, background: "#FEF2F2" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>🔴 รูปถ่ายก่อนซ่อม / จุดชำรุด</div>
          <div style={{ width: "100%", height: 200, borderRadius: 8, overflow: "hidden", background: "#CBD5E1", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {wo.beforeImg ? (
              <img src={wo.beforeImg} alt="รูปถ่ายก่อนซ่อม" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 12, color: "#64748B" }}>ไม่มีรูปถ่ายก่อนซ่อม</span>
            )}
          </div>
        </div>
        <div style={{ border: "2px solid #10B981", borderRadius: 12, padding: 12, background: "#ECFDF5" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#16A34A" }}>🟢 รูปถ่ายหลังซ่อมเสร็จ</div>
          <div style={{ width: "100%", height: 200, borderRadius: 8, overflow: "hidden", background: "#CBD5E1", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {wo.afterImg ? (
              <img src={wo.afterImg} alt="รูปถ่ายหลังซ่อม" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: 12, color: "#64748B" }}>ไม่มีรูปถ่ายหลังซ่อม</span>
            )}
          </div>
        </div>
      </div>

      {/* Repair Solution & Cost Summary */}
      <div style={{ background: "#F1F5F9", padding: 16, borderRadius: 12, border: "1px solid #CBD5E1", marginTop: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>🔧 รายละเอียดการซ่อมและสาเหตุของปัญหา</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>สาเหตุของปัญหา:</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{wo.rootCause}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>วิธีการแก้ไข:</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{wo.solution}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 10, paddingTop: 10, borderTop: "1px solid #94A3B8", flexWrap: "wrap" }}>
          <div style={{ fontSize: 13 }}>ค่าอะไหล่: <b>฿{(wo.costParts || 0).toLocaleString()}</b></div>
          <div style={{ fontSize: 13 }}>ค่าแรง: <b>฿{(wo.costLabor || 0).toLocaleString()}</b></div>
          {wo.costOutsource > 0 && <div style={{ fontSize: 13 }}>จ้างภายนอก: <b>฿{(wo.costOutsource || 0).toLocaleString()}</b></div>}
          <div style={{ fontSize: 13, fontWeight: 800, color: "#2563EB" }}>รวมค่าใช้จ่าย: ฿{total.toLocaleString()}</div>
        </div>
      </div>

      {/* Spare Parts Used */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>🔩 อะไหล่ที่ใช้ซ่อม</div>
        {wo.parts && wo.parts.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, border: "1px solid #CBD5E1" }}>
            <thead>
              <tr style={{ background: "#F1F5F9", textAlign: "left" }}>
                <th style={{ padding: "8px 10px", border: "1px solid #CBD5E1" }}>รหัส</th>
                <th style={{ padding: "8px 10px", border: "1px solid #CBD5E1" }}>ชื่ออะไหล่</th>
                <th style={{ padding: "8px 10px", border: "1px solid #CBD5E1", textAlign: "right" }}>จำนวน</th>
                <th style={{ padding: "8px 10px", border: "1px solid #CBD5E1", textAlign: "right" }}>ราคา/หน่วย</th>
                <th style={{ padding: "8px 10px", border: "1px solid #CBD5E1", textAlign: "right" }}>รวม</th>
              </tr>
            </thead>
            <tbody>
              {(wo.parts || []).map((p, i) => {
                const qty = Number(p.quantity_used) || 0;
                const price = Number(p.unit_price) || 0;
                return (
                  <tr key={i} style={{ background: i % 2 ? "#F8FAFC" : "#FFFFFF" }}>
                    <td style={{ padding: "8px 10px", border: "1px solid #CBD5E1", fontFamily: "monospace", fontSize: 12 }}>{p.code || "-"}</td>
                    <td style={{ padding: "8px 10px", border: "1px solid #CBD5E1" }}>{p.name || "-"}</td>
                    <td style={{ padding: "8px 10px", border: "1px solid #CBD5E1", textAlign: "right" }}>{qty}</td>
                    <td style={{ padding: "8px 10px", border: "1px solid #CBD5E1", textAlign: "right" }}>฿{price.toLocaleString()}</td>
                    <td style={{ padding: "8px 10px", border: "1px solid #CBD5E1", textAlign: "right", fontWeight: 700 }}>฿{(qty * price).toLocaleString()}</td>
                  </tr>
                );
              })}
              {partsTotal > 0 && (
                <tr style={{ background: "#F1F5F9", fontWeight: 800 }}>
                  <td colSpan={4} style={{ padding: "8px 10px", border: "1px solid #CBD5E1", textAlign: "right" }}>รวมค่าวัสดุ</td>
                  <td style={{ padding: "8px 10px", border: "1px solid #CBD5E1", textAlign: "right" }}>฿{partsTotal.toLocaleString()}</td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 13, color: "#64748B", padding: "10px 12px", border: "1px dashed #CBD5E1", borderRadius: 8, background: "#F8FAFC" }}>
            ไม่มีอะไหล่ที่เบิกใช้ในการซ่อมครั้งนี้
          </div>
        )}
      </div>

      {/* Signatures */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
        <div style={{ border: "1px solid #CBD5E1", borderRadius: 12, padding: 14, textAlign: "center", background: "#FFFFFF" }}>
          <div style={{ fontSize: 12, color: "#64748B" }}>ลายเซ็นช่างผู้ซ่อม</div>
          <div style={{ width: "80%", height: 80, border: "1px dashed #CBD5E1", borderRadius: 8, margin: "8px auto", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFC" }}>
            <span style={{ fontSize: 12, color: "#64748B" }}>ลายเซ็น</span>
          </div>
          <div style={{ fontWeight: 700 }}>{wo.assignedName}</div>
          <div style={{ fontSize: 12, color: "#64748B" }}>แผนกซ่อมบำรุง</div>
        </div>

        <div style={{ border: "2px solid #10B981", borderRadius: 12, padding: 14, textAlign: "center", background: "#ECFDF5" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#16A34A" }}>✓ ตรวจรับมอบงานเสร็จสมบูรณ์</div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>ลายเซ็นผู้รับมอบงาน</div>
          <div style={{ width: "80%", height: 80, border: "1px dashed #10B981", borderRadius: 8, margin: "8px auto", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFFFF" }}>
            {wo.receiverSignature ? (
              <img src={wo.receiverSignature} alt="ลายเซ็นผู้รับมอบงาน" style={{ maxHeight: 70, maxWidth: "90%" }} />
            ) : (
              <span style={{ fontSize: 12, color: "#64748B" }}>ยังไม่มีลายเซ็น</span>
            )}
          </div>
          <div style={{ fontWeight: 700 }}>{wo.receiverName || "-"}</div>
          <div style={{ fontSize: 12, color: "#64748B" }}>วันที่ตรวจรับ: {wo.completedAt}</div>
        </div>
      </div>
    </div>
  );
}
