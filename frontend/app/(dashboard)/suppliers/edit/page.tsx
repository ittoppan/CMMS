"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { Switch } from "@astryxdesign/core/Switch";
import { HomeIcon, TruckIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";

function EditSupplierContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supplierId = searchParams.get("id");
  
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [taxId, setTaxId] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!supplierId) {
      setError("ไม่ระบุหมายเลข Supplier");
      setLoadingData(false);
      return;
    }
    fetch(`/api/v1/suppliers.php?id=${supplierId}`)
      .then(res => res.json())
      .then(json => {
        if (json && !json.error) {
          setCode(json.code || "");
          setName(json.name || "");
          setContact(json.contact_person || "");
          setEmail(json.email || "");
          setPhone(json.phone || "");
          setAddress(json.address || "");
          setTaxId(json.tax_id || "");
          setIsActive(json.is_active === 1 || json.is_active === "1" || json.is_active === true);
        } else {
          setError("ไม่พบข้อมูล Supplier");
        }
      })
      .catch(e => setError("เกิดข้อผิดพลาดในการโหลดข้อมูล"))
      .finally(() => setLoadingData(false));
  }, [supplierId]);

  const handleSubmit = async () => {
    if (!name || !code) {
      setError("กรุณาระบุรหัสผู้ผลิต และชื่อผู้ผลิต");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        code,
        name,
        contact_person: contact,
        email,
        phone,
        address,
        tax_id: taxId,
        is_active: isActive ? 1 : 0
      };

      const res = await fetch(`/api/v1/suppliers.php?id=${supplierId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success || json.message) {
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการอัปเดตข้อมูล");
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
        title="อัปเดตข้อมูลสำเร็จ!"
        message={<>ข้อมูลซัพพลายเออร์ <strong>{name}</strong> ถูกอัปเดตเรียบร้อยแล้ว</>}
        primaryLabel="กลับไปหน้ารายการ"
        onPrimary={() => router.push("/suppliers")}
        onBackdrop={() => router.push("/suppliers")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>SUPPLIERS EDIT · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>แก้ไขข้อมูลผู้ผลิต</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <TruckIcon className="w-3.5 h-3.5" /> Supplier
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            ปรับปรุงข้อมูลผู้ผลิตหรือผู้จัดจำหน่ายในระบบ
          </Text>
        </VStack>
        <button
          type="button"
          onClick={() => router.push("/suppliers")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
        >
          <HomeIcon className="w-4 h-4" />
          ย้อนกลับ
        </button>
      </div>

      <Card elevation="low" padding={6}>
        {loadingData ? (
          <Text type="body" color="secondary">กำลังโหลดข้อมูล...</Text>
        ) : (
          <VStack gap={5} style={{ maxWidth: 640 }}>
            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 text-sm font-semibold">
                {error}
              </div>
            )}

            <FormLayout>
              <HStack gap={4}>
                <Field label="รหัสอ้างอิง *" inputID="code" isRequired style={{ flex: 1 }}>
                  <TextInput 
                    label="รหัสอ้างอิง"
                    isLabelHidden
                    value={code}
                    onChange={setCode}
                  />
                </Field>
                <Field label="ชื่อบริษัท *" inputID="name" isRequired style={{ flex: 2 }}>
                  <TextInput 
                    label="ชื่อบริษัท"
                    isLabelHidden
                    value={name}
                    onChange={setName}
                  />
                </Field>
              </HStack>
              
              <HStack gap={4}>
                <Field label="ผู้ติดต่อ" inputID="contact" style={{ flex: 1 }}>
                  <TextInput 
                    label="ผู้ติดต่อ"
                    isLabelHidden
                    value={contact}
                    onChange={setContact}
                  />
                </Field>
                <Field label="เบอร์โทรศัพท์" inputID="phone" style={{ flex: 1 }}>
                  <TextInput 
                    label="เบอร์โทรศัพท์"
                    isLabelHidden
                    value={phone}
                    onChange={setPhone}
                  />
                </Field>
              </HStack>

              <HStack gap={4}>
                <Field label="อีเมล" inputID="email" style={{ flex: 1 }}>
                  <TextInput 
                    label="อีเมล"
                    isLabelHidden
                    value={email}
                    onChange={setEmail}
                  />
                </Field>
                <Field label="เลขประจำตัวผู้เสียภาษี" inputID="taxId" style={{ flex: 1 }}>
                  <TextInput 
                    label="เลขประจำตัวผู้เสียภาษี"
                    isLabelHidden
                    value={taxId}
                    onChange={setTaxId}
                  />
                </Field>
              </HStack>

              <Field label="ที่อยู่" inputID="address">
                <TextArea
                  label="ที่อยู่"
                  isLabelHidden
                  value={address}
                  onChange={setAddress}
                />
              </Field>

              <Field label="สถานะการใช้งาน" inputID="isActive">
                <HStack gap={3} vAlign="center" style={{ paddingTop: 8 }}>
                  <Switch
                    label="ใช้งาน"
                    value={isActive}
                    onChange={setIsActive}
                  />
                  <Text type="body" size="sm" color={isActive ? "primary" : "secondary"}>
                    {isActive ? "เปิดใช้งาน" : "ระงับการใช้งาน"}
                  </Text>
                </HStack>
              </Field>
            </FormLayout>

            <HStack gap={3} hAlign="end">
              <button
                type="button"
                onClick={() => router.push("/suppliers")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="cmms-btn-primary"
              >
                <PencilSquareIcon className="w-4 h-4" />
                {submitting ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
              </button>
            </HStack>
          </VStack>
        )}
      </Card>
    </VStack>
  );
}

export default function EditSupplierPage() {
  return (
    <Suspense fallback={<Text type="body">กำลังโหลด...</Text>}>
      <EditSupplierContent />
    </Suspense>
  );
}
