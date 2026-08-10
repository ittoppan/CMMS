// ... other imports ...
import { DateInput } from "@astryxdesign/core/DateInput";
import { TextArea } from "@astryxdesign/core/TextArea"; // Ensure TextArea is imported
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { HomeIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";

type ISODate = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

function EditPMContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pmId = searchParams.get("id");

  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("pending");
  const [dueDate, setDueDate] = useState<ISODate | undefined>(undefined);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [pmNumber, setPmNumber] = useState("");

  // New state variables for the new fields
  const [completedAt, setCompletedAt] = useState<ISODate | undefined>(undefined);
  const [completedBy, setCompletedBy] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");

  useEffect(() => {
    if (!pmId) {
      setError("ไม่ระบุหมายเลขแผน PM");
      setLoadingData(false);
      return;
    }
    fetch(`/api/v1/pm_am.php?id=${pmId}`)
      .then(res => res.json())
      .then(json => {
        if (json && !json.error) {
          setTitle(json.title || "");
          setStatus(json.status || "pending");
          setDueDate(json.due_date || undefined);
          setDescription(json.description || "");
          setNotes(json.notes || "");
          setPmNumber(`PM-${String(json.id).padStart(3, '0')}`);

          // Set new state variables
          setCompletedAt(json.completed_at || undefined);
          setCompletedBy(json.completed_by_name || ""); // Assuming API returns name, adjust if it's an ID
          setRescheduleReason(json.reschedule_reason || "");
        } else {
          setError("ไม่พบข้อมูลแผน PM");
        }
      })
      .catch(e => setError("เกิดข้อผิดพลาดในการโหลดข้อมูล"))
      .finally(() => setLoadingData(false));
  }, [pmId]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");

    try {
      // First fetch the existing data to preserve fields we aren't editing
      const currentRes = await fetch(`/api/v1/pm_am.php?id=${pmId}`);
      const currentData = await currentRes.json();

      const payload = {
        ...currentData,
        title,
        status,
        due_date: dueDate || null,
        notes,
        // Include new fields in the payload if they are being updated or are relevant
        reschedule_reason: rescheduleReason, // Include reschedule reason
        // completed_at and completed_by are typically set by a completion action,
        // so we might not edit them directly here, but include if API allows.
        // If they are meant to be updated here, uncomment and adjust:
        // completed_at: status === 'completed' ? (completedAt || new Date().toISOString().split('T')[0]) : null,
        // completed_by: status === 'completed' ? (completedBy || 'current_user_id') : null,
      };

      const res = await fetch(`/api/v1/pm_am.php?id=${pmId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success || json.message) {
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการอัปเดตสถานะ");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title="อัปเดตสถานะงานสำเร็จ!"
        message={<>แผนซ่อมบำรุง <strong>{pmNumber}</strong> ถูกอัปเดตเรียบร้อยแล้ว</>}
        primaryLabel="กลับไปหน้าตาราง PM"
        onPrimary={() => router.push("/pm_am")}
        onBackdrop={() => router.push("/pm_am")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <Breadcrumbs>
        <BreadcrumbItem href="/pm_am" startIcon={<HomeIcon />}>แผนบำรุงรักษาเชิงป้องกัน (PM)</BreadcrumbItem>
        <BreadcrumbItem isCurrent>อัปเดตงาน PM</BreadcrumbItem>
      </Breadcrumbs>

      <Heading level={2}>อัปเดตสถานะงานซ่อมบำรุง</Heading>

      <Card padding={6}>
        {loadingData ? (
          <Text type="body" color="secondary">กำลังโหลดข้อมูลแผนงาน...</Text>
        ) : (
          <VStack gap={5} style={{ maxWidth: 640 }}>
            {error && (
              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--cmms-danger-light)', color: 'var(--cmms-danger)', fontSize: '0.85rem', fontWeight: 600 }}>
                ⚠️ {error}
              </div>
            )}

            <TextInput
              label="ชื่องาน PM"
              value={title}
              onChange={setTitle}  />

            <Selector
              label="สถานะปัจจุบัน"
              placeholder="เลือกสถานะ"
              value={status}
              onChange={setStatus}
              options={[
                { value: "pending", label: "รอดำเนินการ" },
                { value: "in_progress", label: "กำลังทำ" },
                { value: "completed", label: "ทำเสร็จแล้ว" },
                { value: "overdue", label: "เกินกำหนดเวลา" },
                { value: "skipped", label: "ข้ามรอบนี้" },
              ]}
            />

            <DateInput
              label="กำหนดการรอบนี้"
              value={dueDate}
              onChange={setDueDate}
            />

            <TextArea
              label="บันทึกผลการตรวจเช็ค"
              placeholder="บันทึกย่อ ข้อมูลที่พบจากการตรวจเช็ค..."
              value={notes}
              onChange={setNotes}
            />

            {/* Conditionally render completed_at and completed_by if status is 'completed' */}
            {status === "completed" && completedAt && (
              <TextInput
                label="วันที่เสร็จสิ้น"
                value={completedAt.split('T')[0]} // Display only the date part
                readOnly
              />
            )}
            {status === "completed" && completedBy && (
              <TextInput
                label="ผู้ดำเนินการ"
                value={completedBy}
                readOnly
              />
            )}

            {/* Conditionally render rescheduleReason if status is 'skipped' or 'overdue' */}
            {(status === "skipped" || status === "overdue") && (
              <TextArea
                label="เหตุผลในการเลื่อน/ข้าม"
                placeholder="ระบุเหตุผลที่ทำให้งานนี้ถูกเลื่อนหรือข้ามรอบ"
                value={rescheduleReason}
                onChange={setRescheduleReason}
              />
            )}

            <HStack gap={3} hAlign="end">
              <Button label="ยกเลิก" variant="secondary" onClick={() => router.push("/pm_am")} />
              <Button label="บันทึกข้อมูล" variant="primary" onClick={handleSubmit} isLoading={submitting} />
            </HStack>
          </VStack>
        )}
      </Card>
    </VStack>
  );
}

export default function EditPMPage() {
  return (
    <Suspense fallback={<Text type="body">กำลังโหลด...</Text>}>
      <EditPMContent />
    </Suspense>
  );
}
