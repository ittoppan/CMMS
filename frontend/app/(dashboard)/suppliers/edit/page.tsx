"use client";

// suppliers/edit — migrate ui kit (PageShell, ui/Card, ui/Input, ui/Textarea, ui/Switch)
// business logic ครบเดิม: GET/PUT suppliers.php?id=, validation

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
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, SquarePen } from "lucide-react";

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
      setError(t("msg.supplier_id_missing"));
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
          setError(t("msg.supplier_not_found"));
        }
      })
      .catch(e => setError(t("msg.load_error")))
      .finally(() => setLoadingData(false));
  }, [supplierId]);

  const handleSubmit = async () => {
    if (!name || !code) {
      setError(t("msg.manufacturer_code_name_required"));
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
        setError(json.error || t("msg.update_error"));
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
        title={t("msg.update_success")}
        message={<>{t("form.supplier_info")} <strong>{name}</strong> {t("msg.updated_successfully")}</>}
        primaryLabel={t("action.back_to_list")}
        onPrimary={() => router.push("/suppliers")}
        onBackdrop={() => router.push("/suppliers")}
      />
    );
  }

  return (
    <PageShell
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "ผู้จำหน่าย", href: "/suppliers" },
        { label: t("form.manufacturer_edit_title") },
      ]}
      title={t("form.manufacturer_edit_title")}
      description={t("hero.manufacturer_edit_desc")}
      actions={
        <Button variant="secondary" onClick={() => router.push("/suppliers")}>
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="supplier-edit-code">
                    {t("form.reference_code")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="supplier-edit-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="supplier-edit-name">
                    {t("field.company_name")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="supplier-edit-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="supplier-edit-contact">{t("field.contact_person")}</Label>
                  <Input
                    id="supplier-edit-contact"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="supplier-edit-phone">{t("field.phone")}</Label>
                  <Input
                    id="supplier-edit-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="supplier-edit-email">{t("field.email")}</Label>
                  <Input
                    id="supplier-edit-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="supplier-edit-tax-id">{t("field.tax_id")}</Label>
                  <Input
                    id="supplier-edit-tax-id"
                    inputMode="numeric"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="supplier-edit-address">{t("field.address")}</Label>
                <Textarea
                  id="supplier-edit-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label id="supplier-edit-status-label">{t("form.usage_status")}</Label>
                <div className="flex items-center gap-3 pt-1">
                  <Switch
                    id="supplier-edit-status"
                    aria-labelledby="supplier-edit-status-label"
                    label={t("field.active")}
                    checked={isActive}
                    onChange={(val: boolean) => setIsActive(val)}
                  />
                  <span className={`text-sm ${isActive ? "font-medium text-[var(--cmms-primary)]" : "text-muted-foreground"}`}>
                    {isActive ? t("form.enabled") : t("form.suspend")}
                  </span>
                </div>
              </div>
            </CardContent>

            <CardFooter className="justify-end gap-2">
              <Button variant="secondary" onClick={() => router.push("/suppliers")}>
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

export default function EditSupplierPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">{t("common.loading")}</p>}>
      <EditSupplierContent />
    </Suspense>
  );
}
