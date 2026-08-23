"use client";

// users/create — migrate ui kit (PageShell, ui/Card, ui/Input, Radix Select, ui/Switch, ui/Avatar)
// business logic ครบเดิม: POST users.php, avatar preset/upload + compressImage, validation

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { ArrowLeft, ImagePlus, UserPlus } from "lucide-react";
import { compressImage } from "@/lib/imageCompress";

const PRESET_AVATARS = [
  { label: t("form.avatar_tech1"), url: "https://api.dicebear.com/7.x/bottts/svg?seed=tech1" },
  { label: t("form.avatar_tech2"), url: "https://api.dicebear.com/7.x/bottts/svg?seed=tech2" },
  { label: t("form.avatar_engineer1"), url: "https://api.dicebear.com/7.x/bottts/svg?seed=eng1" },
  { label: t("form.manager"), url: "https://api.dicebear.com/7.x/bottts/svg?seed=manager1" },
  { label: t("form.administrator"), url: "https://api.dicebear.com/7.x/bottts/svg?seed=admin1" },
];

export default function CreateUserPage() {
  const router = useRouter();
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

  const handleSubmit = async () => {
    if (!form.username || !form.employeeCode || !form.fullName || !form.password) {
      setErrorMessage(t("msg.user_required_fields"));
      return;
    }
    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/v1/users.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          employee_code: form.employeeCode,
          full_name: form.fullName,
          email: form.email || `${form.username}@cmms.local`,
          phone: form.phone,
          password: form.password,
          role: form.role,
          position: form.position,
          avatar: form.avatar,
          is_active: form.isActive ? 1 : 0,
          line_user_id: form.lineUserId || null,
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setErrorMessage(json.error || t("msg.user_create_error"));
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
        title={t("msg.user_created")}
        message={<>{t("form.user_account")} <strong>{form.username}</strong> {t("msg.added_successfully")}</>}
        primaryLabel={t("action.back_to_users")}
        secondaryLabel={t("action.add_another_user")}
        onPrimary={() => router.push("/users")}
        onSecondary={() => {
          setSubmitted(false);
          setForm({ username: "", employeeCode: "", fullName: "", email: "", phone: "", password: "", role: "technician", position: "", avatar: PRESET_AVATARS[0].url, isActive: true, lineUserId: "" });
        }}
        onBackdrop={() => router.push("/users")}
      />
    );
  }

  return (
    <PageShell
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "บุคลากร", href: "/users" },
        { label: t("form.users_create_title") },
      ]}
      title={t("form.users_create_title")}
      description={t("hero.users_create_desc")}
      actions={
        <Button variant="secondary" onClick={() => router.push("/users")}>
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          {t("action.back")}
        </Button>
      }
    >
      <Card className="mx-auto w-full max-w-[880px]">
        <CardContent className="space-y-5">
          {errorMessage && (
            <Alert variant="danger">{errorMessage}</Alert>
          )}

          {/* Profile Picture Upload & Avatar Preview */}
          <div className="rounded-xl border border-border bg-muted/50 p-4">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">{t("form.choose_upload_avatar")}</p>
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
              <Label htmlFor="create-username">
                {t("field.username")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-username"
                placeholder={t("placeholder.username")}
                value={form.username}
                onChange={(e) => update("username", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-full-name">
                {t("field.full_name")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-full-name"
                placeholder={t("placeholder.full_name")}
                value={form.fullName}
                onChange={(e) => update("fullName", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-employee-code">
                {t("field.employee_code")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-employee-code"
                placeholder={t("placeholder.employee_code_line")}
                value={form.employeeCode}
                onChange={(e) => update("employeeCode", e.target.value.toUpperCase())}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-password">
                {t("field.password")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-password"
                type="password"
                placeholder={t("form.set_password")}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="create-email">{t("field.email")}</Label>
                <Input
                  id="create-email"
                  type="email"
                  placeholder={t("placeholder.email")}
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-phone">{t("field.phone")}</Label>
                <Input
                  id="create-phone"
                  type="tel"
                  placeholder={t("placeholder.phone")}
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="create-line-id">LINE ID</Label>
                <Input
                  id="create-line-id"
                  placeholder={t("placeholder.line_id")}
                  value={form.lineUserId}
                  onChange={(e) => update("lineUserId", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-position">{t("field.position")}</Label>
                <Input
                  id="create-position"
                  placeholder={t("placeholder.position")}
                  value={form.position}
                  onChange={(e) => update("position", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label id="create-role-label" htmlFor="create-role">
                {t("form.usage_role")}
              </Label>
              <Select value={form.role} onValueChange={(v) => update("role", v)}>
                <SelectTrigger id="create-role" aria-labelledby="create-role-label">
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
              <Label id="create-is-active-label">{t("form.account_status")}</Label>
              <div className="flex items-center gap-3 pt-1">
                <Switch
                  id="create-is-active"
                  aria-labelledby="create-is-active-label"
                  label={t("form.activate_account")}
                  checked={form.isActive}
                  onChange={(val: boolean) => update("isActive", val)}
                />
                <span className={`text-sm ${form.isActive ? "font-medium text-[var(--cmms-primary)]" : "text-muted-foreground"}`}>
                  {form.isActive ? t("form.enabled") : t("form.suspend")}
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
            <UserPlus className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            {submitting ? t("common.creating") : t("form.users_create_short")}
          </Button>
        </CardFooter>
      </Card>
    </PageShell>
  );
}
