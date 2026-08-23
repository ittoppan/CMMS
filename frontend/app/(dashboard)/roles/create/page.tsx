"use client";

// roles/create — migrate ui kit (PageShell, ui/Card, ui/Input, ui/Textarea)
// business logic ครบเดิม: POST roles.php, validation

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import SuccessDialog from "@/components/SuccessDialog";
import { t } from "@/lib/i18n";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { ArrowLeft, Plus } from "lucide-react";

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
    <PageShell
      eyebrow={<p className="cmms-eyebrow">USER ROLES · CMMS-TOPPAN</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "บุคลากร", href: "/roles" },
        { label: t("form.roles_create_title") },
      ]}
      title={t("form.roles_create_title")}
      description={t("hero.roles_create_desc")}
      actions={
        <Button variant="secondary" onClick={() => router.push("/roles")}>
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          {t("action.back")}
        </Button>
      }
    >
      <Card className="mx-auto w-full max-w-[640px]">
        <CardContent className="space-y-5">
          {error && (
            <Alert variant="danger">{error}</Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="role-create-name">
              {t("form.role_name")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="role-create-name"
              placeholder={t("placeholder.roles")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role-create-description">{t("field.description")}</Label>
            <Textarea
              id="role-create-description"
              placeholder={t("placeholder.role_description")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </CardContent>

        <CardFooter className="justify-end gap-2">
          <Button variant="secondary" onClick={() => router.push("/roles")}>
            {t("action.cancel")}
          </Button>
          <Button disabled={loading} onClick={handleSubmit}>
            <Plus className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            {loading ? t("common.creating") : t("form.roles_create_title")}
          </Button>
        </CardFooter>
      </Card>
    </PageShell>
  );
}
