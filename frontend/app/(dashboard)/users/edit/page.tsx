"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Avatar } from "@astryxdesign/core/Avatar";
import { 
  PencilSquareIcon,
  ArrowLeftIcon,
  PhotoIcon
} from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";
import { compressImage } from "@/lib/imageCompress";
import { t } from "@/lib/i18n";

const PRESET_AVATARS = [
  { label: t("form.avatar_tech1"), url: "https://api.dicebear.com/7.x/bottts/svg?seed=tech1" },
  { label: t("form.avatar_tech2"), url: "https://api.dicebear.com/7.x/bottts/svg?seed=tech2" },
  { label: t("form.avatar_engineer1"), url: "https://api.dicebear.com/7.x/bottts/svg?seed=eng1" },
  { label: t("form.manager"), url: "https://api.dicebear.com/7.x/bottts/svg?seed=manager1" },
  { label: t("form.administrator"), url: "https://api.dicebear.com/7.x/bottts/svg?seed=admin1" },
];

function EditUserContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [form, setForm] = useState({
    username: "",
    employeeCode: "",
    fullName: "",
    email: "",
    phone: "",
    password: "",
    role: "technician",
    position: "",
    avatar: PRESET_AVATARS[0].url,
    isActive: true,
    lineUserId: "",
    mustChange: false,
  });

  const update = (key: string, val: any) => setForm(prev => ({ ...prev, [key]: val }));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const dataUrl = await compressImage(file);
        update("avatar", dataUrl);
      } catch (err) {
        console.error("Image compress failed", err);
        setErrorMessage(t("msg.image_process_error"));
      }
    }
  };

  useEffect(() => {
    if (!userId) {
      setErrorMessage(t("msg.user_id_missing"));
      setLoading(false);
      return;
    }
    fetch(`/api/v1/users.php?id=${userId}`)
      .then(res => res.json())
      .then(user => {
        if (user && !user.error) {
          setForm({
            username: user.username || "",
            employeeCode: user.employee_code || "",
            fullName: user.full_name || "",
            email: user.email || "",
            phone: user.phone || "",
            password: "",
            role: user.role || "technician",
            position: user.position || "",
            avatar: user.avatar || user.avatar_path || PRESET_AVATARS[0].url,
            isActive: user.is_active === 1 || user.is_active === "1" || user.is_active === true,
            lineUserId: user.line_user_id || "",
            mustChange: user.must_change_password === 1 || user.must_change_password === "1" || user.must_change_password === true,
          });
        } else {
          setErrorMessage(t("msg.user_not_found"));
        }
      })
      .catch(() => setErrorMessage(t("msg.user_load_error")))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleSubmit = async () => {
    if (!form.username || !form.fullName) {
      setErrorMessage(t("msg.username_fullname_required"));
      return;
    }
    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch(`/api/v1/users.php?id=${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          employee_code: form.employeeCode,
          full_name: form.fullName,
          email: form.email,
          phone: form.phone,
          password: form.password || undefined,
          role: form.role,
          position: form.position,
          avatar: form.avatar,
          is_active: form.isActive ? 1 : 0,
          line_user_id: form.lineUserId || null,
          must_change_password: form.mustChange ? 1 : 0,
        }),
      });
      const json = await res.json();
      if (json.success || json.message === "Updated") {
        setSubmitted(true);
        // แจ้ง layout (มุมขวาบน) ให้รีเฟรชรูปโปรไฟล์ใหม่ทันที
        window.dispatchEvent(new Event("cmms:profile-updated"));
      } else {
        setErrorMessage(json.error || t("msg.save_error"));
      }
    } catch {
      setErrorMessage(t("msg.conn_fail_retry"));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title={t("msg.user_saved")}
        message={<>{t("form.user_account_info")} <strong>{form.username}</strong> {t("msg.updated_successfully")}</>}
        primaryLabel={t("action.back_to_users")}
        onPrimary={() => router.push("/users")}
        onBackdrop={() => router.push("/users")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>USERS EDIT · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>{t("form.profile_edit_title")}</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <PencilSquareIcon className="w-3.5 h-3.5" /> {t("menu.users")}
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {t("hero.profile_edit_desc")}
          </Text>
        </VStack>
        <button
          type="button"
          onClick={() => router.push("/users")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          {t("action.back")}
        </button>
      </div>

      <Card elevation="low" padding={6}>
        {loading ? (
          <Text type="body" color="secondary">{t("common.loading_users")}</Text>
        ) : (
          <VStack gap={5}>
            {errorMessage && (
              <div className="p-3 rounded-lg bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 text-sm font-semibold">
                {errorMessage}
              </div>
            )}

            {/* Profile Avatar Upload & Selector */}
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
              <VStack gap={3}>
                <Text type="body" weight="bold">{t("action.change_profile_image")}</Text>
                <HStack gap={4} vAlign="center" wrap="wrap">
                  {form.avatar ? (
                    <Avatar name={form.fullName || form.username || "User"} src={form.avatar} size="lg" />
                  ) : (
                    <Avatar name={form.fullName || form.username || "User"} size="lg" />
                  )}
                  <VStack gap={2}>
                    <Text type="body" size="sm" color="secondary">{t("form.avatar_hint")}</Text>
                    <HStack gap={2} wrap="wrap">
                      {PRESET_AVATARS.map((av, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => update("avatar", av.url)}
                          style={{
                            padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                            border: `2px solid ${form.avatar === av.url ? 'var(--cmms-primary)' : 'var(--cmms-border)'}`,
                            background: form.avatar === av.url ? 'var(--cmms-primary-light)' : 'var(--cmms-bg-card)',
                            fontSize: '0.8rem', fontWeight: 600
                          }}
                        >
                          {av.label}
                        </button>
                      ))}
                    </HStack>

                    <HStack gap={2} vAlign="center" style={{ marginTop: 4 }}>
                      <label style={{
                        padding: '6px 14px', borderRadius: 8, background: 'var(--cmms-primary)', color: '#fff',
                        fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6
                      }}>
                        <PhotoIcon className="w-4 h-4" /> {t("common.uploading")}
                        <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                      </label>
                    </HStack>
                  </VStack>
                </HStack>
              </VStack>
            </div>

            <FormLayout>
              <Field label={t("form.username_req")} inputID="username" isRequired>
                <TextInput
                  label={t("field.username")}
                  isLabelHidden
                  value={form.username}
                  onChange={(v: string) => update("username", v)}
                />
              </Field>

              <Field label={t("form.full_name_req")} inputID="fullName" isRequired>
                <TextInput
                  label={t("field.full_name")}
                  isLabelHidden
                  value={form.fullName}
                  onChange={(v: string) => update("fullName", v)}
                />
              </Field>

              <Field label={t("field.employee_code")} inputID="employeeCode">
                <TextInput
                  label={t("field.employee_code")}
                  isLabelHidden
                  placeholder={t("placeholder.employee_code")}
                  value={form.employeeCode}
                  onChange={(v: string) => update("employeeCode", v.toUpperCase())}
                />
              </Field>

              <Field label={t("form.new_password_optional")} inputID="password">
                <TextInput
                  label={t("form.new_password")}
                  isLabelHidden
                  type="password"
                  placeholder={t("form.password_blank_hint")}
                  value={form.password}
                  onChange={(v: string) => update("password", v)}
                />
              </Field>

              <Field label={t("field.email")} inputID="email">
                <TextInput
                  label={t("field.email")}
                  isLabelHidden
                  value={form.email}
                  onChange={(v: string) => update("email", v)}
                />
              </Field>

              <Field label={t("field.phone")} inputID="phone">
                <TextInput
                  label={t("field.phone")}
                  isLabelHidden
                  value={form.phone}
                  onChange={(v: string) => update("phone", v)}
                />
              </Field>

              <Field label={t("form.line_id_label")} inputID="lineUserId">
                <TextInput
                  label="LINE ID"
                  isLabelHidden
                  placeholder={t("placeholder.line_id")}
                  value={form.lineUserId}
                  onChange={(v: string) => update("lineUserId", v)}
                />
              </Field>

              <Field label={t("field.position")} inputID="position">
                <TextInput
                  label={t("field.position")}
                  isLabelHidden
                  value={form.position}
                  onChange={(v: string) => update("position", v)}
                />
              </Field>

              <Field label={t("form.usage_role")} inputID="role">
                <Selector
                  label={t("form.usage_role")}
                  isLabelHidden
                  value={form.role}
                  onChange={(v: string) => update("role", v)}
                  options={[
                    { value: "technician", label: t("form.technician") },
                    { value: "engineer", label: t("field.engineer") },
                    { value: "manager", label: t("form.manager") },
                    { value: "operator", label: t("form.machine_operator") },
                    { value: "admin", label: t("form.administrator") },
                  ]}
                />
              </Field>

              <Field label={t("form.account_status")} inputID="isActive">
                <HStack gap={3} vAlign="center" style={{ paddingTop: 8 }}>
                  <Switch
                    label={t("form.activate_account")}
                    value={form.isActive}
                    onChange={(val: boolean) => update("isActive", val)}
                  />
                  <Text type="body" size="sm" color={form.isActive ? "primary" : "secondary"}>
                    {form.isActive ? t("form.enabled") : t("form.suspend")}
                  </Text>
                </HStack>
              </Field>

              <Field label={t("form.force_password_change")} inputID="mustChange">
                <HStack gap={3} vAlign="center" style={{ paddingTop: 8 }}>
                  <Switch
                    label={t("form.force_password_hint")}
                    value={form.mustChange}
                    onChange={(val: boolean) => update("mustChange", val)}
                  />
                  <Text type="body" size="sm" color={form.mustChange ? "primary" : "secondary"}>
                    {form.mustChange ? t("form.force_change_hint") : t("form.optional")}
                  </Text>
                </HStack>
              </Field>
            </FormLayout>
          </VStack>
        )}
      </Card>

      {!loading && (
        <HStack hAlign="end" gap={3}>
          <button
            type="button"
            onClick={() => (window.location.href = "/users")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
          >
            {t("action.cancel")}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="cmms-btn-primary"
          >
            <PencilSquareIcon className="w-4 h-4" />
            {submitting ? t("common.saving") : t("action.save_edit")}
          </button>
        </HStack>
      )}
    </VStack>
  );
}

export default function EditUserPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}><Text type="body" color="secondary">{t("common.loading")}</Text></div>}>
      <EditUserContent />
    </Suspense>
  );
}
