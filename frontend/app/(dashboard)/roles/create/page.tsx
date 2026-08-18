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
import { HomeIcon, ShieldCheckIcon, PlusIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";
import { t } from "@/lib/i18n";

export default function RoleCreatePage() {
  const router = useRouter();
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!name) {
      setError(t("msg.role_name_required"));
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/roles.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setError(json.error || t("msg.role_create_error"));
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
        title={t("msg.role_created")}
        message={<>{t("field.role")} <strong>{name}</strong> {t("msg.added_successfully")}</>}
        primaryLabel={t("action.back_to_permissions")}
        onPrimary={() => router.push("/roles")}
        onBackdrop={() => router.push("/roles")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>ROLES CREATE · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>{t("form.roles_create_title")}</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ShieldCheckIcon className="w-3.5 h-3.5" /> Roles & Permissions
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {t("hero.roles_create_desc")}
          </Text>
        </VStack>
        <button
          type="button"
          onClick={() => router.push("/roles")}
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
            <Field label={t("form.role_name_req")} inputID="name" isRequired>
              <TextInput 
                label={t("form.role_name")}
                isLabelHidden
                placeholder={t("placeholder.roles")}
                value={name}
                onChange={setName}  />
            </Field>

            <Field label={t("field.description")} inputID="description">
              <TextArea
                label={t("field.description")}
                isLabelHidden
                placeholder={t("placeholder.role_description")}
                value={description}
                onChange={setDescription}
              />
            </Field>
          </FormLayout>

          <HStack gap={3} hAlign="end">
            <button
              type="button"
              onClick={() => router.push("/roles")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
            >
              {t("action.cancel")}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
            >
              <PlusIcon className="w-4 h-4" />
              {loading ? t("common.creating") : t("form.roles_create_title")}
            </button>
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}
