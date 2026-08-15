"use client";

export interface PMCheckItem {
  task: string;
  type: "check" | "value";
  status: "pass" | "fail" | null;
  value: string;
  note: string;
}

export interface PMChecksheetData {
  id: number | string;
  title: string;
  assetName: string;
  frequency: string;
  dueDate: string;
  assignee: string;
  checklist: PMCheckItem[];
  inspectorSignature: string;
  operatorSignature: string;
  operatorName: string;
  inspectorName: string;
  doneAt: string;
  notes: string;
}

const freqLabels: Record<string, string> = {
  daily: "รายวัน",
  weekly: "รายสัปดาห์",
  monthly: "รายเดือน",
  quarterly: "รายไตรมาส",
  yearly: "รายปี",
};

const sigSrc = (s: string) =>
  s ? (s.startsWith("data:") ? s : `data:image/png;base64,${s}`) : "";

export default function PMChecksheetDocument({ data }: { data: PMChecksheetData }) {
  const failCount = data.checklist.filter((i) => i.status === "fail").length;
  const resultText =
    data.notes ||
    (failCount > 0 ? `พบรายการไม่ผ่าน ${failCount} รายการ` : "ผ่านทุกรายการ");

  const thStyle: React.CSSProperties = {
    padding: "8px 10px",
    border: "1px solid #CBD5E1",
    background: "#1E3A5F",
    color: "#fff",
    fontSize: 12,
    textAlign: "center",
    fontWeight: 600,
  };
  const tdStyle: React.CSSProperties = {
    padding: "8px 10px",
    border: "1px solid #CBD5E1",
    fontSize: 12,
    verticalAlign: "top",
  };

  return (
    <div style={{ width: 794, background: "#fff", color: "#0F172A", fontFamily: "'Barlow', 'Sarabun', sans-serif", padding: "36px 44px", boxSizing: "border-box" }}>
      {/* หัวเอกสาร */}
      <div style={{ borderBottom: "3px solid #1E3A5F", paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0057A8", letterSpacing: 1 }}>CMMS-TOPPAN</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>Maintenance Management System</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>PM CHECKSHEET</div>
            <div style={{ fontSize: 12, color: "#475569" }}>ใบตรวจเช็คงานบำรุงรักษาเชิงป้องกัน</div>
          </div>
        </div>
      </div>

      {/* ข้อมูลแผน */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <tbody>
          <tr>
            <td style={{ ...tdStyle, width: 130, background: "#F1F5F9", fontWeight: 600 }}>เลขที่ PM</td>
            <td style={tdStyle}>{String(data.id)}</td>
            <td style={{ ...tdStyle, width: 130, background: "#F1F5F9", fontWeight: 600 }}>วันที่ทำ</td>
            <td style={tdStyle}>{data.doneAt}</td>
          </tr>
          <tr>
            <td style={{ ...tdStyle, background: "#F1F5F9", fontWeight: 600 }}>ชื่องาน</td>
            <td style={tdStyle} colSpan={3}>{data.title}</td>
          </tr>
          <tr>
            <td style={{ ...tdStyle, background: "#F1F5F9", fontWeight: 600 }}>เครื่องจักร</td>
            <td style={tdStyle} colSpan={3}>{data.assetName}</td>
          </tr>
          <tr>
            <td style={{ ...tdStyle, background: "#F1F5F9", fontWeight: 600 }}>รอบ / ความถี่</td>
            <td style={tdStyle}>{freqLabels[data.frequency] || data.frequency}</td>
            <td style={{ ...tdStyle, background: "#F1F5F9", fontWeight: 600 }}>วันครบกำหนด</td>
            <td style={tdStyle}>{data.dueDate}</td>
          </tr>
          <tr>
            <td style={{ ...tdStyle, background: "#F1F5F9", fontWeight: 600 }}>ผู้รับผิดชอบ</td>
            <td style={tdStyle} colSpan={3}>{data.assignee}</td>
          </tr>
        </tbody>
      </table>

      {/* ผลการตรวจเช็ค */}
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>ผลการตรวจเช็ค / CHECKLIST RESULTS</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 36 }}>ลำดับ</th>
            <th style={thStyle}>รายการตรวจเช็ค</th>
            <th style={{ ...thStyle, width: 90 }}>ผลการตรวจ</th>
            <th style={{ ...thStyle, width: 90 }}>ค่า / จำนวน</th>
            <th style={thStyle}>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {data.checklist.length === 0 && (
            <tr>
              <td style={tdStyle} colSpan={5}>ไม่มีรายการตรวจเช็ค</td>
            </tr>
          )}
          {data.checklist.map((item, idx) => {
            const isValue = item.type === "value";
            const result = isValue
              ? item.value.trim() !== ""
                ? "บันทึกค่า"
                : "-"
              : item.status === "pass"
                ? "ผ่าน"
                : item.status === "fail"
                  ? "ไม่ผ่าน"
                  : "-";
            const resultColor = item.status === "fail" ? "#DC2626" : item.status === "pass" ? "#059669" : "#475569";
            return (
              <tr key={idx}>
                <td style={{ ...tdStyle, textAlign: "center" }}>{idx + 1}</td>
                <td style={tdStyle}>{item.task}</td>
                <td style={{ ...tdStyle, textAlign: "center", color: resultColor, fontWeight: 600 }}>{result}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{isValue ? item.value : ""}</td>
                <td style={tdStyle}>{item.note || ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* สรุปผล */}
      <div style={{ padding: "10px 14px", border: "1px solid #CBD5E1", borderRadius: 6, background: "#F8FAFC", fontSize: 12, marginBottom: 20 }}>
        <b>สรุปผล:</b> {resultText}
      </div>

      {/* ลายเซ็น */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ ...tdStyle, textAlign: "center", height: 110, width: "50%" }}>
              {sigSrc(data.inspectorSignature) ? (
                <img src={sigSrc(data.inspectorSignature)} alt="ลายเซ็นผู้ตรวจเช็ค" style={{ maxHeight: 64, maxWidth: "90%", objectFit: "contain" }} />
              ) : (
                <div style={{ color: "#94A3B8", fontSize: 12 }}>ยังไม่ลงนาม</div>
              )}
            </td>
            <td style={{ ...tdStyle, textAlign: "center", height: 110, width: "50%" }}>
              {sigSrc(data.operatorSignature) ? (
                <img src={sigSrc(data.operatorSignature)} alt="ลายเซ็นผู้ควบคุมเครื่อง" style={{ maxHeight: 64, maxWidth: "90%", objectFit: "contain" }} />
              ) : (
                <div style={{ color: "#94A3B8", fontSize: 12 }}>ยังไม่ลงนาม</div>
              )}
            </td>
          </tr>
          <tr>
            <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600, borderTop: "none" }}>ผู้ตรวจเช็ค / INSPECTED BY</td>
            <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600, borderTop: "none" }}>ผู้ควบคุมเครื่อง / OPERATOR BY</td>
          </tr>
          <tr>
            <td style={{ ...tdStyle, textAlign: "center", fontSize: 11, color: "#475569" }}>{data.inspectorName || "........................................."}</td>
            <td style={{ ...tdStyle, textAlign: "center", fontSize: 11, color: "#475569" }}>{data.operatorName || "........................................."}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 16, fontSize: 10, color: "#94A3B8", textAlign: "center", borderTop: "1px solid #E2E8F0", paddingTop: 8 }}>
        CMMS-TOPPAN · เอกสารนี้สร้างจากระบบงานซ่อมบำรุงอัตโนมัติ · {new Date().toLocaleString("th-TH")}
      </div>
    </div>
  );
}
