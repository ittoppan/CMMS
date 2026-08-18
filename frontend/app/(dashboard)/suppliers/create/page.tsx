"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { Switch } from "@astryxdesign/core/Switch";
import { HomeIcon, TruckIcon, PlusIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";
import { t } from "@/lib/i18n";

export default function SupplierCreatePage() {
  const router = useRouter();
  
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [taxId, setTaxId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!name || !code) {
      setError(t("msg.manufacturer_code_name_required"));
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/suppliers.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          contact_person: contact,
          email,
          phone,
          address,
          tax_id: taxId,
          is_active: isActive ? 1 : 0
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setError(json.error || t("msg.supplier_create_error"));
      }
    } catch {
      setError(t("msg.conn_fail_retry"));
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title={t("msg.supplier_created")}
        message={<>{t("field.supplier")} <strong>{name}</strong> {t("msg.added_successfully")}</>}
        primaryLabel={t("action.back_to_list")}
        onPrimary={() => router.push("/suppliers")}
        onBackdrop={() => router.push("/suppliers")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>SUPPLIERS CREATE · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>{t("form.manufacturer_create_title")}</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <TruckIcon className="w-3.5 h-3.5" /> {t("form.supplier_new")}
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {t("hero.manufacturer_create_desc")}
          </Text>
        </VStack>
        <button
          type="button"
          onClick={() => router.push("/suppliers")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
        >
          <HomeIcon className="w-4 h-4" />
          {t("action.back")}
        </button>
      </div>

      <Card elevation="low" padding={6}>
        <VStack gap={5} style={{ maxWidth: 640 }}>
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 text-sm font-semibold">
              {error}
            </div>
          )}

          <FormLayout>
            <HStack gap={4}>
              <Field label={t("form.reference_code_req")} inputID="code" isRequired style={{ flex: 1 }}>
                <TextInput 
                  label={t("form.reference_code")}
                  isLabelHidden
                  placeholder={t("placeholder.supplier_code")}
                  value={code}
                  onChange={setCode}
                />
              </Field>
              <Field label={t("form.company_name_req")} inputID="name" isRequired style={{ flex: 2 }}>
                <TextInput 
                  label={t("field.company_name")}
                  isLabelHidden
                  placeholder={t("placeholder.company_name")}
                  value={name}
                  onChange={setName}
                />
              </Field>
            </HStack>
            
            <HStack gap={4}>
              <Field label={t("field.contact_person")} inputID="contact" style={{ flex: 1 }}>
                <TextInput 
                  label={t("field.contact_person")}
                  isLabelHidden
                  placeholder={t("form.contact_name")}
                  value={contact}
                  onChange={setContact}
                />
              </Field>
              <Field label={t("field.phone")} inputID="phone" style={{ flex: 1 }}>
                <TextInput 
                  label={t("field.phone")}
                  isLabelHidden
                  placeholder="02-xxx-xxxx"
                  value={phone}
                  onChange={setPhone}
                />
              </Field>
            </HStack>

            <HStack gap={4}>
              <Field label={t("field.email")} inputID="email" style={{ flex: 1 }}>
                <TextInput 
                  label={t("field.email")}
                  isLabelHidden
                  placeholder="contact@company.com"
                  value={email}
                  onChange={setEmail}
                />
              </Field>
              <Field label={t("field.tax_id")} inputID="taxId" style={{ flex: 1 }}>
                <TextInput 
                  label={t("field.tax_id")}
                  isLabelHidden
                  placeholder="0123456789012"
                  value={taxId}
                  onChange={setTaxId}
                />
              </Field>
            </HStack>

            <Field label={t("field.address")} inputID="address">
              <TextArea
                label={t("field.address")}
                isLabelHidden
                placeholder={t("placeholder.doc_address")}
                value={address}
                onChange={setAddress}
              />
            </Field>

            <Field label={t("form.usage_status")} inputID="isActive">
              <HStack gap={3} vAlign="center" style={{ paddingTop: 8 }}>
                <Switch
                  label={t("field.active")}
                  value={isActive}
                  onChange={setIsActive}
                />
                <Text type="body" size="sm" color={isActive ? "primary" : "secondary"}>
                  {isActive ? t("form.enabled") : t("form.suspend")}
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
              {t("action.cancel")}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleSubmit}
              className="cmms-btn-primary"
            >
              <PlusIcon className="w-4 h-4" />
              {loading ? t("common.saving") : t("action.save_data")}
            </button>
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}
