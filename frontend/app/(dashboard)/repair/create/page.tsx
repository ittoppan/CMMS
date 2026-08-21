"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Home, ChevronRight, AlertTriangle, Send, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import SuccessDialog from "@/components/SuccessDialog";
import { enqueue, pendingCount, subscribeOnline } from "@/lib/offlineQueue";

const createRepairSchema = z.object({
  asset_id: z.string().min(1, "กรุณาเลือกเครื่องจักรที่ชำรุด"),
  title: z.string().min(1, "กรุณาระบุหัวข้ออาการเสีย").max(200, "หัวข้ออาการเสียยาวเกินไป"),
  priority: z.enum(["critical", "high", "medium", "low"]),
  department: z.string().min(1, "กรุณาเลือกแผนกซ่อมที่รับผิดชอบ"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
});

type CreateRepairFormValues = z.infer<typeof createRepairSchema>;

export default function CreateWorkOrderPage() {
  const router = useRouter();

  const [assets, setAssets] = useState<Array<{ id: number | string; code: string; name: string }>>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);

  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [woNumber, setWoNumber] = useState("");
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [pending, setPending] = useState(0);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<CreateRepairFormValues>({
    resolver: zodResolver(createRepairSchema),
    defaultValues: {
      asset_id: "",
      title: "",
      priority: "medium",
      department: "",
      description: "",
      dueDate: "",
    },
  });

  const watchTitle = watch("title");

  useEffect(() => {
    setPending(pendingCount());
    const off = subscribeOnline(() => setPending(pendingCount()));
    return off;
  }, []);

  useEffect(() => {
    setLoadingAssets(true);
    fetch("/api/v1/asset_registry.php")
      .then((res) => res.json())
      .then((json) => {
        if (Array.isArray(json)) {
          setAssets(json);
        }
      })
      .catch((e) => console.error("Failed to load assets", e))
      .finally(() => setLoadingAssets(false));
  }, []);

  const onSubmit = async (values: CreateRepairFormValues) => {
    setLoading(true);
    setSubmitError("");

    const body = {
      title: values.title,
      description: values.description || "",
      asset_id: values.asset_id || null,
      priority: values.priority,
      department_id: values.department === "mechanical" ? 1 : values.department === "electrical" ? 2 : null,
      estimated_completion_date: values.dueDate ? `${values.dueDate} 23:59:59` : null,
      status: "open",
    };

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueue({
          kind: "repair",
          label: `แจ้งซ่อม: ${values.title}`,
          url: "/api/v1/repair.php",
          method: "POST",
          body,
        });
        setQueuedOffline(true);
        setPending(pendingCount());
        setLoading(false);
        return;
      }

      const res = await fetch("/api/v1/repair.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (json.success || json.id) {
        setWoNumber(json.work_order_no || `WO-${json.id}`);
        setSubmitted(true);
      } else {
        setSubmitError(json.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
      }
    } catch {
      // เน็ตหลุดระหว่างส่ง → เก็บในเครื่อง รอส่งอัตโนมัติเมื่อกลับมาออนไลน์
      enqueue({
        kind: "repair",
        label: `แจ้งซ่อม: ${values.title}`,
        url: "/api/v1/repair.php",
        method: "POST",
        body,
      });
      setQueuedOffline(true);
      setPending(pendingCount());
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title="เปิดใบแจ้งซ่อมสำเร็จ!"
        message={<>ใบแจ้งซ่อมเลขที่ <strong>{woNumber}</strong> ถูกส่งเข้าสู่ระบบแล้ว</>}
        primaryLabel="กลับไปหน้ารวมใบแจ้งซ่อม"
        onPrimary={() => router.push("/repair")}
        onBackdrop={() => router.push("/repair")}
      />
    );
  }

  if (queuedOffline) {
    return (
      <SuccessDialog
        title="บันทึกในเครื่องแล้ว (ออฟไลน์)"
        message={
          <>
            ระบบยังออนไลน์ไม่ถึง จึงเก็บใบแจ้งซ่อม <strong>“{watchTitle}”</strong> ไว้ในเครื่องแล้ว
            <br />จะส่งให้อัตโนมัติทันทีที่กลับมาออนไลน์ (เหลือค้างส่ง {pending} รายการ)
          </>
        }
        primaryLabel="กลับไปหน้ารวมใบแจ้งซ่อม"
        onPrimary={() => router.push("/repair")}
        onBackdrop={() => router.push("/repair")}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Link href="/repair" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 transition-colors">
          <Home className="w-4 h-4" />
          <span>ใบแจ้งซ่อม</span>
        </Link>
        <ChevronRight className="w-4 h-4 text-slate-400" />
        <span className="font-medium text-slate-900 dark:text-slate-100" aria-current="page">
          เปิดใบแจ้งซ่อมใหม่
        </span>
      </nav>

      {/* Header */}
      <div>
        <p className="cmms-eyebrow">REPAIR CREATE · CMMS-TOPPAN</p>
        <PageHeader
          title="เปิดใบแจ้งซ่อมใหม่"
          description="กรอกข้อมูลอาการเสียของเครื่องจักรเพื่อส่งเรื่องให้ทีมช่างดำเนินการ"
        />
      </div>

      {/* Offline Pending Banner */}
      {pending > 0 && (
        <Alert variant="info" title="โหมดออฟไลน์">
          มี {pending} รายการที่บันทึกไว้ในเครื่อง — จะส่งอัตโนมัติเมื่อกลับมาออนไลน์
        </Alert>
      )}

      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            <span>รายละเอียดใบแจ้งซ่อม</span>
          </CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-2xl">
            {submitError && (
              <Alert variant="danger" title="ไม่สามารถส่งแจ้งซ่อมได้">
                {submitError}
              </Alert>
            )}

            {/* เครื่องจักรที่ชำรุด */}
            <Select
              label="เครื่องจักรที่ชำรุด *"
              error={errors.asset_id?.message}
              disabled={loadingAssets}
              {...register("asset_id")}
            >
              <option value="">{loadingAssets ? "กำลังโหลดข้อมูลเครื่องจักร..." : "เลือกเครื่องจักร..."}</option>
              {assets.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.code} - {a.name}
                </option>
              ))}
            </Select>

            {/* หัวข้ออาการเสีย */}
            <Input
              label="หัวข้ออาการเสีย *"
              placeholder="เช่น ลูกปืนแกนหลักแตก เครื่องมีเสียงดัง"
              error={errors.title?.message}
              {...register("title")}
            />

            {/* ความสำคัญ & แผนกซ่อม */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="ความสำคัญ *"
                error={errors.priority?.message}
                {...register("priority")}
              >
                <option value="critical">วิกฤต (ต้องซ่อมทันที)</option>
                <option value="high">ด่วน</option>
                <option value="medium">ปานกลาง</option>
                <option value="low">ต่ำ</option>
              </Select>

              <Select
                label="แผนกซ่อมที่รับผิดชอบ *"
                error={errors.department?.message}
                {...register("department")}
              >
                <option value="">เลือกแผนกซ่อม...</option>
                <option value="mechanical">ช่างกล</option>
                <option value="electrical">ไฟฟ้า</option>
                <option value="instrument">ควบคุมและวัด</option>
                <option value="utility">สาธารณูปโภค</option>
              </Select>
            </div>

            {/* รายละเอียดเพิ่มเติม */}
            <Textarea
              label="รายละเอียดเพิ่มเติม"
              placeholder="อธิบายลักษณะอาการเสีย หรือข้อมูลเพิ่มเติมสำหรับช่าง..."
              rows={4}
              error={errors.description?.message}
              {...register("description")}
            />

            {/* วันที่ต้องการให้เสร็จ */}
            <Input
              type="date"
              label="วันที่ต้องการให้เสร็จ"
              error={errors.dueDate?.message}
              {...register("dueDate")}
            />

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--cmms-border)]">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/repair")}
                disabled={loading}
              >
                ยกเลิก
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={loading}
                className="gap-2"
              >
                {loading ? (
                  "กำลังบันทึก..."
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>บันทึกและส่งแจ้งซ่อม</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
