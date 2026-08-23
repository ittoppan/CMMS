"use client";

// users/edit — migrate ui kit (PageShell, ui/Card, ui/Input, Radix Select, ui/Switch, ui/Avatar)
// business logic ครบเดิม: GET/PUT users.php?id=, avatar preset/upload + compressImage, must_change_password

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import SuccessDialog from "@/components/SuccessDialog";
import { t } from "@/lib/i18n";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ImagePlus, SquarePen } from "lucide-react";
import { compressImage } from "@/lib/imageCompress";

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
    <PageShell
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "บุคลากร", href: "/users" },
        { label: t("form.profile_edit_title") },
      ]}
      title={t("form.profile_edit_title")}
      description={t("hero.profile_edit_desc")}
      actions={
        <Button variant="secondary" onClick={() => router.push("/users")}>
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          {t("action.back")}
        </Button>
      }
    >
      <Card className="mx-auto w-full max-w-[880px]">
        {loading ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">{t("common.loading_users")}</p>
          </CardContent>
        ) : (
          <>
            <CardContent className="space-y-5">
              {errorMessage && (
                <Alert variant="danger">{errorMessage}</Alert>
              )}

              {/* Profile Avatar Upload & Selector */}
              <div className="rounded-xl border border-border bg-muted/50 p-4">
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">{t("action.change_profile_image")}</p>
                  <div className="flex flex-wrap items-center gap-4">
                    <Avatar className="h-14 w-14">
                      {form.avatar ? <AvatarImage src={form.avatar} alt={form.fullName || form.username || "User"} /> : null}
                      <AvatarFallback className="text-base">{(form.fullName || form.username || "User").slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">{t("form.avatar_hint")}</p>
                      <div className="flex flex-wrap gap-2">
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
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <label style={{
                          padding: '6px 14px', borderRadius: 8, background: 'var(--cmms-primary)', color: '#fff',
                          fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6
                        }}>
                          <ImagePlus className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" /> {t("common.uploading")}
                          <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-username">
                    {t("field.username")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="edit-username"
                    value={form.username}
                    onChange={(e) => update("username", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-full-name">
                    {t("field.full_name")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="edit-full-name"
                    value={form.fullName}
                    onChange={(e) => update("fullName", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-employee-code">{t("field.employee_code")}</Label>
                  <Input
                    id="edit-employee-code"
                    placeholder={t("placeholder.employee_code")}
                    value={form.employeeCode}
                    onChange={(e) => update("employeeCode", e.target.value.toUpperCase())}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-password">{t("form.new_password")}</Label>
                  <Input
                    id="edit-password"
                    type="password"
                    placeholder={t("form.password_blank_hint")}
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{t("form.new_password_optional")}</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-email">{t("field.email")}</Label>
                    <Input
                      id="edit-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-phone">{t("field.phone")}</Label>
                    <Input
                      id="edit-phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => update("phone", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-line-id">LINE ID</Label>
                    <Input
                      id="edit-line-id"
                      placeholder={t("placeholder.line_id")}
                      value={form.lineUserId}
                      onChange={(e) => update("lineUserId", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-position">{t("field.position")}</Label>
                    <Input
                      id="edit-position"
                      value={form.position}
                      onChange={(e) => update("position", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label id="edit-role-label" htmlFor="edit-role">
                    {t("form.usage_role")}
                  </Label>
                  <Select value={form.role} onValueChange={(v) => update("role", v)}>
                    <SelectTrigger id="edit-role" aria-labelledby="edit-role-label">
                      <SelectValue placeholder={t("form.usage_role")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technician">{t("form.technician")}</SelectItem>
                      <SelectItem value="engineer">{t("field.engineer")}</SelectItem>
                      <SelectItem value="manager">{t("form.manager")}</SelectItem>
                      <SelectItem value="operator">{t("form.machine_operator")}</SelectItem>
                      <SelectItem value="admin">{t("form.administrator")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label id="edit-is-active-label">{t("form.account_status")}</Label>
                  <div className="flex items-center gap-3 pt-1">
                    <Switch
                      id="edit-is-active"
                      aria-labelledby="edit-is-active-label"
                      label={t("form.activate_account")}
                      checked={form.isActive}
                      onChange={(val: boolean) => update("isActive", val)}
                    />
                    <span className={`text-sm ${form.isActive ? "font-medium text-[var(--cmms-primary)]" : "text-muted-foreground"}`}>
                      {form.isActive ? t("form.enabled") : t("form.suspend")}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label id="edit-must-change-label">{t("form.force_password_change")}</Label>
                  <div className="flex items-center gap-3 pt-1">
                    <Switch
                      id="edit-must-change"
                      aria-labelledby="edit-must-change-label"
                      label={t("form.force_password_hint")}
                      checked={form.mustChange}
                      onChange={(val: boolean) => update("mustChange", val)}
                    />
                    <span className={`text-sm ${form.mustChange ? "font-medium text-[var(--cmms-primary)]" : "text-muted-foreground"}`}>
                      {form.mustChange ? t("form.force_change_hint") : t("form.optional")}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="justify-end gap-2">
              <Button variant="secondary" onClick={() => (window.location.href = "/users")}>
                {t("action.cancel")}
              </Button>
              <Button disabled={submitting} onClick={handleSubmit}>
                <SquarePen className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                {submitting ? t("common.saving") : t("action.save_edit")}
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </PageShell>
  );
}

export default function EditUserPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm text-muted-foreground">{t("common.loading")}</div>}>
      <EditUserContent />
    </Suspense>
  );
}
