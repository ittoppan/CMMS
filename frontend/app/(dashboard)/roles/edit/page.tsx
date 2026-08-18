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
import { ShieldCheckIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";
import { t } from "@/lib/i18n";
function EditRoleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleId = searchParams.get("id");
  
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!roleId) {
      setError(t("msg.role_id_missing"));
      setLoadingData(false);
      return;
    }
    fetch(`/api/v1/roles.php?id=${roleId}`)
      .then(res => res.json())
      .then(json => {
        if (json && !json.error) {
          setName(json.name || "");
          setDescription(json.description || "");
        } else {
          setError(t("msg.role_not_found"));
        }
      })
      .catch(e => setError(t("msg.load_error")))
      .finally(() => setLoadingData(false));
  }, [roleId]);

  const handleSubmit = async () => {
    if (!name) {
      setError(t("msg.role_name_required"));
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        name,
        description,
      };

      const res = await fetch(`/api/v1/roles.php?id=${roleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success || json.message) {
        setSubmitted(true);
      } else {
        setError(json.error || t("msg.role_update_error"));
      }
    } catch {
      setError(t("msg.conn_fail_retry"));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title={t("msg.role_updated")}
        message={<>{t("field.role")} <strong>{name}</strong> {t("msg.updated_successfully")}</>}
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
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>ROLES EDIT · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>{t("form.roles_edit_title")}</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ShieldCheckIcon className="w-3.5 h-3.5" /> Roles & Permissions
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {t("hero.roles_edit_desc")}
          </Text>
        </VStack>
        <button
          type="button"
          onClick={() => router.push("/roles")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
        >
          <PencilSquareIcon className="w-4 h-4" />
          {t("action.back")}
        </button>
      </div>

      <Card elevation="low" padding={6}>
        {loadingData ? (
          <Text type="body" color="secondary">{t("common.loading_data")}</Text>
        ) : (
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
                  value={name}
                  onChange={setName}  />
              </Field>

              <Field label={t("field.description")} inputID="description">
                <TextArea
                  label={t("field.description")}
                  isLabelHidden
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
                disabled={submitting}
                onClick={handleSubmit}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
              >
                <PencilSquareIcon className="w-4 h-4" />
                {submitting ? t("common.saving") : t("action.save_data")}
              </button>
            </HStack>
          </VStack>
        )}
      </Card>
    </VStack>
  );
}

export default function EditRolePage() {
  return (
    <Suspense fallback={<Text type="body">{t("common.loading")}</Text>}>
      <EditRoleContent />
    </Suspense>
  );
}
