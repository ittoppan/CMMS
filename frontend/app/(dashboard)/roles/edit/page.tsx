"use client";

// roles/edit — migrate ui kit (PageShell, ui/Card, ui/Input, ui/Textarea)
// business logic ครบเดิม: GET/PUT roles.php?id=, validation

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import SuccessDialog from "@/components/SuccessDialog";
import { t } from "@/lib/i18n";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { ArrowLeft, SquarePen } from "lucide-react";

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
    <PageShell
      eyebrow={<p className="cmms-eyebrow">USER ROLES · CMMS-TOPPAN</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "บุคลากร", href: "/roles" },
        { label: t("form.roles_edit_title") },
      ]}
      title={t("form.roles_edit_title")}
      description={t("hero.roles_edit_desc")}
      actions={
        <Button variant="secondary" onClick={() => router.push("/roles")}>
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          {t("action.back")}
        </Button>
      }
    >
      <Card className="mx-auto w-full max-w-[640px]">
        {loadingData ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">{t("common.loading_data")}</p>
          </CardContent>
        ) : (
          <>
            <CardContent className="space-y-5">
              {error && (
                <Alert variant="danger">{error}</Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="role-edit-name">
                  {t("form.role_name")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="role-edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="role-edit-description">{t("field.description")}</Label>
                <Textarea
                  id="role-edit-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </CardContent>

            <CardFooter className="justify-end gap-2">
              <Button variant="secondary" onClick={() => router.push("/roles")}>
                {t("action.cancel")}
              </Button>
              <Button disabled={submitting} onClick={handleSubmit}>
                <SquarePen className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                {submitting ? t("common.saving") : t("action.save_data")}
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </PageShell>
  );
}

export default function EditRolePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">{t("common.loading")}</p>}>
      <EditRoleContent />
    </Suspense>
  );
}
